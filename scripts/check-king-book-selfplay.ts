import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createGame,play} from '../src/game/engine';
import {moveFromUsi,gameToUsiPosition,toSfen} from '../src/game/usi-format';
const remote='/data/local/tmp/meguru-king-book',m=JSON.parse(readFileSync('artifacts/engines/king-recovery-book-v1/book-manifest.json','utf8')),entries=new Map(m.entries.map((e:any)=>[e.sfen,e]));
async function run(index:number){
 const child=spawn('C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',['-s','emulator-5580','shell',`LD_LIBRARY_PATH=${remote} ${remote}/meguru_cli ${remote}/hao 7 100 book 320`],{windowsHide:true,stdio:'pipe'}),lines=createInterface({input:child.stdout});let response:((s:string)=>void)|undefined,fail:((e:Error)=>void)|undefined;let stderr='';child.stderr.on('data',d=>stderr+=d);child.on('error',e=>fail?.(e));const exited=new Promise<void>(resolve=>child.on('close',code=>{fail?.(Error('Engine exit '+code+' '+stderr));resolve();}));lines.on('line',s=>{if(s.startsWith('MOBILE_RESULT '))response?.(s.slice(14));});
 let g=createGame({kingCapture:'all',selfCapture:'both',moveLimit:320}),hits=0,offBook=0;const analyses=[];
 try{for(let ply=0;ply<60&&!g.result;ply++){
  const a:any=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Search timeout'));},20000);fail=e=>{clearTimeout(timer);reject(e);};response=s=>{clearTimeout(timer);fail=undefined;try{resolve(JSON.parse(s));}catch(e){reject(e);}};child.stdin.write('analyze '+gameToUsiPosition(g,'mobile-king-all')+'\n');});
  const e:any=entries.get(toSfen(g.position,1,'mobile-king-all'));if(ply<24&&e){assert.equal(a.nodes,0);assert(e.moves.some((v:any)=>v.move===a.bestmove));hits++;}else if(a.nodes>0)offBook++;
  assert.notEqual(a.bestmove,'resign');g=play(g,moveFromUsi(a.bestmove));analyses.push(a);
 }}finally{fail=undefined;child.stdin.end('quit\n');await exited;lines.close();}
 assert(hits>=24||g.result);assert(offBook>0||g.result);return {index,plies:g.log.length,bookHits:hits,searchedMoves:offBook,result:g.result,moves:g.log,analyses};
}
(async()=>{const games=await Promise.all([0,1,2,3].map(run));const r={createdAt:new Date().toISOString(),passed:true,bookSha256:m.sha256,rule:'king recovery, both sides',games,scope:'Four 60-ply integration runs; not a strength or win-rate measurement.'};writeFileSync('reports/king-book-selfplay.json',JSON.stringify(r,null,2));console.log(JSON.stringify(games.map(g=>({index:g.index,plies:g.plies,bookHits:g.bookHits,searchedMoves:g.searchedMoves,result:g.result}))));})().catch(e=>{console.error(e);process.exitCode=1;});
