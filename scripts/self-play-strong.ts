import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createGame, play, type Move, type Side } from '../src/game/engine';
import { analyzePosition } from '../src/game/cpu';

const args = process.argv.slice(2);
function arg(name: string, fallback: string) { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]!; }
const games = Number(arg('games', '100'));
const maxPlies = Number(arg('max-plies', '320'));
const baseSeed = Number(arg('seed', '20261114'));
const workers = Math.max(1, Math.min(Number(arg('workers', '8')), os.availableParallelism()));
const output = path.resolve(arg('out', 'reports/self-play-strong-100.json'));
const worker = Number(arg('worker', '-1'));
if (!Number.isInteger(games) || games < 2 || games % 2 || !Number.isInteger(maxPlies) || maxPlies < 2) throw new Error('games must be a positive even number and max-plies >= 2');

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
type Outcome = { id: number; pair: number; senteSeed: number; goteSeed: number; winner: Side | null; reason: string; plies: number; recoveries: number; senteRecoveries: number; goteRecoveries: number; totalNodes: number; totalDepth: number; elapsedMs: number; moves: Move[] };

async function runOne(id: number): Promise<Outcome> {
  const pair = Math.floor(id / 2);
  const seedA = (baseSeed + pair * 2) >>> 0, seedB = (baseSeed + pair * 2 + 1) >>> 0;
  const senteSeed = id % 2 ? seedB : seedA, goteSeed = id % 2 ? seedA : seedB;
  const sources = { sente: rng(senteSeed), gote: rng(goteSeed) };
  let game = createGame({ kingCapture: 'enemy' });
  const start = performance.now();
  let totalNodes = 0, totalDepth = 0;
  while (!game.result && game.log.length < maxPlies) {
    const search = analyzePosition(game.position, { difficulty: 'strong', random: sources[game.position.turn], noise: 1, maxNodes: 32000, timeMs: Infinity, history: game.trail });
    const move = search.move;
    totalNodes += search.nodes; totalDepth += search.depth;
    if (!move) throw new Error(`Game ${id}: no move without an adjudicated result`);
    game = play(game, move);
    if (game.log.length % 10 === 0) await fs.writeFile(`${output}.progress-${worker}.json`, JSON.stringify({ id, plies: game.log.length, elapsedMs: Math.round(performance.now() - start) }));
  }
  return {
    id, pair, senteSeed, goteSeed, winner: game.result?.winner ?? null,
    reason: game.result?.reason ?? 'move-limit', plies: game.log.length,
    recoveries: game.log.filter(r => r.selfCapture).length,
    senteRecoveries: game.log.filter(r => r.selfCapture && r.side === 'sente').length,
    goteRecoveries: game.log.filter(r => r.selfCapture && r.side === 'gote').length,
    totalNodes, totalDepth,
    elapsedMs: Math.round(performance.now() - start), moves: game.log.map(r => r.move),
  };
}

function wilson(success: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.95996398454, phat = success / n;
  const center = (phat + z * z / (2 * n)) / (1 + z * z / n);
  const half = z * Math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n)) / (1 + z * z / n);
  return [center - half, center + half];
}

async function main() {
await fs.mkdir(path.dirname(output), { recursive: true });
if (worker >= 0) {
  const results: Outcome[] = [];
  for (let id = worker; id < games; id += workers) {
    const result = await runOne(id); results.push(result);
    await fs.writeFile(`${output}.part-${worker}.json`, JSON.stringify(results));
    if (games <= 200 || results.length % 25 === 0) console.log(`worker ${worker}: ${results.length} games complete; latest ${id + 1}/${games}, ${result.winner ?? 'draw'} (${result.reason})`);
  }
  await fs.writeFile(`${output}.part-${worker}.json`, JSON.stringify(results));
} else {
  const startedAt = new Date().toISOString();
  await Promise.all(Array.from({ length: workers }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/self-play-strong.ts', ...args, '--workers', String(workers), '--worker', String(index)], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Worker ${index}: ${code}`)));
  })));
  const results = (await Promise.all(Array.from({ length: workers }, async (_, i) => JSON.parse(await fs.readFile(`${output}.part-${i}.json`, 'utf8')) as Outcome[]))).flat().sort((a, b) => a.id - b.id);
  const senteWins = results.filter(r => r.winner === 'sente').length;
  const goteWins = results.filter(r => r.winner === 'gote').length;
  const draws = games - senteWins - goteWins;
  const reasons: Record<string, number> = {};
  results.forEach(r => { reasons[r.reason] = (reasons[r.reason] ?? 0) + 1; });
  // Resample whole seed pairs so the interval respects the paired experiment.
  const scores = Array.from({ length: games / 2 }, (_, i) => {
    const score = (r: Outcome) => r.winner === 'sente' ? 1 : r.winner === 'gote' ? 0 : 0.5;
    return (score(results[i * 2]!) + score(results[i * 2 + 1]!)) / 2;
  });
  const bootstrapRandom = rng(baseSeed ^ 0x2F5D48);
  const bootstrap = Array.from({ length: 10000 }, () => {
    let total = 0;
    for (let i = 0; i < scores.length; i++) total += scores[Math.floor(bootstrapRandom() * scores.length)]!;
    return total / scores.length;
  }).sort((a, b) => a - b);
  const summary = {
    games, senteWins, goteWins, draws, reasons,
    senteWinRate: senteWins / games, goteWinRate: goteWins / games, drawRate: draws / games,
    senteScoreRate: (senteWins + draws / 2) / games,
    senteScorePairBootstrap95: [bootstrap[250], bootstrap[9749]],
    decisiveSenteRate: senteWins + goteWins ? senteWins / (senteWins + goteWins) : null,
    decisiveSenteWilson95Approx: wilson(senteWins, senteWins + goteWins),
    averagePlies: results.reduce((a, r) => a + r.plies, 0) / games,
    averageRecoveries: results.reduce((a, r) => a + r.recoveries, 0) / games,
    totalRecoveries: results.reduce((a, r) => a + r.recoveries, 0),
    averageSenteRecoveries: results.reduce((a, r) => a + r.senteRecoveries, 0) / games,
    averageGoteRecoveries: results.reduce((a, r) => a + r.goteRecoveries, 0) / games,
    gamesWithRecoveries: results.filter(r => r.recoveries > 0).length,
    averageCompletedDepth: results.reduce((a, r) => a + r.totalDepth, 0) / results.reduce((a, r) => a + r.plies, 0),
    uniqueGames: new Set(results.map(r => JSON.stringify(r.moves))).size,
  };
  const report = {
    startedAt, finishedAt: new Date().toISOString(),
    protocol: { rules: { kingCapture: 'enemy' }, engine: 'v1.1.0 strong iterative alpha-beta + quiescence', maxNodes: 32000, maxDepth: 7, timeMs: 'unlimited for reproducibility', randomness: 'seeded root move ordering only; scores unchanged', maxPlies, baseSeed, workers, pairedSeeds: true, initialPosition: 'standard', moveLimitIsExperimentalDraw: true },
    summary, results,
  };
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Saved ${output}`);
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
