import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createGame, play, type Move, type Side } from '../src/game/engine';
import { analyzePosition } from '../src/game/cpu';
import { chooseCpuMove as legacy } from '../src/game/cpu-legacy';

const args = process.argv.slice(2);
const arg = (name: string, fallback: string) => args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1]! : fallback;
const games = Number(arg('games', '20')), workers = Number(arg('workers', '4')), worker = Number(arg('worker', '-1'));
const nodes = Number(arg('nodes', '32000')), maxPlies = Number(arg('max-plies', '240'));
const output = arg('out', 'reports/cpu-comparison.json');
function rng(seed: number) { let state = seed; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
type Record = { id: number; newSide: Side; winner: Side | null; winnerEngine: string; reason: string; plies: number; seconds: number; newMoves: number; totalNodes: number; totalDepth: number; moves: Move[] };
async function main() {
  await fs.mkdir('reports', { recursive: true });
  if (worker >= 0) {
    const results: Record[] = [];
    for (let id = worker; id < games; id += workers) {
      const newSide: Side = id % 2 ? 'gote' : 'sente', random = rng(20261114 + Math.floor(id / 2));
      let game = createGame(), totalNodes = 0, totalDepth = 0, newMoves = 0;
      const start = Date.now();
      while (!game.result && game.log.length < maxPlies) {
        let move: Move | null;
        if (game.position.turn === newSide) {
          const result = analyzePosition(game.position, { difficulty: 'strong', maxNodes: nodes, timeMs: Infinity, history: game.trail });
          move = result.move; totalNodes += result.nodes; totalDepth += result.depth; newMoves++;
        } else move = legacy(game.position, { random, noise: 6, beamWidth: 14 });
        if (!move) throw new Error('No move without a terminal result');
        game = play(game, move);
      }
      const winner = game.result?.winner ?? null;
      const record: Record = { id, newSide, winner, winnerEngine: winner ? winner === newSide ? 'new' : 'legacy' : 'draw', reason: game.result?.reason ?? 'move-limit', plies: game.log.length, seconds: (Date.now() - start) / 1000, newMoves, totalNodes, totalDepth, moves: game.log.map(r => r.move) };
      results.push(record);
      await fs.writeFile(`${output}.part-${worker}.json`, JSON.stringify(results));
      console.log(`game ${id + 1}/${games}: ${record.winnerEngine}, ${record.reason}, ${record.plies} plies, ${record.seconds}s`);
    }
  } else {
    await Promise.all(Array.from({ length: workers }, (_, i) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/compare-cpu.ts', ...args, '--worker', String(i)], { stdio: 'inherit', windowsHide: true });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`worker ${i}: ${code}`)));
    })));
    const results: Record[] = (await Promise.all(Array.from({ length: workers }, async (_, i) => JSON.parse(await fs.readFile(`${output}.part-${i}.json`, 'utf8'))))).flat().sort((a, b) => a.id - b.id);
    const wins = results.filter(r => r.winnerEngine === 'new').length, losses = results.filter(r => r.winnerEngine === 'legacy').length;
    const report = { date: '2026-11-14', protocol: { games, pairedColors: true, maxPlies, newCpu: { maxNodes: nodes, maxDepth: 7, timeMs: 'unlimited for reproducibility' }, oldCpu: 'v1.0.1, 2-ply beam width 14, noise 6' }, summary: { wins, losses, draws: games - wins - losses, winRate: wins / games, averageCompletedDepth: results.reduce((s, r) => s + r.totalDepth, 0) / results.reduce((s, r) => s + r.newMoves, 0) }, results };
    await fs.writeFile(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summary, null, 2));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
