import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createGame,play,type Game} from '../src/game/engine';
import {RECOVERY_RULES,moveFromUsi,moveToUsi,toSfen} from './lib/usi-format';
import {projectRoot,startInstalledEngine} from './lib/installed-usi';
import type {UsiAnalysis} from './lib/usi-engine';
type Edge={move:string;value:number;depth:number;recovery:boolean;label:string;ponder:string};
type Entry={sfen:string;history:string[];moves:Edge[]};
const key=(g:Game)=>toSfen(g.position,1,'recovery');
const root=resolve(projectRoot,'artifacts/engines/recovery-book-v2');
async function main(){
 await mkdir(resolve(root,'book'),{recursive:true});
 const lock=JSON.parse(await readFile('scripts/usi-engine-lock.json','utf8'));
 const research=JSON.parse(await readFile('reports/recovery-book-v2-root-research.json','utf8'));
 const engines=await Promise.all(Array.from({length:4},()=>startInstalledEngine('recovery',{multiPV:3})));
 const stop=()=>{for(const e of engines)void e.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 const began=Date.now();
 try{
  const initial=createGame(RECOVERY_RULES),reviewed:Edge[]=[];
  for(let i=0;i<research.candidates.length;i+=4){
   const batch=research.candidates.slice(i,i+4) as {move:string}[];
   const analyses=await Promise.all(batch.map((v,j)=>engines[j]!.analyze(play(initial,moveFromUsi(v.move)),4000)));
   batch.forEach((v,j)=>{const a=analyses[j]!;assert(a.score?.type==='cp'&&!a.score.bound);const child=play(initial,moveFromUsi(v.move));reviewed.push({move:v.move,value:-a.score.value,depth:a.depth+1,recovery:child.log.at(-1)!.selfCapture,label:child.log.at(-1)!.label,ponder:'none'});});
  }
  reviewed.sort((a,b)=>b.value-a.value);
  const rootMoves=reviewed.filter(v=>v.value>=reviewed[0]!.value-150);
  assert(rootMoves.length>=4,'Too few sound alternatives');
  console.log(JSON.stringify({rootCandidates:reviewed,accepted:rootMoves.length}));
  const entries=new Map<string,Entry>();entries.set(key(initial),{sfen:key(initial),history:[],moves:rootMoves});
  const queue:Game[]=[],visited=new Set<string>([key(initial)]);
  const enqueue=(g:Game)=>{const k=key(g);if(!g.result&&g.log.length<24&&!visited.has(k)){visited.add(k);queue.push(g);}};
  for(const v of rootMoves)enqueue(play(initial,moveFromUsi(v.move)));
  // Also cover replies actually played by the no-book opponent in earlier tests.
  for(const reply of ['3a2b','8b2b','9a9c','8b8c'])enqueue(play(play(initial,moveFromUsi('2h2g')),moveFromUsi(reply)));
  // Research PVs supply off-book response positions; every stored edge is freshly searched below.
  for(const v of research.candidates){let g=initial;for(const m of v.pv.slice(0,6)){g=play(g,moveFromUsi(m));enqueue(g);}}
  while(queue.length){
   assert(entries.size<10000,'Unexpected book expansion');
   const batch=queue.splice(0,4);
   const analyses=await Promise.all(batch.map(async(g,i)=>{
    let a=await engines[i]!.analyze(g,g.log.length<4?1800:600);
    for(let retry=0;retry<2&&(!a.score||a.score.bound);retry++)a=await engines[i]!.analyze(g,3000);
    assert(a.move&&a.score&&!a.score.bound,JSON.stringify({history:g.log.map(x=>moveToUsi(x.move)),analysis:a}));
    return a;
   }));
   batch.forEach((g,i)=>{
    const a=analyses[i]!,ply=g.log.length;
    assert(a.move&&a.score&&!a.score.bound);
    const numeric=(score:{type:'cp'|'mate';value:number})=>score.type==='cp'?score.value:Math.sign(score.value)*(30000-Math.min(999,Math.abs(score.value))); 
    const unique=new Map<string,UsiAnalysis['variations'][number]>();
    for(const v of a.variations)if(!v.score.bound)unique.set(v.move,{...v,score:{type:'cp',value:numeric(v.score)}});
    unique.set(a.bestmove,{rank:1,move:a.bestmove,score:{type:'cp',value:numeric(a.score)},depth:a.depth,pv:a.pv});
    const candidates=[...unique.values()].sort((x,y)=>y.score.value-x.score.value);
    const limit=ply===1?3:ply<4?2:1;
    const selected=candidates.filter(v=>v.score.value>=candidates[0]!.score.value-100).slice(0,limit);
    const moves=selected.map(v=>{const child=play(g,moveFromUsi(v.move));enqueue(child);return {move:v.move,value:v.score.value,depth:v.depth,recovery:child.log.at(-1)!.selfCapture,label:child.log.at(-1)!.label,ponder:'none'};});
    entries.set(key(g),{sfen:key(g),history:g.log.map(x=>moveToUsi(x.move)),moves});
   });
   if(entries.size%100<4){console.log(JSON.stringify({positions:entries.size,pending:queue.length,elapsedSeconds:Math.round((Date.now()-began)/1000)}));await writeFile(resolve(root,'checkpoint.json'),JSON.stringify({entries:[...entries.values()],pending:queue.map(g=>g.log.map(r=>moveToUsi(r.move)))}));}
  }
  let continuations=0;
  for(const entry of entries.values()){
   let g=createGame(RECOVERY_RULES);for(const m of entry.history)g=play(g,moveFromUsi(m));assert.equal(key(g),entry.sfen);
   for(const edge of entry.moves){
    const next=play(g,moveFromUsi(edge.move)),child=entries.get(key(next));
    if(entry.history.length<23&&!next.result){assert(child,'Missing continuation');continuations++;}
    if(child){edge.ponder=child.moves[0]!.move;play(next,moveFromUsi(edge.ponder));}
   }
  }
  const list=[...entries.values()].sort((a,b)=>a.sfen.localeCompare(b.sfen));
  const db=['#YANEURAOU-DB2016 1.00',...list.flatMap(e=>['sfen '+e.sfen,...e.moves.map(v=>[v.move,v.ponder,v.value,v.depth,1].join(' '))])].join('\n')+'\n';
  const edges=list.flatMap(e=>e.moves);
  const report={version:2,createdAt:new Date().toISOString(),rules:RECOVERY_RULES,model:lock.evaluation.name,modelSha256:lock.evaluation.sha256,engineSha256:JSON.parse(await readFile('.tools/engines/meguru-v1/build-manifest.json','utf8')).sha256,
   positions:list.length,moveCount:edges.length,recoveryMoves:edges.filter(v=>v.recovery).length,maxPly:24,rootMoves,reviewedRootMoves:reviewed,
   search:{rootMultiPV:12,rootMs:15000,rootChildReviewMs:4000,nodeMultiPV:3,earlyMs:1800,laterMs:600,workers:4,branching:'root: within 150cp after child review; replies: top3; ply3-4: top2; later: best; non-root alternatives within 100cp'},
   selection:{bookEvalDiff:150,considerBookMoveCount:false,narrowBook:false,ignoreRate:0,description:'Uniform random selection among qualified stored alternatives; actual evaluations retained.'},
   sha256:createHash('sha256').update(db).digest('hex'),verifiedMoves:true,verifiedContinuations:continuations,elapsedMs:Date.now()-began,entries:list,
   limitations:'Heuristic search using original Hao trained on standard shogi. Scores are not win probabilities. Time-limited MultiPV may contain candidates from adjacent depths. No strength improvement claim.'};
  await writeFile(resolve(root,'book/user_book1.db'),db);await writeFile(resolve(root,'book-manifest.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({positions:report.positions,moves:report.moveCount,rootMoves:rootMoves.length,sha256:report.sha256}));
 }finally{for(const e of engines)await e.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
