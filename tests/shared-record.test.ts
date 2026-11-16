import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,legalMoves,play,resign,type Game} from '../src/game/engine';
import {DEFAULT_SETTINGS,deserialize,type Settings} from '../src/game/persistence';
import {withPlayers} from '../src/game/match-settings';
import {formatSharedRecord,readSharedRecord,resolveSharedResignation,MAX_SHARED_RECORD_LENGTH} from '../src/game/shared-record';
import {createGameRepository,CURRENT_GAME_KEY,type StorageAdapter} from '../src/game/archive-store';
import {newSession} from '../src/game/session';

const advance=(g:Game)=>play(g,legalMoves(g.position)[0]!);
const cfg:Settings={...DEFAULT_SETTINGS,mode:'local',rules:{kingCapture:'all',selfCapture:'both',moveLimit:320}};
const recovery=()=>play(play(play(createGame(cfg.rules),{from:70,to:61,promote:false}),{from:10,to:19,promote:false}),{drop:'P',to:43});
const startedAt='2026-11-16T04:00:00.000Z';

test('portable text round trips recovery, drops, every position, date and result',async()=>{
 const game=resign(recovery(),'sente');
 const imported=await readSharedRecord(formatSharedRecord(game,cfg,startedAt));
 assert.deepEqual(imported.game,game);assert.equal(imported.startedAt,startedAt);
 assert.equal(imported.needsResignationSide,false);assert.deepEqual(imported.warnings,[]);
});
test('mate fixture preserves promotions, captures, drops and all replay positions',async()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/presentation.json','utf8'));
 const saved=deserialize(fixture.mate), imported=await readSharedRecord(formatSharedRecord(saved.game,saved.settings));
 assert.deepEqual(imported.game,saved.game);
 assert(imported.game.log.some(m=>'promote'in m.move&&m.move.promote));
});
test('both king variants, no-king-capture and all recovery masks preserve rules',async()=>{
 for(const kingCapture of ['enemy','all','none'] as const)for(const selfCapture of ['none','sente','gote','both'] as const){
  const settings={...cfg,rules:{kingCapture,selfCapture,moveLimit:410}},game=advance(createGame(settings.rules));
  const imported=await readSharedRecord(formatSharedRecord(game,settings));
  assert.deepEqual(imported.game,game);assert.deepEqual(imported.settings.rules,settings.rules);
 }
});
test('CPU players, asymmetric levels and off-turn resignation survive sharing',async()=>{
 for(const sente of ['human','cpu'] as const)for(const gote of ['human','cpu'] as const){
  const settings=withPlayers(cfg,{sente:{kind:sente,level:2},gote:{kind:gote,level:9}});
  const game=resign(advance(createGame(settings.rules)),'sente');
  const imported=await readSharedRecord(formatSharedRecord(game,settings));
  assert.equal(imported.settings.mode,settings.mode);
  assert.equal(imported.settings.players!.sente.kind,sente);assert.equal(imported.settings.players!.gote.kind,gote);
  if(sente==='cpu')assert.equal(imported.settings.players!.sente.level,2);
  if(gote==='cpu')assert.equal(imported.settings.players!.gote.level,9);
  assert.deepEqual(imported.game.result,game.result);
 }
});
test('zero-move resignation and move-limit draws are replayable',async()=>{
 const empty=resign(createGame(cfg.rules),'gote');
 assert.deepEqual((await readSharedRecord(formatSharedRecord(empty,cfg))).game,empty);
 const settings={...cfg,rules:{...cfg.rules,moveLimit:2}},game=advance(advance(advance(createGame(settings.rules))));
 assert.equal(game.result?.reason,'move-limit');assert.deepEqual((await readSharedRecord(formatSharedRecord(game,settings))).game,game);
});
test('king recovery and repetition are preserved in imported replay',async()=>{
 const kingGame=play(createGame(cfg.rules),{from:76,to:75,promote:false});
 assert.deepEqual((await readSharedRecord(formatSharedRecord(kingGame,cfg))).game,kingGame);
 let repeated=createGame(cfg.rules);
 for(let i=0;i<3;i++)for(const [from,to] of [[75,66],[3,12],[66,75],[12,3]])repeated=play(repeated,{from:from!,to:to!,promote:false});
 assert.equal(repeated.result?.reason,'repetition');
 assert.deepEqual((await readSharedRecord(formatSharedRecord(repeated,cfg))).game,repeated);
});
test('legacy current-game text restores CPU side and asks who resigned',async()=>{
 const game=recovery();
 const text=['生贄将棋','両者が回収できる','玉も味方の駒を回収できます。相手の駒も取れます。',
 'やねうら王 · Háo · あなた：先手 / CPU Lv.7','手数上限：320手を超えたら引き分け',
 ...game.log.map((m,i)=>`${i+1} ${m.label}`),'投了'].join('\n');
 const imported=await readSharedRecord(text);
 assert.equal(imported.needsResignationSide,true);assert.equal(imported.game.result,null);
 assert.equal(imported.settings.mode,'cpu');assert.equal(imported.settings.humanSide,'sente');
 assert.deepEqual(resolveSharedResignation(imported,'sente').game,resign(game,'sente'));
 assert.deepEqual(resolveSharedResignation(imported,'gote').game,resign(game,'gote'));
});
test('legacy archive text restores moves and reports missing limit/date precision',async()=>{
 const game=resign(recovery(),'gote');
 const text=['生贄将棋','2026/11/16 13:00:00','先手 人間 ／ 後手 CPU Lv.9','両者回収可 · 玉：味方も取れる',
 ...game.log.map((m,i)=>`${i+1} ${m.label}`),'先手の勝ち · 投了'].join('\n');
 const imported=await readSharedRecord(text);
 assert.deepEqual(imported.game,game);assert.equal(imported.startedAt,null);assert.equal(imported.warnings.length,2);
});
test('legacy move-limit draws infer the missing limit without inventing a winner',async()=>{
 const settings={...cfg,rules:{...cfg.rules,moveLimit:2}},game=advance(advance(advance(createGame(settings.rules))));
 const text=['生贄将棋','日付不明（更新前の対局）','先手 CPU Lv.2 ／ 後手 CPU Lv.9','両者回収可 · 玉：味方も取れる',
 ...game.log.map((m,i)=>`${i+1} ${m.label}`),'引き分け · 手数上限'].join('\n');
 const imported=await readSharedRecord(text);assert.deepEqual(imported.game,game);
});
test('full-width numbers, CRLF and whitespace from copied messages are accepted',async()=>{
 const game=recovery();const text=formatSharedRecord(game,cfg).replace(/1 /g,'１　').replace(/\n/g,'\r\n');
 assert.deepEqual((await readSharedRecord('\uFEFF'+text+'\r\n')).game,game);
});
test('corruption, incomplete settings, wrong rules and false outcomes are rejected',async()=>{
 const text=formatSharedRecord(recovery(),cfg);
 for(const bad of [
  '',text.replace('棋譜形式:1','棋譜形式:2'),text.replace('手数上限:320\n',''),text.replace('結果:途中終了',''),
  text.replace('2 △','4 △'),text.replace('▲2七飛','▲1七飛'),text.replace(' 回収',''),
  text.replace('両者回収可','回収なし'),text.replace('玉:味方も取れる','玉:toString'),
  text.replace('手数上限:320','手数上限:0'),text.replace('先手 人間','先手 CPU Lv.11'),
  text.replace('結果:途中終了','結果:先手の勝ち · 詰み'),text+'\n結果:途中終了',text+'\n4 △1一歩 (1二)',
 ])await assert.rejects(readSharedRecord(bad));
 await assert.rejects(readSharedRecord('a'.repeat(MAX_SHARED_RECORD_LENGTH+1)),/長すぎ/);
});
test('long replay validation can be cancelled before saving',async()=>{
 const fixture=JSON.parse(readFileSync('tests/fixtures/presentation.json','utf8')),saved=deserialize(fixture.mate);
 let checks=0;
 await assert.rejects(readSharedRecord(formatSharedRecord(saved.game,saved.settings),()=>++checks>16),/中止/);
});
test('imported game is saved only to archives and survives reload, sharing and deletion',async()=>{
 const data=new Map<string,string>();let fail=false;
 const storage:StorageAdapter={getItem:async k=>data.get(k)??null,setItem:async(k,v)=>{if(fail)throw Error('disk full');data.set(k,v);},removeItem:async k=>{data.delete(k);},getAllKeys:async()=>[...data.keys()]};
 const repo=createGameRepository(storage),current=advance(createGame(cfg.rules));
 await repo.saveGame(current,cfg,[],newSession());const before=data.get(CURRENT_GAME_KEY);
 const parsed=await readSharedRecord(formatSharedRecord(recovery(),cfg,startedAt));
 const imported=await repo.importGame(parsed.game,parsed.settings,parsed.startedAt);
 assert.equal(data.get(CURRENT_GAME_KEY),before);assert.equal((await repo.archiveKeys()).length,1);
 const restored=await createGameRepository(storage).readArchive(imported.summary.session);
 assert.deepEqual(restored.game,parsed.game);assert.equal(restored.entry.session.startedAt,startedAt);
 assert.deepEqual((await readSharedRecord(formatSharedRecord(restored.game,restored.settings,startedAt))).game,parsed.game);
 fail=true;await assert.rejects(repo.importGame(parsed.game,parsed.settings,startedAt));fail=false;
 assert.equal((await repo.archiveKeys()).length,1);assert.equal(data.get(CURRENT_GAME_KEY),before);
 await repo.deleteArchive(imported.summary.session);assert.equal((await repo.archiveKeys()).length,0);assert.equal(data.get(CURRENT_GAME_KEY),before);
});
