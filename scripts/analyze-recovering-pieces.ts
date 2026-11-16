import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGame, play, pieceLabel, type Kind, type Move } from '../src/game/engine';

const source = JSON.parse(fs.readFileSync('reports/self-play-strong-50.json', 'utf8'));
const byKind: Partial<Record<Kind, number>> = {};
const byDisplayedPiece: Record<string, number> = {};
const bySide: Record<string, Partial<Record<Kind, number>>> = { sente: {}, gote: {} };
let total = 0;
for (const row of source.results) {
  let game = createGame(source.protocol.rules);
  for (const move of row.moves as Move[]) {
    const p = game.position;
    if ('from' in move && p.board[move.to]?.side === p.turn) {
      const capturer = p.board[move.from]!;
      byKind[capturer.kind] = (byKind[capturer.kind] ?? 0) + 1;
      const label = pieceLabel(capturer);
      byDisplayedPiece[label] = (byDisplayedPiece[label] ?? 0) + 1;
      bySide[p.turn]![capturer.kind] = (bySide[p.turn]![capturer.kind] ?? 0) + 1;
      total++;
    }
    game = play(game, move);
  }
}
assert.equal(total, source.summary.totalRecoveries);
const result = { games: source.results.length, total, definition: 'moving piece that captures a friendly piece; type and promotion status immediately before the move', byKind, byDisplayedPiece, bySide,
  percentagesByKind: Object.fromEntries(Object.entries(byKind).map(([k, n]) => [k, +(100 * n / total).toFixed(2)])) };
fs.writeFileSync('reports/recovering-piece-analysis.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
