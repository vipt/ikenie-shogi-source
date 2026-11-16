import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,play,resign,legalMoves} from '../src/game/engine';
import {replaceGame,takeBackHistory,goForwardHistory} from '../src/game/history';
import {serialize,deserialize,DEFAULT_SETTINGS} from '../src/game/persistence';
import {undoPlies} from '../src/game/match-settings';
const advance=(g:ReturnType<typeof createGame>)=>play(g,legalMoves(g.position)[0]!);
const initial=()=>createGame(DEFAULT_SETTINGS.rules);
test('redo restores self capture, hands, turn, trail and original CPU reply exactly',()=>{
 const first=play(initial(),{from:70,to:61,promote:false}),second=advance(first),state=replaceGame(second);
 const back=takeBackHistory(state,undoPlies(second,DEFAULT_SETTINGS));assert.equal(back.game.log.length,0);assert.equal(back.redo[0]!.moves.length,2);assert.deepEqual(goForwardHistory(back),state);
});
test('multiple undo batches replay in order, including another undo after redo',()=>{
 const g1=advance(initial()),g2=advance(g1),g3=advance(g2);let state=takeBackHistory(replaceGame(g3),1);state=takeBackHistory(state,1);
 assert.deepEqual(goForwardHistory(state).game,g2);state=takeBackHistory(goForwardHistory(state),1);assert.deepEqual(goForwardHistory(goForwardHistory(state)).game,g3);
});
test('new branch clears redo without mutating the saved branch',()=>{
 const original=takeBackHistory(replaceGame(advance(initial())),1);const changed=replaceGame(play(original.game,{from:70,to:61,promote:false}));assert.equal(changed.redo.length,0);assert.equal(original.redo.length,1);assert.equal(goForwardHistory(changed),changed);
});
test('redo survives serialization including resignation and winning side',()=>{
 const end=resign(advance(advance(initial())),'gote');const back=takeBackHistory(replaceGame(end),2);const restored=deserialize(serialize(back.game,DEFAULT_SETTINGS,back.redo));assert.deepEqual(goForwardHistory({game:restored.game,redo:restored.redo!}).game,end);
});
test('redo restores a move-limit draw',()=>{
 let game=createGame({...DEFAULT_SETTINGS.rules,moveLimit:2});game=advance(advance(advance(game)));assert.equal(game.result?.reason,'move-limit');assert.deepEqual(goForwardHistory(takeBackHistory(replaceGame(game),1)).game,game);
});
test('gote undo and redo preserve the CPU opening',()=>{
 const settings={...DEFAULT_SETTINGS,humanSide:'gote' as const},g1=advance(initial()),g3=advance(advance(g1));const back=takeBackHistory(replaceGame(g3),undoPlies(g3,settings));assert.deepEqual(back.game,g1);assert.deepEqual(goForwardHistory(back).game,g3);
});
test('empty history operations are no-ops and old saves have no redo',()=>{
 const state=replaceGame(initial());assert.equal(takeBackHistory(state,1),state);assert.equal(goForwardHistory(state),state);assert.equal(deserialize(serialize(state.game,DEFAULT_SETTINGS)).redo,undefined);
});
test('illegal and malformed redo data is rejected before it can reach the UI',()=>{
 for(const redo of [123,[{}],[{moves:[],resigned:null}],[{moves:[{from:70,to:0,promote:false}],resigned:null}],[{moves:[null],resigned:null}]]){
  const raw=JSON.parse(serialize(initial(),DEFAULT_SETTINGS));raw.redo=redo;assert.throws(()=>deserialize(JSON.stringify(raw)));
 }
});
