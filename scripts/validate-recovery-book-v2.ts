import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createGame,play,resign,type Side} from '../src/game/engine';
import {RECOVERY_RULES,moveFromUsi,moveToUsi,toSfen} from './lib/usi-format';
import {projectRoot,startInstalledEngine} from './lib/installed-usi';
async function main(){
 const folder=resolve(projectRoot,'artifacts/engines/recovery-book-v2'),m=JSON.parse(await readFile(resolve(folder,'book-manifest.json'),'utf8'));
 const oldFolder=resolve(projectRoot,'artifacts/engines/recovery-v1'),old=JSON.parse(await readFile(resolve(oldFolder,'book-manifest.json'),'utf8'));
 for(const [dir,meta] of [[folder,m],[oldFolder,old]] as const)assert.equal(createHash('sha256').update(await readFile(resolve(dir,'book/user_book1.db'))).digest('hex'),meta.sha256);
 const lookup=new Map<string,Set<string>>(m.entries.map((e:any)=>[e.sfen,new Set<string>(e.moves.map((v:any)=>v.move))]));
 const e=await startInstalledEngine('recovery',{bookDir:resolve(folder,'book'),bookEvalDiff:150});
 const rootCounts:Record<string,number>={},lines:any[]=[];
 try{
  for(let i=0;i<240;i++){e.newGame();const a=await e.analyze(createGame(RECOVERY_RULES),100);assert.equal(a.nodes,0);assert(lookup.get(toSfen(createGame(RECOVERY_RULES).position,1,'recovery'))!.has(a.bestmove));rootCounts[a.bestmove]=(rootCounts[a.bestmove]??0)+1;}
  assert.equal(Object.keys(rootCounts).length,m.rootMoves.length,'Every initial alternative should be selected');
  for(const rootMove of m.rootMoves){
   e.newGame();let g=play(createGame(RECOVERY_RULES),moveFromUsi(rootMove.move));
   while(!g.result&&g.log.length<24){const a=await e.analyze(g,100);assert.equal(a.nodes,0,'Unexpected book miss');assert(lookup.get(toSfen(g.position,1,'recovery'))!.has(a.bestmove));assert(a.move);g=play(g,a.move);}
   lines.push({moves:g.log.map(x=>moveToUsi(x.move)),labels:g.log.map(x=>x.label),result:g.result});
  }
 }finally{await e.close();}
 await writeFile('reports/recovery-book-v2-validation.json',JSON.stringify({createdAt:new Date().toISOString(),sha256:m.sha256,sampling:240,rootCounts,lines,allInitialMovesSelected:true,allLinesStayInBook:true},null,2));
 console.log(JSON.stringify({rootCounts,validatedLines:lines.length}));
 const results:any[]=[];let writes=Promise.resolve();const started=Date.now();
 const summary=()=>{const wins=results.filter(r=>r.result.winner===r.newSide).length,losses=results.filter(r=>r.result.winner&&r.result.winner!==r.newSide).length;return {games:results.length,newWins:wins,oldWins:losses,draws:results.length-wins-losses,newWinRate:wins/(results.length||1),newAsSente:results.filter(r=>r.newSide==='sente'&&r.result.winner==='sente').length,newAsGote:results.filter(r=>r.newSide==='gote'&&r.result.winner==='gote').length,meanNewBookHits:results.reduce((s,r)=>s+r.newBookHits,0)/(results.length||1),meanOldBookHits:results.reduce((s,r)=>s+r.oldBookHits,0)/(results.length||1)};};
 const save=()=>{const data=JSON.stringify({createdAt:new Date().toISOString(),complete:results.length===40,protocol:{games:40,movetimeMs:100,maxPlies:256,workers:4,threads:1,hashMiB:64,model:m.model,modelSha256:m.modelSha256,rules:RECOVERY_RULES,newBookSha256:m.sha256,oldBookSha256:old.sha256,engineState:'Separate engine for each side, fresh processes per game; alternate new-book color, 20 games per color.',limitations:'Short PC search, 40 games only; does not establish a strength improvement.'},elapsedMs:Date.now()-started,summary:summary(),results:[...results].sort((a,b)=>a.id-b.id)},null,2);writes=writes.then(()=>writeFile('reports/recovery-book-v2-vs-v1-40.json',data));return writes;};
 await Promise.all(Array.from({length:4},(_,worker)=>(async()=>{
  for(let id=worker;id<40;id+=4){
   const newSide:Side=id%2===0?'sente':'gote';
   const fresh=await startInstalledEngine('recovery',{bookDir:resolve(folder,'book'),bookEvalDiff:150});
   let previous:Awaited<ReturnType<typeof startInstalledEngine>>|undefined;
   try{
    previous=await startInstalledEngine('recovery',{bookDir:resolve(oldFolder,'book')});
    let g=createGame(RECOVERY_RULES),newBookHits=0,oldBookHits=0;
    while(!g.result&&g.log.length<256){
     const useNew=g.position.turn===newSide,a=await(useNew?fresh:previous).analyze(g,100);
     if(a.nodes===0){if(useNew)newBookHits++;else oldBookHits++;}
     if(!a.move){g=resign(g);break;}g=play(g,a.move);
    }
    let replay=createGame(RECOVERY_RULES);for(const row of g.log)replay=play(replay,row.move);if(g.result?.reason==='resign')replay=resign(replay);assert.deepEqual(replay,g);
    results.push({id,newSide,newBookHits,oldBookHits,result:g.result??{winner:null,reason:'ply-limit'},moves:g.log.map(x=>moveToUsi(x.move)),replayVerified:true});
    await save();console.log(JSON.stringify(summary()));
   }finally{await fresh.close();await previous?.close();}
  }
 })()));
 assert.equal(results.length,40);await save();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
