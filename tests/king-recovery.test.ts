import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,play,legalMoves} from '../src/game/engine';
import {gameToUsiPosition,moveFromUsi,moveToUsi,toSfen,fromSfen} from '../src/game/usi-format';
test('mobile king recovery bridge retains histories for every side mask',()=>{
 for(const selfCapture of ['none','sente','gote','both'] as const){
  let g=createGame({kingCapture:'all',selfCapture});
  if(selfCapture==='both'||selfCapture==='sente'){g=play(g,moveFromUsi('5i6i'));assert(g.log[0]!.selfCapture);}
  assert.match(gameToUsiPosition(g,'mobile-king-all'),/^position sfen /);
  assert.throws(()=>gameToUsiPosition(g,'recovery'));
  assert.throws(()=>gameToUsiPosition(g,'standard'));
 }
});
test('mobile king recovery serialization rejects a mismatched king rule',()=>{
 for(const kingCapture of ['none','enemy'] as const)assert.throws(()=>gameToUsiPosition(createGame({kingCapture}),'mobile-king-all'));
});
test('mobile king recovery SFEN defaults preserve king recovery',()=>{
 const g=createGame({kingCapture:'all',selfCapture:'both'}),p=fromSfen(toSfen(g.position,1,'mobile-king-all'),'mobile-king-all');
 assert.equal(p.rules.kingCapture,'all');assert(legalMoves(p).map(moveToUsi).includes('5i6i'));
});

test('legacy desktop USI engines cannot accidentally accept the mobile king rule',async()=>{
 const {UsiEngine}=await import('../scripts/lib/usi-engine');
 const {startInstalledEngine}=await import('../scripts/lib/installed-usi');
 await assert.rejects(UsiEngine.start({executable:'must-not-spawn',options:{},ruleMode:'mobile-king-all'}),/mobile native engine/);
 await assert.rejects(startInstalledEngine('mobile-king-all'),/mobile native engine/);
});
