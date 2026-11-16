import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyUnchecked, createGame, emptyHand, initialPosition, isInCheck, legalMoves,
  play, positionKey, resign, sameMove, undo, type Kind, type Move, type Position, type Side,
} from '../src/game/engine';
import { chooseCpuMove } from '../src/game/cpu';

function blank(turn: Side = 'sente'): Position {
  const p: Position = { board: Array(81).fill(null), hands: { sente: emptyHand(), gote: emptyHand() }, turn, rules: { kingCapture: 'enemy' } };
  put(p, 76, 'K'); put(p, 4, 'K', 'gote'); return p;
}
function put(p: Position, at: number, kind: Kind, side: Side = 'sente', promoted = false) { p.board[at] = { kind, side, promoted }; }
const can = (p: Position, m: Move) => legalMoves(p).some(v => sameMove(v, m));
const move = (from: number, to: number, promote = false): Move => ({ from, to, promote });

test('initial setup has forty pieces, correct rook/bishop positions and two kings', () => {
  const p = initialPosition();
  assert.equal(p.board.filter(Boolean).length, 40);
  assert.equal(p.board[70]?.kind, 'R'); assert.equal(p.board[64]?.kind, 'B');
  assert.equal(p.board[10]?.kind, 'R'); assert.equal(p.board[16]?.kind, 'B');
  assert.equal(isInCheck(p, 'sente'), false); assert.equal(isInCheck(p, 'gote'), false);
});
test('rook recovers own pawn without changing its owner', () => {
  const game = play(createGame(), move(70, 61));
  assert.equal(game.position.board[61]?.kind, 'R'); assert.equal(game.position.board[70], null);
  assert.equal(game.position.hands.sente.P, 1); assert.equal(game.position.hands.gote.P, 0);
  assert.equal(game.log[0]?.selfCapture, true); assert.equal(game.position.turn, 'gote');
});
test('sliders stop at their own pieces, with no jumping through a recovery', () => {
  const p = initialPosition(); assert.equal(can(p, move(70, 52)), false);
  assert.equal(can(p, move(64, 54)), true); assert.equal(can(p, move(64, 44)), false);
});
test('default king cannot recover friendly gold but can capture an enemy', () => {
  const p = blank(); put(p, 67, 'G'); assert.equal(can(p, move(76, 67)), false);
  put(p, 67, 'G', 'gote'); assert.equal(can(p, move(76, 67)), true);
});
test('both optional king rules work and never permit adjacent kings', () => {
  const p = blank(); put(p, 67, 'G'); p.rules.kingCapture = 'all'; assert.ok(can(p, move(76, 67)));
  p.rules.kingCapture = 'none'; put(p, 67, 'G', 'gote'); assert.equal(can(p, move(76, 67)), false);
  p.board[4] = null; put(p, 58, 'K', 'gote'); p.board[67] = null;
  assert.equal(can(p, move(76, 67)), false);
});
test('neither friendly nor opposing kings can ever be captured', () => {
  const p = blank(); put(p, 67, 'R');
  assert.equal(can(p, move(67, 76)), false); assert.equal(can(p, move(67, 4)), false);
});
test('captured promoted friendly and enemy pieces both demote in hand', () => {
  for (const side of ['sente', 'gote'] as const) {
    const p = blank(); put(p, 40, 'R'); put(p, 31, 'S', side, true);
    const next = play(createGame(p.rules, p), move(40, 31)).position;
    assert.equal(next.hands.sente.S, 1); assert.equal(next.board[31]?.promoted, false);
  }
});
test('optional promotion entering, leaving, and moving within enemy camp', () => {
  for (const [from, to] of [[31, 22], [22, 31], [22, 13]]) {
    const p = blank(); put(p, from!, 'R');
    assert.ok(can(p, move(from!, to!, true))); assert.ok(can(p, move(from!, to!, false)));
  }
});
test('forced promotion on terminal pawn/lance and knight ranks', () => {
  for (const [kind, from, to] of [['P', 10, 1], ['L', 19, 1], ['N', 28, 9]] as const) {
    const p = blank(); put(p, from, kind);
    assert.equal(can(p, move(from, to)), false); assert.ok(can(p, move(from, to, true)));
  }
});
test('promotion outside camp, king promotion and gold promotion are illegal', () => {
  const p = blank(); put(p, 40, 'R'); assert.equal(can(p, move(40, 49, true)), false);
  assert.equal(can(p, move(76, 67, true)), false);
  put(p, 22, 'G'); assert.equal(can(p, move(22, 13, true)), false);
});
test('gote movement, promotion and dead drop ranks are mirrored', () => {
  const p = blank('gote'); put(p, 67, 'P', 'gote');
  p.board[76] = null; put(p, 80, 'K');
  assert.ok(can(p, move(67, 76, true))); assert.equal(can(p, move(67, 58)), false);
  p.hands.gote.N = 1; assert.equal(can(p, { drop: 'N', to: 70 }), false);
});
test('promoted minor pieces move as gold, promoted rook and bishop gain king steps', () => {
  const p = blank(); put(p, 40, 'P', 'sente', true);
  assert.ok(can(p, move(40, 49))); assert.equal(can(p, move(40, 50)), false);
  put(p, 40, 'R', 'sente', true); assert.ok(can(p, move(40, 30))); assert.equal(can(p, move(40, 20)), false);
  put(p, 40, 'B', 'sente', true); assert.ok(can(p, move(40, 31))); assert.equal(can(p, move(40, 22)), false);
});
test('knights jump over pieces', () => {
  const p = initialPosition(); assert.ok(can(p, move(73, 54))); assert.ok(can(p, move(73, 56)));
});
test('nifu forbids duplicate unpromoted pawn in same file, not tokin', () => {
  const p = blank(); p.hands.sente.P = 1; put(p, 58, 'P');
  assert.equal(can(p, { drop: 'P', to: 40 }), false);
  p.board[58]!.promoted = true; assert.ok(can(p, { drop: 'P', to: 40 }));
});
test('drops need a held piece, an empty square and a future move', () => {
  const p = blank(); assert.equal(can(p, { drop: 'G', to: 40 }), false);
  p.hands.sente.G = 1; assert.ok(can(p, { drop: 'G', to: 40 })); assert.equal(can(p, { drop: 'G', to: 76 }), false);
  for (const kind of ['P', 'L', 'N'] as const) { p.hands.sente[kind] = 1; assert.equal(can(p, { drop: kind, to: 1 }), false); }
  assert.equal(can(p, { drop: 'N', to: 10 }), false);
});
test('moving a pinned piece, including recovering another friendly piece, is illegal', () => {
  const p = blank(); p.board[4] = null; put(p, 0, 'K', 'gote'); put(p, 4, 'R', 'gote'); put(p, 67, 'G'); put(p, 66, 'S');
  assert.equal(can(p, move(67, 66)), false); assert.ok(can(p, move(67, 58)));
});
test('king cannot take a protected enemy piece', () => {
  const p = blank(); put(p, 67, 'P', 'gote'); put(p, 58, 'G', 'gote');
  assert.equal(can(p, move(76, 67)), false);
});
test('check must be answered, including by a blocking drop', () => {
  const p = blank(); p.board[4] = null; put(p, 0, 'K', 'gote'); put(p, 4, 'R', 'gote'); p.hands.sente.G = 1;
  assert.ok(isInCheck(p, 'sente')); assert.ok(can(p, { drop: 'G', to: 40 })); assert.equal(can(p, { drop: 'G', to: 39 }), false);
});
function pawnMate(): Position {
  const p = blank(); p.hands.sente.P = 1;
  put(p, 3, 'L', 'gote'); put(p, 5, 'L', 'gote'); put(p, 12, 'P', 'gote'); put(p, 14, 'P', 'gote');
  put(p, 22, 'G'); return p;
}
test('uchifuzume forbids a mating pawn drop', () => {
  const p = pawnMate(); assert.equal(can(p, { drop: 'P', to: 13 }), false);
});
test('a checking pawn drop with a king escape remains legal', () => {
  const p = pawnMate(); p.board[3] = null; assert.ok(can(p, { drop: 'P', to: 13 }));
});
test('optional king self-capture escape is included in pawn-drop mate detection', () => {
  const p = pawnMate(); p.rules.kingCapture = 'all'; assert.ok(can(p, { drop: 'P', to: 13 }));
});
test('a pawn moved on the board may deliver mate', () => {
  const p = pawnMate(); p.board[22] = null; put(p, 22, 'P'); put(p, 21, 'G');
  const game = play(createGame(p.rules, p), move(22, 13));
  assert.deepEqual(game.result, { winner: 'sente', reason: 'mate' });
});
test('fourfold repetition includes side to move and hand contents', () => {
  const p = blank(); let game = createGame(p.rules, p);
  for (let cycle = 0; cycle < 3; cycle++) for (const m of [move(76, 75), move(4, 5), move(75, 76), move(5, 4)]) game = play(game, m);
  assert.deepEqual(game.result, { winner: null, reason: 'repetition' });
  const other = { ...p, turn: 'gote' as const }; assert.notEqual(positionKey(p), positionKey(other));
});
test('perpetual checking side loses on fourfold repetition', () => {
  const p = blank('gote'); put(p, 22, 'R'); let game = createGame(p.rules, p);
  for (let cycle = 0; cycle < 3; cycle++) for (const m of [move(4, 5), move(22, 23), move(5, 4), move(23, 22)]) game = play(game, m);
  assert.deepEqual(game.result, { winner: 'gote', reason: 'perpetual-check' });
});
test('undo restores board, hands, turn, repetition history and result', () => {
  const start = createGame(); const game = play(start, move(70, 61));
  const restored = undo(resign(game)); assert.deepEqual(restored, start);
});
test('resignation ends play and illegal moves never mutate the game', () => {
  const game = createGame(); const key = positionKey(game.position);
  assert.throws(() => play(game, move(70, 0))); assert.equal(positionKey(game.position), key);
  assert.throws(() => play(resign(game), move(70, 61)));
});
test('legal playout conserves forty pieces and never leaves the moving king in check', () => {
  let game = createGame(); let seed = 592;
  for (let ply = 0; ply < 180 && !game.result; ply++) {
    const moves = legalMoves(game.position); seed = (seed * 1664525 + 1013904223) >>> 0;
    const move = moves[seed % moves.length]!; const side = game.position.turn;
    game = play(game, move);
    const total = game.position.board.filter(Boolean).length + Object.values(game.position.hands).flatMap(Object.values).reduce((a, b) => a + b, 0);
    assert.equal(total, 40); assert.equal(isInCheck(game.position, side), false);
    assert.equal(game.position.board.filter(p => p?.kind === 'K').length, 2);
  }
});
test('CPU returns a legal move reproducibly with a fixed random source', () => {
  const p = initialPosition(); const options = { random: () => 0.5, timeMs: Infinity, maxNodes: 2500 };
  const a = chooseCpuMove(p, options); assert.ok(a); assert.ok(can(p, a)); assert.deepEqual(a, chooseCpuMove(p, options));
  const next = applyUnchecked(p, a); const b = chooseCpuMove(next, options); assert.ok(b); assert.ok(can(next, b));
});

