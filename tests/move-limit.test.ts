import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,play,undo,withMoveLimit,type Move} from '../src/game/engine';
import {DEFAULT_SETTINGS,serialize,deserialize} from '../src/game/persistence';
import {selfCaptureCounts} from '../src/game/presentation';
import {analyzePosition} from '../src/game/cpu-search';
const moves=JSON.parse(readFileSync(new URL('./fixtures/move-limit.json',import.meta.url),'utf8')).moves as Move[];
function replay(count:number,limit?:number){let game=createGame({kingCapture:'enemy',...(limit===undefined?{}:{moveLimit:limit})});for(const m of moves.slice(0,count))game=play(game,m);return game;}
test('default 320 permits 320 plies and draws after the 321st',()=>{
 assert.equal(createGame().position.rules.moveLimit,320);
 const before=replay(320,320);assert.equal(before.result,null);
 const drawn=play(before,moves[320]!);assert.deepEqual(drawn.result,{winner:null,reason:'move-limit'});assert.equal(drawn.log.length,321);
 assert.throws(()=>play(drawn,moves[321]!));assert.equal(undo(drawn).result,null);
 assert.deepEqual(play(undo(drawn),moves[320]!).result,drawn.result);
});
test('configured limit survives save and restore at the boundary',()=>{
 const game=replay(3,2),settings={...DEFAULT_SETTINGS,rules:{kingCapture:'enemy' as const,moveLimit:2}};
 assert.deepEqual(deserialize(serialize(game,settings)),{game,settings});
 assert.equal(replay(5,5).result,null);assert.equal(replay(6,5).result?.reason,'move-limit');
});
test('mate on the first over-limit move takes priority',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/presentation.json',import.meta.url),'utf8'));
 const before=deserialize(fixture.beforeMate).game;
 const limited=withMoveLimit(before,before.log.length);
 assert.equal(play(limited,fixture.lastMove).result?.reason,'mate');
});
test('old long records are kept and an unfinished over-limit game becomes a draw',()=>{
 const old=replay(322),data=JSON.parse(serialize(old,{...DEFAULT_SETTINGS,rules:{kingCapture:'enemy'}}));
 const restored=deserialize(JSON.stringify(data));assert.equal(restored.game.log.length,322);assert.equal(restored.settings.rules.moveLimit,320);assert.equal(restored.game.result?.reason,'move-limit');
 assert.deepEqual(deserialize(serialize(restored.game,restored.settings)),restored);
 assert.equal(undo(restored.game).result?.reason,'move-limit');assert.equal(undo(restored.game,2).result,null);
});
test('completed old games keep their result when the new limit is applied',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/presentation.json',import.meta.url),'utf8'));
 const original=deserialize(fixture.mate).game;assert.equal(withMoveLimit(original,1).result?.reason,'mate');
});
test('recovery counters distinguish sides, enemy captures and undo',()=>{
 let game=createGame();game=play(game,{from:70,to:61,promote:false});game=play(game,{from:10,to:19,promote:false});game=play(game,{from:61,to:25,promote:false});
 assert.deepEqual(selfCaptureCounts(game),{sente:1,gote:1});assert.deepEqual(selfCaptureCounts(undo(game)),{sente:1,gote:1});assert.deepEqual(selfCaptureCounts(undo(game,2)),{sente:1,gote:0});
 assert.deepEqual(selfCaptureCounts(deserialize(serialize(game,DEFAULT_SETTINGS)).game),{sente:1,gote:1});assert.deepEqual(selfCaptureCounts(createGame()),{sente:0,gote:0});
});
test('invalid saved move limits are rejected',()=>{
 const data=JSON.parse(serialize(createGame(),DEFAULT_SETTINGS));
 for(const limit of [0,-1,320.5,'320',null,5000]){data.settings.rules.moveLimit=limit;assert.throws(()=>deserialize(JSON.stringify(data)));}
 for(const limit of [1,320,4999]){data.settings.rules.moveLimit=limit;assert.equal(deserialize(JSON.stringify(data)).settings.rules.moveLimit,limit);}
});
test('classic search evaluates a compulsory over-limit continuation as a draw',()=>{
 const game=replay(2,2);const result=analyzePosition(game.position,{history:game.trail,maxDepth:2,maxNodes:10000,timeMs:1000});assert(result.move);assert(result.score===0);
});

