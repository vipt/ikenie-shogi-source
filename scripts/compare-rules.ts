import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createGame, play, opposite, type Move, type Side } from '../src/game/engine';
import { analyzePosition } from '../src/game/cpu';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1]! : fallback;
const games = Number(arg('games', '20')), maxPlies = Number(arg('max-plies', '320'));
const nodes = Number(arg('nodes', '32000')), baseSeed = Number(arg('seed', '20261114'));
const workers = Math.min(Number(arg('workers', '4')), os.availableParallelism(), games / 2);
const worker = Number(arg('worker', '-1'));
const output = path.resolve(arg('out', 'reports/asymmetric-rules-20.json'));
if (!Number.isInteger(games) || games < 2 || games % 2 || !Number.isInteger(workers) || workers < 1 || !Number.isInteger(nodes) || nodes < 1) throw new Error('Invalid experiment parameters');
try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* Not supported on every host. */ }
function rng(seed: number) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
type Record = {
  id: number; pair: number; variantSide: Side; variantSeed: number; normalSeed: number;
  winner: Side | null; winnerRule: 'variant' | 'normal' | 'draw'; reason: string;
  plies: number; recoveries: number; normalRecoveries: number; elapsedMs: number;
  depthTotals: { variant: number; normal: number }; moveTotals: { variant: number; normal: number };
  moves: Move[];
};
async function runOne(id: number): Promise<Record> {
  const pair = Math.floor(id / 2), variantSide: Side = id % 2 ? 'gote' : 'sente';
  const variantSeed = baseSeed + pair * 2, normalSeed = variantSeed + 1;
  const random = { variant: rng(variantSeed), normal: rng(normalSeed) };
  let game = createGame({ kingCapture: 'enemy', selfCapture: variantSide });
  const start = Date.now(), depthTotals = { variant: 0, normal: 0 }, moveTotals = { variant: 0, normal: 0 };
  while (!game.result && game.log.length < maxPlies) {
    const role = game.position.turn === variantSide ? 'variant' : 'normal';
    const search = analyzePosition(game.position, { difficulty: 'strong', maxNodes: nodes, maxDepth: 7, timeMs: Infinity, random: random[role], noise: 1, history: game.trail });
    assert.ok(search.move, 'No legal move without a terminal result');
    if (role === 'normal' && 'from' in search.move) assert.notEqual(game.position.board[search.move.to]?.side, game.position.turn, 'Standard player must not recover a friendly piece');
    depthTotals[role] += search.depth; moveTotals[role]++;
    game = play(game, search.move);
    if (game.log.length % 10 === 0) await fs.writeFile(`${output}.progress-${worker}.json`, JSON.stringify({ id, pair, variantSide, plies: game.log.length, elapsedMs: Date.now() - start }));
  }
  const winner = game.result?.winner ?? null;
  const normalRecoveries = game.log.filter(r => r.selfCapture && r.side !== variantSide).length;
  assert.equal(normalRecoveries, 0);
  return { id, pair, variantSide, variantSeed, normalSeed, winner, winnerRule: winner ? winner === variantSide ? 'variant' : 'normal' : 'draw', reason: game.result?.reason ?? 'move-limit', plies: game.log.length, recoveries: game.log.filter(r => r.selfCapture).length, normalRecoveries, elapsedMs: Date.now() - start, depthTotals, moveTotals, moves: game.log.map(r => r.move) };
}
async function main() {
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (worker >= 0) {
    const results: Record[] = [];
    for (let pair = worker; pair < games / 2; pair += workers) {
      for (const id of [pair * 2, pair * 2 + 1]) {
        const result = await runOne(id); results.push(result);
        await fs.writeFile(`${output}.part-${worker}.json`, JSON.stringify(results));
        console.log(`game ${id + 1}/${games}: variant ${result.variantSide}, winner ${result.winnerRule}, ${result.reason}, ${result.plies} plies`);
      }
    }
    return;
  }
  const startedAt = new Date().toISOString();
  const hashes = Object.fromEntries(await Promise.all(['src/game/engine.ts', 'src/game/cpu-search.ts', 'scripts/compare-rules.ts'].map(async f => [f, createHash('sha256').update(await fs.readFile(f)).digest('hex')])));
  await Promise.all(Array.from({ length: workers }, (_, i) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/compare-rules.ts', ...args, '--workers', String(workers), '--worker', String(i)], { windowsHide: true, stdio: 'inherit' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`worker ${i}: ${code}`)));
  })));
  const results: Record[] = (await Promise.all(Array.from({ length: workers }, async (_, i) => JSON.parse(await fs.readFile(`${output}.part-${i}.json`, 'utf8'))))).flat().sort((a, b) => a.id - b.id);
  assert.equal(results.length, games); assert.equal(new Set(results.map(r => r.id)).size, games);
  // Independently replay every recorded game before publishing the result.
  for (const r of results) {
    let game = createGame({ kingCapture: 'enemy', selfCapture: r.variantSide });
    for (const m of r.moves) game = play(game, m);
    assert.equal(game.result?.winner ?? null, r.winner);
    assert.equal(game.result?.reason ?? 'move-limit', r.reason);
    assert.equal(game.log.filter(m => m.selfCapture).length, r.recoveries);
    assert.ok(game.log.every(m => !m.selfCapture || m.side === r.variantSide));
    if (!game.result) assert.equal(game.log.length, maxPlies);
  }
  const stats = (rows: Record[]) => {
    const variantWins = rows.filter(r => r.winnerRule === 'variant').length, normalWins = rows.filter(r => r.winnerRule === 'normal').length;
    let commonOpeningPlies = 0;
    while (rows.length && rows.every(r => r.moves[commonOpeningPlies] && JSON.stringify(r.moves[commonOpeningPlies]) === JSON.stringify(rows[0]!.moves[commonOpeningPlies]))) commonOpeningPlies++;
    return { games: rows.length, variantWins, normalWins, draws: rows.length - variantWins - normalWins, variantWinRate: variantWins / rows.length, normalWinRate: normalWins / rows.length, variantDecisiveWinRate: variantWins + normalWins ? variantWins / (variantWins + normalWins) : null, averageRecoveries: rows.reduce((n, r) => n + r.recoveries, 0) / rows.length, averagePlies: rows.reduce((n, r) => n + r.plies, 0) / rows.length, uniqueGames: new Set(rows.map(r => JSON.stringify(r.moves))).size, commonOpeningPlies };
  };
  const depthByRule = Object.fromEntries((['variant', 'normal'] as const).map(role => [role, results.reduce((n, r) => n + r.depthTotals[role], 0) / results.reduce((n, r) => n + r.moveTotals[role], 0)]));
  const summary = { overall: stats(results), variantSente: stats(results.filter(r => r.variantSide === 'sente')), variantGote: stats(results.filter(r => r.variantSide === 'gote')), averageCompletedDepth: depthByRule, totalNormalRecoveries: results.reduce((n, r) => n + r.normalRecoveries, 0) };
  const report = { startedAt, finishedAt: new Date().toISOString(), protocol: { games, pairs: games / 2, workers, initialPosition: 'standard', kingCapture: 'enemy', variantRule: 'friendly captures allowed for non-king pieces', normalRule: 'friendly captures forbidden', sameCpu: 'v1.1.0 strong search and evaluation', maxNodes: nodes, maxDepth: 7, timeMs: 'unlimited for reproducibility', randomness: 'seeded root move ordering only', baseSeed, seedPairing: 'seeds stay with their rule when colors swap', maxPlies, moveLimitIsExperimentalDraw: true, ruleRestrictionAppliedThroughoutSearch: true }, summary, audit: { replayedGames: games, sourceSha256: hashes }, results };
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
