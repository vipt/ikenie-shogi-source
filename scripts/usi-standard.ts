import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGame, emptyHand, play, resign, type Position, type Game } from '../src/game/engine';
import { projectRoot, startInstalledEngine } from './lib/installed-usi';
import { moveFromUsi, STANDARD_RULES, toSfen } from './lib/usi-format';
import type { UsiAnalysis } from './lib/usi-engine';

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf('--' + name);
  return index < 0 ? fallback : process.argv[index + 1] ?? '';
}
function integer(name: string, fallback: number, max: number): number {
  const value = Number(argument(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('Invalid --' + name);
  return value;
}
async function main() {
  const mode = argument('mode', 'smoke');
  if (!['smoke', 'selfplay'].includes(mode)) throw new Error('Use --mode smoke or selfplay');
  const movetimeMs = integer('movetime', mode === 'smoke' ? 300 : 100, 60000);
  const maxPlies = integer('max-plies', 256, 1000);
  const engine = await startInstalledEngine();
  const began = Date.now();
  const report: Record<string, unknown> = {
    createdAt: new Date().toISOString(), engine: engine.name, evaluation: 'Hao 2023-05-08',
    rules: STANDARD_RULES, threads: 1, hashMiB: 64, fvScale: 20, book: false,
    enteringKingDeclaration: false, mode, movetimeMs,
  };
  const interrupt = () => { void engine.close(); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    console.log(engine.name + ' + Hao / ' + mode + ' / ' + movetimeMs + 'ms / 1 thread');
    if (mode === 'smoke') {
      const cases: { name: string; game: Game; expectMate?: boolean }[] = [];
      let game = createGame(STANDARD_RULES);
      cases.push({ name: 'initial-sente', game });
      game = play(game, moveFromUsi('7g7f'));
      cases.push({ name: 'opening-gote', game });
      for (const text of ['3c3d', '8h2b+', '3a2b', 'B*8h']) game = play(game, moveFromUsi(text));
      cases.push({ name: 'capture-promotion-drop-history', game });
      const mate: Position = { board: Array(81).fill(null), hands: { sente: emptyHand(), gote: emptyHand() },
        turn: 'sente', rules: STANDARD_RULES };
      mate.board[4] = { kind: 'K', side: 'gote', promoted: false };
      mate.board[76] = { kind: 'K', side: 'sente', promoted: false };
      mate.board[22] = { kind: 'G', side: 'sente', promoted: false };
      mate.hands.sente.G = 1;
      cases.push({ name: 'mate-in-one-with-gold-drop', game: createGame(STANDARD_RULES, mate), expectMate: true });
      const results = [];
      for (const c of cases) {
        engine.newGame();
        const analysis = await engine.analyze(c.game, movetimeMs);
        if (!analysis.move) throw new Error('Unexpected resignation in smoke test');
        const next = play(c.game, analysis.move);
        if (c.expectMate && next.result?.reason !== 'mate') throw new Error('Engine missed mate in one');
        if (next.log.some(m => m.selfCapture)) throw new Error('Unexpected self-capture');
        results.push({ name: c.name, sfen: toSfen(c.game.position, c.game.log.length + 1),
          history: c.game.log, analysis, result: next.result, legal: true });
        console.log(c.name + ': ' + analysis.bestmove + ', depth ' + analysis.depth + ', nodes ' + analysis.nodes);
      }
      report.cases = results;
      report.passed = true;
    } else {
      let game = createGame(STANDARD_RULES);
      const analyses: UsiAnalysis[] = [];
      while (!game.result && game.log.length < maxPlies) {
        const analysis = await engine.analyze(game, movetimeMs);
        analyses.push(analysis);
        game = analysis.move ? play(game, analysis.move) : resign(game);
        if (game.log.length % 20 === 0 || game.result) {
          console.log(game.log.length + ' plies: ' + (game.log.at(-1)?.label ?? 'resign') + ' / depth ' + analysis.depth);
        }
      }
      // Independently replay the stored moves through the app rules engine.
      let replay = createGame(STANDARD_RULES);
      for (const entry of game.log) replay = play(replay, entry.move);
      if (toSfen(replay.position) !== toSfen(game.position)) throw new Error('Replay mismatch');
      if (game.log.some(m => m.selfCapture)) throw new Error('Unexpected self-capture');
      report.maxPlies = maxPlies;
      report.plies = game.log.length;
      report.result = game.result ?? { winner: null, reason: 'ply-limit', adjudicated: true };
      report.moves = game.log;
      report.analyses = analyses;
      report.finalSfen = toSfen(game.position, game.log.length + 1);
      report.replayVerified = true;
      report.selfCaptures = 0;
      console.log('Result: ' + JSON.stringify(report.result));
    }
    report.elapsedMs = Date.now() - began;
    report.transcript = engine.transcript;
    const output = resolve(projectRoot, 'reports/usi-' + mode + '.json');
    await mkdir(resolve(projectRoot, 'reports'), { recursive: true });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log('Saved: ' + output);
  } finally {
    await engine.close();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });


