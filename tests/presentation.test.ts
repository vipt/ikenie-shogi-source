import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advantagePercent,scoreForSente,resultPercent,isNewCommittedMove} from '../src/game/presentation';
import {createGame,play,resign,undo} from '../src/game/engine';
import {DEFAULT_SETTINGS,deserialize,serialize} from '../src/game/persistence';

test('advantage is symmetric, sums to 100, and never declares a live game won',()=>{
  assert.deepEqual(advantagePercent(0),{sente:50,gote:50});
  for(const cp of [100,600,1000,30000]){
    const a=advantagePercent(cp),b=advantagePercent(-cp);
    assert(a.sente>50&&a.sente<100);assert.equal(a.sente+a.gote,100);assert.equal(a.sente,b.gote);
  }
  assert.throws(()=>advantagePercent(NaN));
});
test('side-to-move scores become fixed sente/gote percentages',()=>{
  assert.equal(scoreForSente(600,'sente'),600);assert.equal(scoreForSente(600,'gote'),-600);
  assert.deepEqual(advantagePercent(scoreForSente(600,'gote')),{sente:27,gote:73});
});
test('terminal results override estimates including draws',()=>{
  assert.deepEqual(resultPercent({winner:'sente',reason:'mate'}),{sente:100,gote:0});
  assert.deepEqual(resultPercent({winner:'gote',reason:'resign'}),{sente:0,gote:100});
  assert.deepEqual(resultPercent({winner:null,reason:'repetition'}),{sente:50,gote:50});
});
test('only appended moves trigger sound; selection, resignation, undo and restored histories do not',()=>{
  const initial=createGame(),one=play(initial,{from:70,to:61,promote:false});
  const two=play(one,{from:10,to:19,promote:false});
  assert(isNewCommittedMove(initial,one));assert(isNewCommittedMove(one,two));
  assert(!isNewCommittedMove(one,one));assert(!isNewCommittedMove(one,resign(one)));assert(!isNewCommittedMove(two,undo(two)));
  assert(!isNewCommittedMove(one,deserialize(serialize(two,DEFAULT_SETTINGS)).game));
  assert(!isNewCommittedMove(two,createGame()));
});
test('old saves migrate display and sound preferences while retaining the old vibration preference',()=>{
  const data=JSON.parse(serialize(createGame(),{...DEFAULT_SETTINGS,sound:false}));delete data.settings.moveSound;delete data.settings.showEvaluation;
  const restored=deserialize(JSON.stringify(data));assert.equal(restored.settings.moveSound,true);assert.equal(restored.settings.showEvaluation,true);assert.equal(restored.settings.sound,false);
  const settings={...restored.settings,moveSound:false,showEvaluation:false};assert.deepEqual(deserialize(serialize(restored.game,settings)).settings,settings);
  for(const key of ['moveSound','showEvaluation']){const bad=JSON.parse(serialize(createGame(),settings));bad.settings[key]='false';assert.throws(()=>deserialize(JSON.stringify(bad)));}
});

test('move volume migrates without changing loudness and validates saved limits',()=>{
  const data=JSON.parse(serialize(createGame(),DEFAULT_SETTINGS));delete data.settings.moveSoundVolume;
  assert.equal(deserialize(JSON.stringify(data)).settings.moveSoundVolume,75);
  for(const volume of [0,25,75,100]){
    data.settings.moveSoundVolume=volume;
    assert.equal(deserialize(JSON.stringify(data)).settings.moveSoundVolume,volume);
  }
  for(const volume of [-1,101,0.5,'75',null]){
    data.settings.moveSoundVolume=volume;assert.throws(()=>deserialize(JSON.stringify(data)));
  }
});

test('cooperative search reports completed iterations and can be cancelled from an update',async()=>{
  const {analyzePositionAsync}=await import('../src/game/cpu-search');
  let cancelled=false;const updates:number[]=[];
  const result=await analyzePositionAsync(createGame().position,{maxDepth:3,maxNodes:100000,timeMs:2000,shouldStop:()=>cancelled,onUpdate:update=>{
    assert(Number.isFinite(update.score));updates.push(update.depth);cancelled=true;
  }});
  assert(updates.length>=1);assert.equal(updates[0],1);assert.equal(result,null);
});
