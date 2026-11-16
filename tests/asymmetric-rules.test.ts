import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, initialPosition, legalMoves, legalMoveIterator, play, sameMove, positionKey, emptyHand, type Move, type Position, type Side } from '../src/game/engine';
import { analyzePosition } from '../src/game/cpu';
const move = (from: number, to: number): Move => ({ from, to, promote: false });
const can = (p: Position, m: Move) => legalMoves(p).some(v => sameMove(v, m));

test('standard side has no friendly captures; variant side retains them across turns', () => {
  for (const variant of ['sente', 'gote'] as const) {
    let game = createGame({ kingCapture: 'enemy', selfCapture: variant });
    for (const side of ['sente', 'gote'] as const) {
      const p = { ...game.position, turn: side };
      const friendly = legalMoves(p).filter(m => 'from' in m && p.board[m.to]?.side === side);
      assert.equal(friendly.length > 0, side === variant);
      assert.deepEqual([...legalMoveIterator(p)], legalMoves(p));
      if (side !== variant) assert.equal(legalMoves(p).length, 30);
    }
    game = play(game, move(54, 45));
    assert.equal(game.position.rules.selfCapture, variant);
    assert.equal(can(game.position, move(10, 19)), variant === 'gote');
    if (variant === 'sente') assert.throws(() => play(game, move(10, 19)));
  }
});

test('both standard sides prohibit own captures while defaults remain unchanged', () => {
  const p = initialPosition();
  assert.deepEqual(legalMoves(p), legalMoves(initialPosition({ kingCapture: 'enemy', selfCapture: 'both' })));
  assert.equal(positionKey(p), positionKey(initialPosition({ kingCapture: 'enemy', selfCapture: 'both' })));
  for (const turn of ['sente', 'gote'] as const) {
    const normal = { ...initialPosition({ kingCapture: 'enemy', selfCapture: 'none' }), turn };
    assert.equal(legalMoves(normal).length, 30);
    assert.ok(legalMoves(normal).every(m => !('from' in m) || normal.board[m.to]?.side !== turn));
  }
  assert.equal(new Set(['sente', 'gote', 'none'].map(selfCapture => positionKey(initialPosition({ kingCapture: 'enemy', selfCapture: selfCapture as Side | 'none' })))).size, 3);
});

test('pawn-drop mate checks the actual defending side permission', () => {
  const p: Position = { board: Array(81).fill(null), hands: { sente: emptyHand(), gote: emptyHand() }, turn: 'sente', rules: { kingCapture: 'all', selfCapture: 'sente' } };
  for (const [square, kind, side] of [[76, 'K', 'sente'], [4, 'K', 'gote'], [3, 'L', 'gote'], [5, 'L', 'gote'], [12, 'P', 'gote'], [14, 'P', 'gote'], [22, 'G', 'sente']] as const) p.board[square] = { kind, side, promoted: false };
  p.hands.sente.P = 1;
  assert.equal(can(p, { drop: 'P', to: 13 }), false);
  p.rules.selfCapture = 'gote';
  assert.equal(can(p, { drop: 'P', to: 13 }), true);
});

test('standard side can capture enemies and CPU searches with the same rules', () => {
  const p = initialPosition({ kingCapture: 'enemy', selfCapture: 'gote' });
  p.board[61] = { kind: 'P', side: 'gote', promoted: false };
  assert.ok(can(p, move(70, 61)));
  const next = play(createGame(p.rules, p), move(70, 61));
  assert.equal(next.position.hands.sente.P, 1);
  const result = analyzePosition(initialPosition({ kingCapture: 'enemy', selfCapture: 'gote' }), { maxNodes: 4000, timeMs: Infinity });
  assert.ok(result.move);
  assert.equal('from' in result.move && initialPosition().board[result.move.to]?.side === 'sente', false);
});
