import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,play} from '../src/game/engine';
import {replaceGame,takeBackHistory} from '../src/game/history';
import {stageCpuMove,completeCpuMove,movingPiece,squareCenter} from '../src/game/cpu-animation';
import {isNewCommittedMove} from '../src/game/presentation';
const recovery={from:70,to:61,promote:false};
const setup=()=>play(play(createGame(),recovery),{from:10,to:19,promote:false});
test('CPU move commits board, hand, history and sound trigger only on landing',()=>{
 const before=createGame(),state=stageCpuMove(replaceGame(before),before,recovery,1);assert.equal(state.game,before);assert.equal(state.game.position.hands.sente.P,0);assert.equal(isNewCommittedMove(before,state.game),false);assert(state.cpuAnimation);
 const after=completeCpuMove(state,1);assert.deepEqual(after.game,play(before,recovery));assert.equal(after.game.position.hands.sente.P,1);assert.equal(after.cpuAnimation,undefined);assert.equal(isNewCommittedMove(before,after.game),true);
});
test('drop animation uses the hand piece and updates its count on landing',()=>{
 const before=setup(),state=stageCpuMove(replaceGame(before),before,{drop:'P',to:52},2);assert.deepEqual(movingPiece(state.cpuAnimation!),{kind:'P',side:'sente',promoted:false});assert.equal(state.game.position.hands.sente.P,1);assert.equal(completeCpuMove(state,2).game.position.hands.sente.P,0);
});
test('promotion is displayed on arrival, with the original piece in flight',()=>{
 const before=setup(),state=stageCpuMove(replaceGame(before),before,{from:61,to:25,promote:true},3);assert.equal(movingPiece(state.cpuAnimation!).promoted,false);assert.equal(completeCpuMove(state,3).game.position.board[25]?.promoted,true);
});
test('undo, a new game and stale completion cannot restore an interrupted CPU move',()=>{
 const before=setup(),pending=stageCpuMove(replaceGame(before),before,{from:61,to:52,promote:false},4);const undone=takeBackHistory(pending,2),newGame=replaceGame(createGame());assert.equal(completeCpuMove(undone,4),undone);assert.equal(completeCpuMove(newGame,4),newGame);assert.equal(stageCpuMove(newGame,before,recovery,5),newGame);
});
test('duplicate and old callbacks cannot double-commit or replace a pending animation',()=>{
 const before=createGame(),pending=stageCpuMove(replaceGame(before),before,recovery,6);assert.equal(stageCpuMove(pending,before,recovery,7),pending);assert.equal(completeCpuMove(pending,5),pending);const done=completeCpuMove(pending,6);assert.equal(completeCpuMove(done,6),done);
});
test('terminal result waits for landing, while CPU resignation needs no movement',()=>{
 const before=play(createGame({kingCapture:'enemy',moveLimit:1}),recovery),state=stageCpuMove(replaceGame(before),before,{from:10,to:19,promote:false},8);assert.equal(state.game.result,null);assert.equal(completeCpuMove(state,8).game.result?.reason,'move-limit');const resigned=stageCpuMove(replaceGame(before),before,null,9);assert.equal(resigned.game.result?.reason,'resign');assert.equal(resigned.cpuAnimation,undefined);
});
test('board coordinates mirror correctly for both orientations and arbitrary sizes',()=>{
 for(const width of [268,378,486])for(const square of [0,10,40,70,80]){const a=squareCenter(square,width,false),b=squareCenter(square,width,true);assert(Math.abs(a.x+b.x-width)<.001);assert(Math.abs(a.y+b.y-width)<.001);assert(a.x>6&&a.x<width-6&&a.y>6&&a.y<width-6);}
});
