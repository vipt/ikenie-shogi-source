import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createGame,play,legalMoves} from '../src/game/engine';
import {moveFromUsi,moveToUsi,toSfen} from '../src/game/usi-format';
import {startKingResearch,KING_BOOK_RULES} from './lib/king-book-research';
async function main(){
 const m=JSON.parse(await readFile('artifacts/engines/king-recovery-book-v1/book-manifest.json','utf8'));const engines=await Promise.all(Array.from({length:4},()=>startKingResearch(1)));let edges=0,kingRecoveries=0;
 try{for(let i=0;i<m.entries.length;i+=4){await Promise.all(m.entries.slice(i,i+4).map(async(e:any,j:number)=>{let g=createGame(KING_BOOK_RULES);for(const s of e.history)g=play(g,moveFromUsi(s));assert.equal(toSfen(g.position,1,'mobile-king-all'),e.sfen);const p=await engines[j]!.probe(g);assert(p.valid);assert.equal((p as any).kingRecovery,true);assert.equal(p.recoveryMask,3);assert.deepEqual(p.children.map(c=>c.move).sort(),legalMoves(g.position).map(moveToUsi).sort());for(const v of e.moves){const c=p.children.find(c=>c.move===v.move);assert(c?.valid);const next=play(g,moveFromUsi(v.move));assert.equal(c.sfen,toSfen(next.position,g.log.length+2,'mobile-king-all'));assert.equal(c.recovery,next.log.at(-1)!.selfCapture);edges++;kingRecoveries+=v.kingRecovery?1:0;}}));if(i%120===0)console.log('Verified positions '+Math.min(i+4,m.entries.length));}
 const report={createdAt:new Date().toISOString(),passed:true,bookSha256:m.sha256,positions:m.entries.length,edges,kingRecoveries,fullLegalMoveSetsMatch:true,storedChildPositionsMatch:true,rootMoves:m.rootMoves};await writeFile('reports/king-book-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await Promise.all(engines.map(e=>e.close()));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
