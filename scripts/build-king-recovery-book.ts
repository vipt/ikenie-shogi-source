import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGame,play,legalMoves,type Game} from '../src/game/engine';
import {moveFromUsi,moveToUsi,toSfen} from '../src/game/usi-format';
import {startKingResearch,KING_BOOK_RULES} from './lib/king-book-research';
import type {UsiAnalysis} from './lib/usi-engine';
type Edge={move:string;value:number;depth:number;recovery:boolean;kingRecovery:boolean;label:string;ponder:string};
type Entry={sfen:string;history:string[];moves:Edge[]};
const root='artifacts/engines/king-recovery-book-v1',key=(g:Game)=>toSfen(g.position,1,'mobile-king-all');
const score=(s:{type:'cp'|'mate';value:number})=>s.type==='cp'?s.value:Math.sign(s.value)*(30000-Math.min(999,Math.abs(s.value)));
function edge(g:Game,move:string,value:number,depth:number):Edge{const m=moveFromUsi(move),next=play(g,m),log=next.log.at(-1)!;return {move,value,depth,recovery:log.selfCapture,kingRecovery:log.selfCapture&&'from'in m&&g.position.board[m.from]?.kind==='K',label:log.label,ponder:'none'};}
async function main(){
 await mkdir(root+'/book',{recursive:true});const began=Date.now(),initial=createGame(KING_BOOK_RULES),research=await startKingResearch(12);
 let rootAnalysis:UsiAnalysis;
 try{const p=await research.probe(initial);assert.deepEqual(p.children.map(c=>c.move).sort(),legalMoves(initial.position).map(moveToUsi).sort());rootAnalysis=await research.analyze(initial,15000);}finally{await research.close();}
 const engines=await Promise.all(Array.from({length:4},()=>startKingResearch(3)));
 try{
  const candidates=[...new Set([...rootAnalysis.variations.map(v=>v.move),...legalMoves(initial.position).filter(m=>'from'in m&&initial.position.board[m.from]?.kind==='K').map(moveToUsi)])];
  const reviewed:Edge[]=[];
  for(let i=0;i<candidates.length;i+=4){const batch=candidates.slice(i,i+4);const analyses=await Promise.all(batch.map((m,j)=>engines[j]!.analyze(play(initial,moveFromUsi(m)),3000)));batch.forEach((m,j)=>{const a=analyses[j]!;assert(a.score&&!a.score.bound);reviewed.push(edge(initial,m,-score(a.score),a.depth+1));});}
  reviewed.sort((a,b)=>b.value-a.value);const rootMoves=reviewed.filter(v=>v.value>=reviewed[0]!.value-150).slice(0,8);assert(rootMoves.length>=2,'Insufficient sound alternatives');
  console.log(JSON.stringify({stage:'root',reviewed,accepted:rootMoves.length}));
  const entries=new Map<string,Entry>([[key(initial),{sfen:key(initial),history:[],moves:rootMoves}]]),queue:Game[]=[],seen=new Set([key(initial)]);
  const enqueue=(g:Game)=>{const k=key(g);if(!g.result&&g.log.length<24&&!seen.has(k)){seen.add(k);queue.push(g);}};
  rootMoves.forEach(v=>enqueue(play(initial,moveFromUsi(v.move))));
  while(queue.length){assert(entries.size<3000);const batch=queue.splice(0,4);const analyses=await Promise.all(batch.map(async(g,i)=>{let a=await engines[i]!.analyze(g,g.log.length<4?2000:800);if(!a.score||a.score.bound)a=await engines[i]!.analyze(g,4000);assert(a.score&&!a.score.bound&&a.move);return a;}));
   batch.forEach((g,i)=>{const a=analyses[i]!,unique=new Map<string,Edge>();for(const v of a.variations)if(!v.score.bound)unique.set(v.move,edge(g,v.move,score(v.score),v.depth));unique.set(a.bestmove,edge(g,a.bestmove,score(a.score!),a.depth));const ranked=[...unique.values()].sort((x,y)=>y.value-x.value),selected=ranked.filter(v=>v.value>=ranked[0]!.value-100).slice(0,g.log.length<3?2:1);entries.set(key(g),{sfen:key(g),history:g.log.map(l=>moveToUsi(l.move)),moves:selected});selected.forEach(v=>enqueue(play(g,moveFromUsi(v.move))));});
   if(entries.size%40<4){console.log(JSON.stringify({stage:'expand',positions:entries.size,pending:queue.length,seconds:Math.round((Date.now()-began)/1000)}));await writeFile(root+'/checkpoint.json',JSON.stringify({entries:[...entries.values()],pending:queue.map(g=>g.log.map(l=>moveToUsi(l.move)))}));}
  }
  let continuations=0;for(const e of entries.values()){let g=initial;for(const m of e.history)g=play(g,moveFromUsi(m));assert.equal(key(g),e.sfen);for(const v of e.moves){const next=play(g,moveFromUsi(v.move)),child=entries.get(key(next));if(e.history.length<23&&!next.result){assert(child,'Missing continuation');continuations++;}if(child){v.ponder=child.moves[0]!.move;play(next,moveFromUsi(v.ponder));}}}
  const list=[...entries.values()].sort((a,b)=>a.sfen.localeCompare(b.sfen)),edges=list.flatMap(e=>e.moves),db=['#YANEURAOU-DB2016 1.00',...list.flatMap(e=>['sfen '+e.sfen,...e.moves.map(v=>[v.move,v.ponder,v.value,v.depth,1].join(' '))])].join('\n')+'\n',lock=JSON.parse(await readFile('scripts/usi-engine-lock.json','utf8'));
  const report={version:1,createdAt:new Date().toISOString(),rules:KING_BOOK_RULES,model:lock.evaluation.name,modelSha256:lock.evaluation.sha256,engineSha256:createHash('sha256').update(await readFile('.tools/m-x64/meguru_book_research')).digest('hex'),positions:list.length,moveCount:edges.length,recoveryMoves:edges.filter(v=>v.recovery).length,kingRecoveryMoves:edges.filter(v=>v.kingRecovery).length,maxPly:24,rootMoves,reviewedRootMoves:reviewed,rootAnalysis,search:{rootMultiPV:12,rootMs:15000,rootChildReviewMs:3000,nodeMultiPV:3,earlyMs:2000,laterMs:800,workers:4,branching:'up to 8 root alternatives within 150cp; next two plies up to 2 alternatives within 100cp; best continuation through ply24'},selection:{bookEvalDiff:150,considerBookMoveCount:false,narrowBook:false,ignoreRate:0},sha256:createHash('sha256').update(db).digest('hex'),verifiedMoves:true,verifiedContinuations:continuations,elapsedMs:Date.now()-began,entries:list,limitations:'Time-limited heuristic searches with standard-shogi-trained Hao. Values are not win probabilities. No measured strength improvement claim.'};
  await writeFile(root+'/book/user_book1.db',db);await writeFile(root+'/book-manifest.json',JSON.stringify(report,null,2));console.log(JSON.stringify({stage:'complete',positions:report.positions,moves:report.moveCount,kingRecoveries:report.kingRecoveryMoves,roots:rootMoves.map(v=>v.label)}));
 }finally{await Promise.all(engines.map(e=>e.close()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
