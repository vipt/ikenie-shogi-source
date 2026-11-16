import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,play,legalMoves,undo,resign} from '../src/game/engine';
import {DEFAULT_SETTINGS,deserialize,serialize,newGameSettings,type Settings} from '../src/game/persistence';
import {humanSide,cpuLevelFor,cpuSearchProfile,isCpuTurn,undoPlies,cpuMatchDescription,playerFor,preparePlayers,updatePlayer,recoveryEnabled,updateRecovery} from '../src/game/match-settings';
const advance=(g:ReturnType<typeof createGame>)=>play(g,legalMoves(g.position)[0]!);
test('CPU turn follows the selected human side, including the opening and terminal positions',()=>{
 const g=createGame(),after=advance(g);
 for(const side of ['sente','gote'] as const){const s={...DEFAULT_SETTINGS,humanSide:side};assert.equal(isCpuTurn(g,s),side==='gote');assert.equal(isCpuTurn(after,s),side==='sente');assert.equal(isCpuTurn(resign(g),s),false);}
 assert.equal(isCpuTurn(g,{...DEFAULT_SETTINGS,mode:'local'}),false);assert.equal(isCpuTurn(g,{...DEFAULT_SETTINGS,mode:'watch'}),true);
});
test('spectator searches take their depth and time from the side about to move',()=>{
 const s:Settings={...DEFAULT_SETTINGS,mode:'watch',cpuLevel:7,watchCpuLevels:{sente:1,gote:10}};let g=createGame();
 assert.equal(cpuSearchProfile(s,g.position.turn).nativeDepth,1);assert.equal(cpuSearchProfile(s,g.position.turn).timeMs,100);g=advance(g);assert.equal(cpuSearchProfile(s,g.position.turn).timeMs,10000);assert.equal(cpuSearchProfile(s,g.position.turn).nativeDepth,0);
 assert.equal(cpuMatchDescription(s),'先手 Lv.1 / 後手 Lv.10');
});
test('old saves retain their common spectator level and default human side',()=>{
 const raw=JSON.parse(serialize(createGame(),{...DEFAULT_SETTINGS,mode:'watch',cpuLevel:9}));delete raw.settings.humanSide;delete raw.settings.watchCpuLevels;
 const s=deserialize(JSON.stringify(raw)).settings;assert.equal(humanSide(s),'sente');assert.equal(cpuLevelFor(s,'sente'),9);assert.equal(cpuLevelFor(s,'gote'),9);
});
test('separate CPU levels and human side persist and do not overwrite the solo CPU level',()=>{
 const s:Settings={...DEFAULT_SETTINGS,mode:'watch',cpuLevel:4,humanSide:'gote',watchCpuLevels:{sente:2,gote:9}};
 const loaded=deserialize(serialize(advance(createGame()),s));assert.deepEqual(loaded.settings,s);assert.equal(cpuLevelFor(loaded.settings,'sente'),2);assert.equal(cpuLevelFor(loaded.settings,'gote'),9);
 for(const side of ['sente','gote'] as const)assert.equal(cpuLevelFor({...loaded.settings,mode:'cpu'},side),4);
});
test('gote undo preserves the CPU opening and returns to before the last human move',()=>{
 const s:Settings={...DEFAULT_SETTINGS,humanSide:'gote'};const g0=createGame(),g1=advance(g0),g2=advance(g1),g3=advance(g2);
 assert.equal(undoPlies(g0,s),0);assert.equal(undoPlies(g1,s),0);assert.equal(undoPlies(g2,s),1);assert.equal(undoPlies(g3,s),2);
 for(const g of [g2,g3]){const back=undo(g,undoPlies(g,s));assert.deepEqual(back,g1);assert.equal(isCpuTurn(back,s),false);}
});
test('sente undo handles a pending reply, a completed reply and a finished game',()=>{
 const s=DEFAULT_SETTINGS,g1=advance(createGame()),g2=advance(g1);assert.equal(undoPlies(g1,s),1);assert.equal(undoPlies(g2,s),2);assert.equal(undoPlies(resign(g2),s),2);assert.equal(undo(g2,undoPlies(g2,s)).log.length,0);
});
test('human gote resignation awards the win to sente even during a CPU turn',()=>{
 const s:Settings={...DEFAULT_SETTINGS,humanSide:'gote'};assert.equal(resign(createGame(),humanSide(s)).result?.winner,'sente');
});
test('new solo games face the human, while saved manual orientation is preserved',()=>{
 assert.equal(newGameSettings({...DEFAULT_SETTINGS,humanSide:'gote',flipped:false}).flipped,true);
 assert.equal(newGameSettings({...DEFAULT_SETTINGS,humanSide:'sente',flipped:true}).flipped,false);
 const s:Settings={...DEFAULT_SETTINGS,humanSide:'gote',flipped:false};assert.equal(deserialize(serialize(createGame(),s)).settings.flipped,false);
});
test('invalid side settings and incomplete or out-of-range spectator levels are rejected',()=>{
 for(const humanSide of [null,'invalid',1]){const raw=JSON.parse(serialize(createGame(),DEFAULT_SETTINGS));raw.settings.humanSide=humanSide;assert.throws(()=>deserialize(JSON.stringify(raw)));}
 for(const watchCpuLevels of [null,[],{},1,{sente:1},{sente:0,gote:10},{sente:1,gote:11},{sente:'1',gote:10}]){const raw=JSON.parse(serialize(createGame(),DEFAULT_SETTINGS));raw.settings.watchCpuLevels=watchCpuLevels;assert.throws(()=>deserialize(JSON.stringify(raw)));}
});

