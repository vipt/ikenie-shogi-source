import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzePosition, chooseCpuMoveAsync } from '../src/game/cpu';
import { chooseCpuMove as legacy } from '../src/game/cpu-legacy';
import { applyUnchecked, createGame, emptyHand, initialPosition, isInCheck, legalMoves, play, positionKey, type Kind, type Position, type Side } from '../src/game/engine';

function blank(): Position {
  const p: Position = { board: Array(81).fill(null), hands: { sente: emptyHand(), gote: emptyHand() }, turn: 'sente', rules: { kingCapture: 'enemy' } };
  put(p, 76, 'K'); put(p, 4, 'K', 'gote'); return p;
}
function put(p: Position, square: number, kind: Kind, side: Side = 'sente') { p.board[square] = { kind, side, promoted: false }; }
const limits = { maxNodes: 32000, maxDepth: 4, timeMs: Infinity };
function canMateInOne(p: Position) {
  return legalMoves(p).some(move => {
    const next = applyUnchecked(p, move);
    return isInCheck(next, next.turn) && !legalMoves(next).length;
  });
}
test('finds mate by a drop, ahead of material gain', () => {
  const p = blank(); p.hands.sente.G = 1;
  put(p, 3, 'L', 'gote'); put(p, 5, 'L', 'gote'); put(p, 12, 'P', 'gote'); put(p, 14, 'P', 'gote'); put(p, 22, 'G');
  put(p, 54, 'R'); put(p, 36, 'R', 'gote');
  const result = analyzePosition(p, limits);
  assert.ok(result.move);
  assert.deepEqual(play(createGame(p.rules, p), result.move).result, { winner: 'sente', reason: 'mate' });
  assert.ok(result.score > 99000);
});
test('prevents a mating gold drop instead of grabbing an unprotected rook', () => {
  const p = blank();
  put(p, 75, 'L'); put(p, 77, 'L'); put(p, 66, 'P'); put(p, 68, 'P'); put(p, 40, 'R');
  put(p, 58, 'G', 'gote'); put(p, 39, 'R', 'gote'); put(p, 22, 'P', 'gote'); p.hands.gote.G = 1;
  const old = legacy(p, { random: () => 0.5 })!;
  assert.ok(canMateInOne(applyUnchecked(p, old)), 'fixture must expose a real weakness in the released CPU');
  const result = analyzePosition(p, limits);
  assert.ok(result.move); assert.equal(canMateInOne(applyUnchecked(p, result.move)), false);
});
test('time/node exhaustion returns a legal move without mutating the position', () => {
  const p = initialPosition(), before = positionKey(p);
  const result = analyzePosition(p, { maxNodes: 1, timeMs: Infinity });
  assert.ok(result.move); assert.doesNotThrow(() => play(createGame(), result.move!));
  assert.equal(positionKey(p), before); assert.ok(result.stopped);
});
test('async search yields and can be cancelled before committing a move', async () => {
  let cancelled = false;
  const pending = chooseCpuMoveAsync(initialPosition(), { timeMs: 5000, maxNodes: 1000000, shouldStop: () => cancelled });
  setTimeout(() => { cancelled = true; }, 5);
  assert.equal(await pending, null);
});
test('a checked king is never evaluated as if it could pass', () => {
  const p = blank(); p.board[4] = null; put(p, 0, 'K', 'gote'); put(p, 4, 'R', 'gote'); p.hands.sente.G = 1;
  assert.ok(isInCheck(p, 'sente'));
  const result = analyzePosition(p, { ...limits, maxNodes: 4000 });
  assert.ok(result.move); assert.equal(isInCheck(applyUnchecked(p, result.move), 'sente'), false);
});


test('opening variation chooses only close, fully searched candidates reproducibly',()=>{
  const game=createGame({kingCapture:'all',selfCapture:'both',moveLimit:320});
  const options={difficulty:'strong' as const,variety:15,maxNodes:32000,timeMs:Infinity,history:game.trail};
  const first=analyzePosition(game.position,{...options,random:()=>0});
  const last=analyzePosition(game.position,{...options,random:()=>.999999});
  assert(first.alternatives&&first.alternatives.length>1);assert.equal(first.depth,3);assert.equal(last.depth,first.depth);
  assert.notDeepEqual(first.move,last.move);
  for(const result of [first,last]){
    assert(result.move);assert(result.bestScore!==undefined);assert(result.bestScore-result.score<=15);
    assert.doesNotThrow(()=>play(game,result.move!));
    for(const candidate of result.alternatives!)assert(candidate.score>=result.bestScore-15);
  }
  assert.deepEqual(analyzePosition(game.position,{...options,random:()=>0}).move,first.move);
});
test('opening variation preserves a proven mate even with random selection',()=>{
  const p=blank();p.hands.sente.G=1;put(p,3,'L','gote');put(p,5,'L','gote');put(p,12,'P','gote');put(p,14,'P','gote');put(p,22,'G');
  const result=analyzePosition(p,{...limits,variety:15,random:()=>.99999});assert(result.move);assert.equal(play(createGame(p.rules,p),result.move!).result?.reason,'mate');assert.equal(result.score,result.bestScore);
});
test('interrupted opening variation retains a legal completed result',()=>{
  const game=createGame({kingCapture:'all',selfCapture:'both'});const result=analyzePosition(game.position,{variety:15,maxNodes:1,timeMs:Infinity});
  assert(result.stopped&&result.move);assert.doesNotThrow(()=>play(game,result.move!));
});