test('move generation and CPU evaluation are symmetric under a 180-degree color swap', () => {
  const p = initialPosition();
  const rotateMove = (m: Move): Move => 'drop' in m ? { drop: m.drop, to: 80 - m.to }
    : { from: 80 - m.from, to: 80 - m.to, promote: m.promote };
  const rotate = (p: Position): Position => ({
    ...p, board: p.board.slice().reverse().map(v => v ? { ...v, side: v.side === 'sente' ? 'gote' : 'sente' } : null),
    hands: { sente: { ...p.hands.gote }, gote: { ...p.hands.sente } }, turn: p.turn === 'sente' ? 'gote' : 'sente',
  });
  let position = p;
  for (let i = 0; i < 8; i++) {
    const rotated = rotate(position);
    const actual = legalMoves(rotated).map(m => JSON.stringify(m)).sort();
    const expected = legalMoves(position).map(m => JSON.stringify(rotateMove(m))).sort();
    assert.deepEqual(actual, expected);
    const move = chooseCpuMove(position, { random: () => 0.5, timeMs: Infinity, maxNodes: 2500 })!;
    assert.deepEqual(chooseCpuMove(rotated, { random: () => 0.5, timeMs: Infinity, maxNodes: 2500 }), rotateMove(move));
    position = applyUnchecked(position, move);
  }
});
