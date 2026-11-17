import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resultDisplay,isNewResult} from '../src/game/result-display';
import {DEFAULT_SETTINGS} from '../src/game/persistence';
import {withPlayers} from '../src/game/match-settings';

test('winner shows side and the actual human/CPU participant, independent of orientation',()=>{
 for(const human of ['sente','gote'] as const){
  const settings=withPlayers({...DEFAULT_SETTINGS,flipped:true},{sente:{kind:human==='sente'?'human':'cpu',level:7},gote:{kind:human==='gote'?'human':'cpu',level:8}});
  const own=resultDisplay({winner:human,reason:'mate'},settings,57);
  assert.equal(own.title,(human==='sente'?'先手':'後手')+'の勝ち');assert.equal(own.participant,'あなた');assert(own.yourWin);assert.equal(own.detail,'詰み · 57手まで');
  const loss=resultDisplay({winner:human==='sente'?'gote':'sente',reason:'resign'},settings,0);
  assert.equal(loss.participant,human==='sente'?'CPU Lv.8':'CPU Lv.7');assert(!loss.yourWin);
 }
});
test('local and CPU-only games do not describe either player as you',()=>{
 for(const kind of ['human','cpu'] as const){
  const settings=withPlayers(DEFAULT_SETTINGS,{sente:{kind,level:3},gote:{kind,level:9}});
  for(const winner of ['sente','gote'] as const){
   const display=resultDisplay({winner,reason:'perpetual-check'},settings,22);
   assert.equal(display.participant,kind==='cpu'?'CPU Lv.'+(winner==='sente'?3:9):(winner==='sente'?'先手':'後手')+'プレイヤー');assert(!display.yourWin);
  }
 }
});
test('draws have no winner or celebration',()=>{
 for(const reason of ['repetition','move-limit'] as const){
  const display=resultDisplay({winner:null,reason},DEFAULT_SETTINGS,321);
  assert.equal(display.title,'引き分け');assert.equal(display.participant,'勝敗なし');assert(!display.yourWin);
 }
});
test('only a newly reached terminal state triggers emphasis',()=>{
 assert(!isNewResult(undefined,'finished'));assert(!isNewResult(undefined,null));
 assert(isNewResult(null,'finished'));assert(!isNewResult('finished','finished'));
 assert(!isNewResult('finished',null));assert(isNewResult('finished','another-session'));
});
