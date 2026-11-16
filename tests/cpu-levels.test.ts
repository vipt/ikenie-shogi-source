import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CPU_LEVELS,cpuLevel,cpuLevelProfile,legacyDifficulty} from '../src/game/cpu-levels';
import {DEFAULT_SETTINGS,serialize,deserialize,newGameSettings} from '../src/game/persistence';
import {createGame,play} from '../src/game/engine';
import {LIMITS,analyzePosition} from '../src/game/cpu';
test('ten CPU levels have increasing budgets and level 7 preserves strong',()=>{
 assert.equal(CPU_LEVELS.length,10);assert.deepEqual(cpuLevelProfile(7),{...LIMITS.strong,nativeDepth:0});let ms=0,nodes=0,depth=0;
 for(const n of CPU_LEVELS){const p=cpuLevelProfile(n);assert(p.timeMs>ms&&p.maxNodes>nodes&&p.maxDepth>depth);assert(p.timeMs<=10000);ms=p.timeMs;nodes=p.maxNodes;depth=p.maxDepth;}
});
test('legacy difficulty maps to CPU levels without losing moves',()=>{
 const game=play(createGame(),{from:70,to:61,promote:false});
 for(const [difficulty,level] of [['easy',1],['normal',5],['strong',7]] as const){const raw=JSON.parse(serialize(game,{...DEFAULT_SETTINGS,rules:game.position.rules}));delete raw.settings.cpuLevel;raw.settings.difficulty=difficulty;const saved=deserialize(JSON.stringify(raw));assert.equal(cpuLevel(saved.settings),level);assert.deepEqual(saved.game,game);}
});
test('every CPU level survives saving and reopening a game',()=>{
 for(const level of CPU_LEVELS){const settings={...DEFAULT_SETTINGS,cpuLevel:level,difficulty:legacyDifficulty(level)};assert.equal(cpuLevel(deserialize(serialize(createGame(),settings)).settings),level);}
});
test('invalid stored CPU levels are rejected',()=>{
 for(const value of [0,11,-1,1.5,'7',null]){const raw=JSON.parse(serialize(createGame(),DEFAULT_SETTINGS));raw.settings.cpuLevel=value;assert.throws(()=>deserialize(JSON.stringify(raw)),/CPUレベル/);}
});
test('classic level 1 honors its budget and returns a legal move',()=>{
 const g=createGame({kingCapture:'all',selfCapture:'both'}),a=analyzePosition(g.position,{difficulty:'strong',...cpuLevelProfile(1),timeMs:Infinity});assert(a.move);assert(a.depth<=1);assert(a.nodes<=cpuLevelProfile(1).maxNodes);assert.doesNotThrow(()=>play(g,a.move!));
});

test('CPU and evaluation are fixed while old game rules and history are preserved',()=>{
 const settings={...DEFAULT_SETTINGS,cpuEngine:'classic' as const,model:'trained' as const,rules:{kingCapture:'none' as const,moveLimit:320}};
 const game=play(createGame(settings.rules),{from:70,to:61,promote:false});const loaded=deserialize(serialize(game,settings));
 assert.equal(loaded.settings.cpuEngine,'native');assert.equal(loaded.settings.model,'hao');assert.deepEqual(loaded.game,game);assert.equal(loaded.settings.rules.kingCapture,'none');
 const next=newGameSettings(loaded.settings);assert.equal(next.rules.kingCapture,'enemy');assert.equal(next.cpuEngine,'native');assert.equal(next.model,'hao');assert.equal(loaded.settings.rules.kingCapture,'none');
});
