import {readFileSync,writeFileSync} from 'node:fs';
import {createGame,play} from '../src/game/engine';
import {RECOVERY_RULES,moveFromUsi,toSfen} from './lib/usi-format';
const book=JSON.parse(readFileSync('artifacts/engines/recovery-v1/book-manifest.json','utf8'));
const report=JSON.parse(readFileSync('reports/book-vs-no-book-initial.json','utf8'));
const names:{[key:string]:string}={P:'歩',L:'香',N:'桂',S:'銀',G:'金',B:'角',R:'飛',K:'玉'};
function describe(moves:string[]){
  let g=createGame(RECOVERY_RULES);
  return moves.map(m=>{
    const move=moveFromUsi(m),p=g.position;
    const target=p.board[move.to],mover='from' in move?p.board[move.from]:null;
    g=play(g,move);
    return {move:m,label:g.log.at(-1)!.label,detail:target&&mover?(target.side===mover.side?'味方':'相手')+'の'+names[target.kind]+'を'+names[mover.kind]+'で取る':'drop' in move?names[move.drop]+'打ち':'移動'};
  });
}
function top(n:number){
  const counts=new Map<string,number>();
  for(const g of report.results){const k=g.moves.slice(0,n).join(' ');counts.set(k,(counts.get(k)??0)+1);}
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([s,count])=>({count,line:describe(s.split(' '))}));
}
const map=new Map(book.entries.map((e:any)=>[e.sfen,e]));
const chains=[];
for(const opening of [[],['3i2h']]){
  let g=createGame(RECOVERY_RULES);const moves=[...opening];
  for(const m of opening)g=play(g,moveFromUsi(m));
  while(moves.length<12){const e:any=map.get(toSfen(g.position,1,'recovery'));if(!e)break;moves.push(e.move);g=play(g,moveFromUsi(e.move));}
  chains.push(describe(moves));
}
const captureKinds=new Map<string,number>();
let captures=0,bookHits=0;
for(const r of report.results){
  for(const m of describe(r.moves.slice(0,6))){
    if(m.detail.startsWith('味方')){captures++;captureKinds.set(m.detail,(captureKinds.get(m.detail)??0)+1);}
  }
  bookHits+=r.searches.slice(0,6).filter((m:any)=>m.bookHit).length;
}
const analysis={games:20,top2:top(2),top4:top(4),top6:top(6),canonicalBookChains:chains,first6Stats:{moves:120,selfCaptures:captures,bookHits,types:[...captureKinds].sort((a,b)=>b[1]-a[1])}};
writeFileSync('reports/book-opening-patterns.json',JSON.stringify(analysis,null,2));
console.log(JSON.stringify(analysis.first6Stats));


