import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initialPosition, applyUnchecked, moveLabel, isInCheck, pieceLabel, legalMoves, sameMove, type Rules, type Move } from '../src/game/engine';
import { moveFromUsi } from '../src/game/usi-format';
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
function analyze(row:any,rules:Rules,validate=false){
 let p=initialPosition(rules); const events:any[]=[];
 for(let i=0;i<row.moves.length;i++){
  const raw=row.moves[i],m:Move=typeof raw==='string'?moveFromUsi(raw):raw.move??raw;
  if(validate)assert(legalMoves(p).some(x=>sameMove(x,m)),`illegal ${row.id} ${i+1}`);
  const target='from' in m?p.board[m.to]:null, actor='from' in m?p.board[m.from]:null;
  const self=!!target&&target.side===p.turn,enemy=!!target&&!self;
  const e={ply:i+1,side:p.turn,label:moveLabel(p,m),actor:actor?pieceLabel(actor):null,target:target?pieceLabel(target):null,self,enemy,drop:'drop' in m?m.drop:null,king:actor?.kind==='K',escapingCheck:isInCheck(p,p.turn)};
  p=applyUnchecked(p,m);events.push({...e,check:isInCheck(p,p.turn)});
 }
 return {id:row.id??'standard',plies:events.length,result:row.result,firstDrop:events.find(e=>e.drop)?.ply??null,firstEnemyCapture:events.find(e=>e.enemy)?.ply??null,firstRecovery:events.find(e=>e.self)?.ply??null,recoveries:events.filter(e=>e.self).length,drops:events.filter(e=>e.drop).length,first20Recoveries:events.filter(e=>e.ply<=20&&e.self).length,first20Drops:events.filter(e=>e.ply<=20&&e.drop).length,events};
}
const normalSource=read('reports/usi-selfplay.json'),newSource=read('reports/recovery-no-book-hao-50.json');
const normal=analyze(normalSource,normalSource.rules,true);
const recovery=newSource.results.map((r:any)=>analyze(r,newSource.protocol.rules,true));
assert.equal(recovery.reduce((n:number,r:any)=>n+r.recoveries,0),630);
const all=fs.readFileSync('artifacts/experiments/opening-outcomes-v2/games.jsonl','utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line)).filter((x:any)=>x.rule==='all').map((r:any)=>analyze(r,{kingCapture:'all',selfCapture:'both',moveLimit:320},r.id==='all-2h2i-0'||r.id==='all-2i3g-0')); 
const mean=(rows:any[],key:string)=>rows.reduce((n,r)=>n+r[key],0)/rows.length;
const summary=(rows:any[])=>({games:rows.length,meanPlies:mean(rows,'plies'),meanFirstDrop:mean(rows,'firstDrop'),meanFirstEnemyCapture:mean(rows,'firstEnemyCapture'),meanRecoveries:mean(rows,'recoveries'),meanDrops:mean(rows,'drops'),meanFirst20Recoveries:mean(rows,'first20Recoveries'),meanFirst20Drops:mean(rows,'first20Drops'),firstDropRange:[Math.min(...rows.map(r=>r.firstDrop)),Math.max(...rows.map(r=>r.firstDrop))],dropsBeforeFirstEnemyCapture:rows.filter(r=>r.firstDrop<r.firstEnemyCapture).length});
const kingExamples=all.flatMap((r:any)=>r.events.filter((e:any)=>e.king&&e.self&&e.escapingCheck).map((e:any)=>({gameId:r.id,ply:e.ply,event:e,following:r.events.slice(e.ply,e.ply+5)}))).slice(0,3);
const report={createdAt:new Date().toISOString(),sources:['reports/usi-selfplay.json','reports/recovery-no-book-hao-50.json','artifacts/experiments/opening-outcomes-v2/games.jsonl'],limitations:'One standard game versus 50 recovery games; historical engines differ. King-all examples use opening research games with forced first moves and books; not a controlled comparison.',standard:normal,recoverySummary:summary(recovery),recoveryGames:recovery,kingAll:{games:all.length,gamesWithKingRecovery:all.filter((r:any)=>r.events.some((e:any)=>e.king&&e.self)).length,kingExamples}};
fs.writeFileSync('reports/rule-content-comparison.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({standard:{...normal,events:normal.events.slice(0,24)},recoverySummary:report.recoverySummary,example:{...recovery[0],events:recovery[0].events.slice(0,22)},kingAll:report.kingAll},null,2));
