import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,initialPosition,legalMoves,play,resign,opposite,type Game,type Rules} from '../src/game/engine';
import {HANDICAP_KINDS,type HandicapKind} from '../src/game/handicap';
import {DEFAULT_SETTINGS,serialize,deserialize,newGameSettings} from '../src/game/persistence';
import {formatSharedRecord,readSharedRecord} from '../src/game/shared-record';
import {gameToUsiPosition,moveToUsi} from '../src/game/usi-format';
import {bookSupported} from '../src/game/book-rules';
import {takeBackHistory,goForwardHistory} from '../src/game/history';
import {isCpuTurn,undoPlies} from '../src/game/match-settings';
import {createGameRepository,CURRENT_GAME_KEY} from '../src/game/archive-store';

const advance=(g:Game)=>play(g,legalMoves(g.position)[0]!);
const removed:Record<HandicapKind,number[]>={lance:[8],bishop:[16],rook:[10],'rook-lance':[8,10],two:[10,16],four:[0,8,10,16],six:[0,1,7,8,10,16],eight:[0,1,2,6,7,8,10,16],ten:[0,1,2,3,5,6,7,8,10,16]};
for(const kind of HANDICAP_KINDS)for(const side of ['sente','gote'] as const){
 test(`${kind}/${side}: exact removal, upper first, saves and shared replay`,async()=>{
  const rules:Rules={kingCapture:'all',selfCapture:'both',moveLimit:320,handicap:{kind,side}};
  const initial=createGame(rules),even=initialPosition();
  const missing=removed[kind].map(i=>side==='gote'?i:80-i);
  for(let i=0;i<81;i++)assert.deepEqual(initial.position.board[i],missing.includes(i)?null:even.board[i]);
  assert.deepEqual(initial.position.hands,even.hands);assert.equal(initial.position.turn,side);
  assert.equal(initial.position.board.filter(Boolean).length,40-missing.length);
  let game=initial;
  for(let i=0;i<8;i++)game=advance(game);
  assert.equal(game.log[0]!.side,side);assert.equal(game.log[1]!.side,opposite(side));
  const settings={...DEFAULT_SETTINGS,rules};
  assert.equal(JSON.parse(serialize(game,settings)).version,2);
  assert.deepEqual(deserialize(serialize(game,settings)).game,game);
  const shared=formatSharedRecord(game,settings);
  assert.match(shared,/棋譜形式:2/);
  assert.deepEqual((await readSharedRecord(shared)).game,game);
  const ended=resign(game,side);
  assert.deepEqual((await readSharedRecord(formatSharedRecord(ended,settings))).game,ended);
  assert.deepEqual(deserialize(serialize(resign(initial,side),settings)).game,resign(initial,side));
  assert.equal(bookSupported(rules),false);assert.equal(newGameSettings({...settings,book:true}).book,false);
 });
}
test('gote handicap SFEN starts with white and preserves initial state through undo/redo',()=>{
 const rules:Rules={kingCapture:'enemy',selfCapture:'none',moveLimit:320,handicap:{kind:'two',side:'gote'}};
 const start=createGame(rules);
 assert.equal(gameToUsiPosition(start),'position sfen lnsgkgsnl/9/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1');
 const game=advance(advance(advance(start)));
 const settings={...DEFAULT_SETTINGS,rules};
 assert(isCpuTurn(start,settings));assert.equal(undoPlies(advance(start),settings),0);assert.equal(undoPlies(game,settings),2);
 const back=takeBackHistory({game,redo:[]},3);
 assert.deepEqual(back.game,start);
 const saved=deserialize(serialize(back.game,settings,back.redo));
 assert.deepEqual(goForwardHistory({game:saved.game,redo:saved.redo!}).game,game);
 assert.equal(gameToUsiPosition(game),gameToUsiPosition(start)+' moves '+game.log.map(r=>moveToUsi(r.move)).join(' '));
});
test('invalid or missing handicap metadata is rejected; old flat games remain compatible',async()=>{
 const rules:Rules={...DEFAULT_SETTINGS.rules,handicap:{kind:'six',side:'gote'}};
 const settings={...DEFAULT_SETTINGS,rules};
 const raw=JSON.parse(serialize(advance(createGame(rules)),settings));
 for(const handicap of [null,{},'six',{kind:'unknown',side:'gote'},{kind:'two',side:'other'},undefined]){
  const bad={...raw,settings:{...raw.settings,rules:{...rules,handicap}}};
  assert.throws(()=>deserialize(JSON.stringify(bad)),/駒落ち/);
 }
 const text=formatSharedRecord(advance(createGame(rules)),settings);
 for(const bad of [text.replace(/^手合割:.*\n/m,''),text.replace('上手:後手','上手:先手'),text.replace('六枚落ち','未知落ち'),text.replace('棋譜形式:2','棋譜形式:1'),text.replace('手合割:','手合割:六枚落ち · 上手:後手\n手合割:')])await assert.rejects(readSharedRecord(bad));
 const flatSettings={...DEFAULT_SETTINGS,rules:{...DEFAULT_SETTINGS.rules,selfCapture:'both' as const}};
 const even=advance(createGame(flatSettings.rules));
 assert.equal(JSON.parse(serialize(even,flatSettings)).version,1);
 assert.deepEqual(deserialize(serialize(even,flatSettings)).game,even);
 assert.deepEqual((await readSharedRecord(formatSharedRecord(even,flatSettings))).game,even);
});
test('imported handicap is archived without altering current game, with original replay after restart',async()=>{
 const values=new Map<string,string>([[CURRENT_GAME_KEY,serialize(createGame(),DEFAULT_SETTINGS)]]);
 const storage={getItem:async(k:string)=>values.get(k)??null,setItem:async(k:string,v:string)=>{values.set(k,v);},getAllKeys:async()=>[...values.keys()],removeItem:async(k:string)=>{values.delete(k);}};
 const settings={...DEFAULT_SETTINGS,rules:{...DEFAULT_SETTINGS.rules,handicap:{kind:'ten' as const,side:'sente' as const}}};
 const game=advance(advance(createGame(settings.rules))),before=values.get(CURRENT_GAME_KEY);
 const saved=await createGameRepository(storage).importGame(game,settings);
 const restored=await createGameRepository(storage).readArchive(saved.summary.session);
 assert.deepEqual(restored.game,game);assert.deepEqual(restored.settings.rules,settings.rules);
 assert.equal(values.get(CURRENT_GAME_KEY),before);
});