test('four independent player combinations derive correct CPU turns and board orientation',()=>{
 for(const sente of ['human','cpu'] as const)for(const gote of ['human','cpu'] as const){
  let s=updatePlayer(updatePlayer(DEFAULT_SETTINGS,'sente',{kind:sente,level:2}),'gote',{kind:gote,level:9});s=newGameSettings(s);
  assert.equal(s.mode,sente==='cpu'&&gote==='cpu'?'watch':sente==='human'&&gote==='human'?'local':'cpu');
  const game=createGame(s.rules);assert.equal(isCpuTurn(game,s),sente==='cpu');assert.equal(isCpuTurn(advance(game),s),gote==='cpu');assert.equal(cpuSearchProfile(s,'sente').timeMs,200);assert.equal(cpuSearchProfile(s,'gote').timeMs,6500);
  if(s.mode==='cpu'){assert.equal(humanSide(s),sente==='human'?'sente':'gote');assert.equal(s.flipped,sente==='cpu');}
 }
});
test('changing player type preserves both sides CPU levels without modifying the other side',()=>{
 let s=updatePlayer(updatePlayer(DEFAULT_SETTINGS,'sente',{kind:'cpu',level:3}),'gote',{kind:'cpu',level:10});
 s=updatePlayer(s,'gote',{kind:'human'});assert.equal(s.mode,'cpu');assert.equal(s.cpuLevel,3);assert.equal(playerFor(s,'gote').level,10);
 s=updatePlayer(s,'gote',{kind:'cpu'});assert.equal(s.mode,'watch');assert.equal(cpuLevelFor(s,'sente'),3);assert.equal(cpuLevelFor(s,'gote'),10);
});
test('old games migrate their active human side and CPU strengths into separate players',()=>{
 const solo=preparePlayers({...DEFAULT_SETTINGS,humanSide:'gote',cpuLevel:4,watchCpuLevels:{sente:2,gote:9}});assert.deepEqual(solo.players,{sente:{kind:'cpu',level:4},gote:{kind:'human',level:9}});
 const watch=preparePlayers({...DEFAULT_SETTINGS,mode:'watch',watchCpuLevels:{sente:2,gote:8}});assert.deepEqual(watch.players,{sente:{kind:'cpu',level:2},gote:{kind:'cpu',level:8}});
 const local=preparePlayers({...DEFAULT_SETTINGS,mode:'local'});assert.equal(playerFor(local,'sente').kind,'human');assert.equal(playerFor(local,'gote').kind,'human');
});
test('saved player settings restore the same game and remain authoritative over legacy flags',()=>{
 const s=newGameSettings(updatePlayer(DEFAULT_SETTINGS,'sente',{kind:'cpu',level:2}));const game=advance(createGame(s.rules)),raw=JSON.parse(serialize(game,s));raw.settings.mode='local';raw.settings.cpuLevel=10;
 const loaded=deserialize(JSON.stringify(raw));assert.equal(loaded.settings.mode,'watch');assert.equal(cpuLevelFor(loaded.settings,'sente'),2);assert.deepEqual(loaded.game,game);assert.deepEqual(loaded.settings.players,s.players);
});
test('player changes only affect the draft, so cancelling cannot alter the live settings',()=>{
 const live=preparePlayers(DEFAULT_SETTINGS),before=JSON.stringify(live);const draft=updatePlayer(live,'sente',{kind:'cpu',level:10});assert.equal(JSON.stringify(live),before);assert.notEqual(draft.players,live.players);assert.notEqual(draft.players!.gote,live.players!.gote);
});
test('malformed per-side player settings are rejected',()=>{
 for(const players of [null,[],{},1,{sente:{kind:'human',level:1}},{sente:{kind:'invalid',level:1},gote:{kind:'cpu',level:1}},{sente:{kind:'cpu',level:0},gote:{kind:'cpu',level:11}}]){const raw=JSON.parse(serialize(createGame(),DEFAULT_SETTINGS));raw.settings.players=players;assert.throws(()=>deserialize(JSON.stringify(raw)));}
});

test('independent recovery switches preserve the other side and select the matching legal-move rule',()=>{
 for(const initialRule of [undefined,'both','none','sente','gote'] as const)for(const side of ['sente','gote'] as const)for(const enabled of [false,true]){
  const before:Settings={...DEFAULT_SETTINGS,rules:{...DEFAULT_SETTINGS.rules,selfCapture:initialRule}},other=side==='sente'?'gote':'sente';const after=updateRecovery(before,side,enabled);
  assert.equal(recoveryEnabled(after,side),enabled);assert.equal(recoveryEnabled(after,other),recoveryEnabled(before,other));assert.equal(before.rules.selfCapture,initialRule);
  const game=createGame(after.rules);for(const turn of ['sente','gote'] as const){const position={...game.position,turn};const canRecover=legalMoves(position).some(m=>'from' in m&&position.board[m.to]?.side===turn);assert.equal(canRecover,recoveryEnabled(after,turn));}
  assert.equal(deserialize(serialize(game,after)).settings.rules.selfCapture,after.rules.selfCapture);
 }
});
test('recovery switches keep player levels and disable incompatible books without re-enabling them',()=>{
 const initial=updatePlayer({...DEFAULT_SETTINGS,book:true},'sente',{kind:'cpu',level:3});const off=updateRecovery(initial,'gote',false);assert.equal(off.book,false);assert.deepEqual(off.players,initial.players);assert.equal(off.rules.selfCapture,'sente');assert.equal(updateRecovery(off,'gote',true).book,false);assert.equal(updateRecovery(initial,'gote',true).book,true);
});
