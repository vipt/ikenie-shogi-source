import fs from 'node:fs';
import { createGame, play, moveLabel, squareLabel, pieceLabel, attackedSquares, isInCheck, positionKey, legalMoves, opposite, type Move } from '../src/game/engine';

const report = JSON.parse(fs.readFileSync('reports/self-play-strong-50.json', 'utf8'));
const events: any[] = [];
const openings: any[] = [];
for (const row of report.results) {
  let game = createGame(report.protocol.rules);
  const moves = row.moves as Move[];
  const gameEvents: any[] = [];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]!, p = game.position, target = p.board[m.to];
    if ('from' in m && target?.side === p.turn && target.kind === 'B') {
      const nextDrop = moves.findIndex((n, j) => j > i && j % 2 === i % 2 && 'drop' in n && n.drop === 'B');
      const enemyAttackers = p.board.flatMap((piece, from) => piece && piece.side !== p.turn && attackedSquares(p, from).includes(m.to) ? [`${squareLabel(from)}${pieceLabel(piece)}`] : []);
      const event = {
        gameId: row.id + 1, ply: i + 1, side: p.turn, move: moveLabel(p, m), from: squareLabel(m.from), to: squareLabel(m.to), capturer: pieceLabel(p.board[m.from]!), promotedBishop: target.promoted,
        enemyAttackers, wasInCheck: isInCheck(p, p.turn), bishopsAlreadyInHand: p.hands[p.turn].B,
        positionBefore: positionKey(p), opponentCouldCaptureBishop: legalMoves({ ...p, turn: opposite(p.turn) }).some(enemyMove => 'from' in enemyMove && enemyMove.to === m.to),
        nextBishopDropPly: nextDrop >= 0 ? nextDrop + 1 : null,
        ownTurnsUntilNextBishopDrop: nextDrop >= 0 ? (nextDrop - i) / 2 : null,
        nextBishopDropSquare: nextDrop >= 0 ? squareLabel(moves[nextDrop]!.to) : null,
        historyBefore: game.log.slice(-4).map((r, j) => ({ ply: game.log.length - Math.min(4, game.log.length) + j + 1, move: r.label })),
      };
      gameEvents.push(event); events.push(event);
    }
    game = play(game, m);
  }
  for (const event of gameEvents) {
    event.followingMoves = game.log.slice(event.ply, event.ply + 6).map((r, j) => ({ ply: event.ply + j + 1, move: r.label }));
    if (event.nextBishopDropPly) {
      const nextP = game.trail[event.nextBishopDropPly]!.position;
      event.nextBishopDropChecks = isInCheck(nextP, nextP.turn);
    }
  }
  openings.push({ gameId: row.id + 1, moves: game.log.slice(0, 12).map((r, i) => `${i + 1} ${r.label}`) });
}
function countBy(fn: (e: any) => string) { const counts: Record<string, number> = {}; for (const e of events) { const key = fn(e); counts[key] = (counts[key] ?? 0) + 1; } return counts; }
let commonOpeningPlies = 0;
while (report.results.every((r: any) => r.moves[commonOpeningPlies] && JSON.stringify(r.moves[commonOpeningPlies]) === JSON.stringify(report.results[0].moves[commonOpeningPlies]))) commonOpeningPlies++;
const summary = {
  total: events.length, commonOpeningPlies, uniqueRecoveryPositions: new Set(events.map(e => e.positionBefore)).size,
  byPly: countBy(e => String(e.ply)), byCapturer: countBy(e => e.capturer),
  byPattern: countBy(e => `${e.side} ${e.capturer} ${e.from}→${e.to}`),
  firstTenPlies: events.filter(e => e.ply <= 10).length,
  promotedBishops: events.filter(e => e.promotedBishop).length,
  attackedAtRecovery: events.filter(e => e.enemyAttackers.length > 0).length,
  whileInCheck: events.filter(e => e.wasInCheck).length,
  nextDropDelayOwnTurns: countBy(e => String(e.ownTurnsUntilNextBishopDrop)),
  nextDropSquares: countBy(e => `${e.side} ${e.nextBishopDropSquare}`),
};
fs.writeFileSync('reports/bishop-recovery-analysis.json', JSON.stringify({ summary, events, openings }, null, 2));
console.log(JSON.stringify({ summary, examples: [events[0], events[1], events.find(e => e.ply > 10)] }, null, 2));
