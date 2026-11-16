import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createGame, play, type Move } from '../src/game/engine';

const source = JSON.parse(fs.readFileSync('reports/self-play-strong-50.json', 'utf8'));
const stages = ['early', 'middle', 'late'].map(name => ({ name, moves: 0, recoveries: 0, sente: 0, gote: 0 }));
const games: object[] = [];
let first23PliesRecoveries = 0;
for (const row of source.results) {
  let game = createGame(source.protocol.rules);
  const counts = [0, 0, 0];
  for (let i = 0; i < row.moves.length; i++) {
    const move = row.moves[i] as Move;
    const ply = i + 1, totalPlies = row.moves.length;
    const stageIndex = ply * 3 <= totalPlies ? 0 : ply * 3 <= totalPlies * 2 ? 1 : 2;
    const stage = stages[stageIndex]!;
    stage.moves++;
    if ('from' in move && game.position.board[move.to]?.side === game.position.turn) {
      stage.recoveries++; stage[game.position.turn]++; counts[stageIndex]!++;
      if (ply <= 23) first23PliesRecoveries++;
    }
    game = play(game, move);
  }
  assert.equal(counts.reduce((a, b) => a + b), row.recoveries);
  games.push({ id: row.id + 1, plies: row.plies, earlyEndsAt: Math.floor(row.plies / 3), middleEndsAt: Math.floor(row.plies * 2 / 3), recoveries: counts });
}
const total = stages.reduce((n, s) => n + s.recoveries, 0);
assert.equal(total, source.summary.totalRecoveries);
const result = {
  games: source.results.length, totalRecoveries: total,
  definition: 'Each game split by total plies: early ply*3<=N, middle ply*3<=2N, late remaining. Descriptive thirds, not tactical phase classification. Includes the 320-ply truncated draw.',
  stages: stages.map(s => ({ ...s, percentageOfRecoveries: +(s.recoveries / total * 100).toFixed(2), averagePerGame: s.recoveries / source.results.length, recoveryRatePerMove: +(s.recoveries / s.moves * 100).toFixed(2) })),
  first23PliesRecoveries, first23Percentage: +(first23PliesRecoveries / total * 100).toFixed(2), perGame: games,
};
fs.writeFileSync('reports/recovery-timing-analysis.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, perGame: undefined }, null, 2));
