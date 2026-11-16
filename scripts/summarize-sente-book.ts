import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createGame,play} from '../src/game/engine';
import {moveFromUsi} from '../src/game/usi-format';
const input='reports/recovery-sente-book-hao-50.json';
const r=JSON.parse(readFileSync(input,'utf8'));assert.equal(r.complete,true);assert.equal(r.results.length,50);
const groups=new Map<string,{count:number;labels:string[];recovered:string[];gameIds:number[];bookHits:number[]}>();
const firstMoves=new Map<string,number>();
for(const row of r.results){
 assert.ok(row.replayVerified);
 for(const s of row.searches)assert.equal(s.bookEnabled,s.side==='sente');
 if(row.result.winner!=='sente')continue;
 let g=createGame(r.protocol.rules);const labels:string[]=[],recovered:string[]=[];
 for(const m of row.moves.slice(0,3)){const move=moveFromUsi(m),target=g.position.board[move.to];g=play(g,move);labels.push(g.log.at(-1)!.label);recovered.push(g.log.at(-1)!.selfCapture?target!.kind:'none');}
 const key=row.moves.slice(0,3).join(' '),v=groups.get(key)??{count:0,labels,recovered,gameIds:[],bookHits:[]};v.count++;v.gameIds.push(row.id+1);v.bookHits.push(row.searches.slice(0,3).filter((s:any)=>s.bookHit).length);groups.set(key,v);
 firstMoves.set(row.moves[0],(firstMoves.get(row.moves[0])??0)+1);
}
const analysis={source:input,summary:r.summary,winningFirst3:[...groups].map(([usi,v])=>({usi,...v})).sort((a,b)=>b.count-a.count),winningFirstMoveCounts:Object.fromEntries(firstMoves)};
assert.equal(analysis.winningFirst3.reduce((s,x)=>s+x.count,0),r.summary.senteWins);
writeFileSync('reports/recovery-sente-book-hao-openings.json',JSON.stringify(analysis,null,2));
console.log(JSON.stringify(analysis,null,2));
