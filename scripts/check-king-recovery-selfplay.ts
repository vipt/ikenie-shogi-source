import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {createGame,play,legalMoves} from '../src/game/engine';
import {gameToUsiPosition,moveFromUsi,moveToUsi} from '../src/game/usi-format';
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='emulator-5580',remote='/data/local/tmp/meguru-king-all';
async function opening(index:number,plies:number,ms:number,model='hao'){
 const child=spawn(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/'+model+' 7 '+ms+' no-book 320'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let pending:((s:string)=>void)|undefined,failed:((e:Error)=>void)|undefined;const lines=createInterface({input:child.stdout});let errors='';child.stderr.on('data',b=>errors+=b);
 lines.on('line',line=>{if(line.startsWith('MOBILE_RESULT ')){const cb=pending;pending=undefined;cb?.(line.slice(14));}});child.on('exit',code=>{if(pending)failed?.(Error('Engine exited '+code+' '+errors));});
 let g=createGame({kingCapture:'all',selfCapture:'both',moveLimit:320});const analyses=[];
 try{
  for(let n=0;n<plies&&!g.result;n++){
   const raw=await new Promise<string>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(Error('Search timeout'));},20000);pending=s=>{clearTimeout(timer);resolve(s);};failed=e=>{clearTimeout(timer);reject(e);};child.stdin.write('analyze '+gameToUsiPosition(g,'mobile-king-all')+'\n');});
   assert(!raw.startsWith('error:'),raw);const a=JSON.parse(raw);assert(legalMoves(g.position).map(moveToUsi).includes(a.bestmove));g=play(g,moveFromUsi(a.bestmove));analyses.push(a);
  }
 }finally{child.stdin.end('quit\n');lines.close();}
 const row={index,model,ms,plies:g.log.length,firstThree:g.log.slice(0,3).map(m=>moveToUsi(m.move)),result:g.result,recoveries:g.log.filter(m=>m.selfCapture).length,moves:g.log,analyses};console.log(JSON.stringify({index,model,ms,plies:row.plies,firstThree:row.firstThree,candidates:analyses.slice(0,3).map(a=>a.openingCandidates)}));return row;
}
async function main(){
 const openings=[];for(let n=0;n<8;n++)openings.push(await opening(n,6,2400));
 const stress=await opening(8,100,100),trained=await opening(9,16,100,'trained');
 const live=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao 7 100'],{input:'stack\nlive\nsearch\nquit\n',encoding:'utf8',windowsHide:true,timeout:30000});
 assert(live.includes('MOBILE_CANCEL cancelled'));assert(live.includes('MOBILE_STALE {}'));const updates=live.split(/\r?\n/).filter(l=>l.startsWith('MOBILE_PROGRESS ')).map(l=>JSON.parse(l.slice(16)));assert(updates.some(a=>a.depth>1));
 const report={createdAt:new Date().toISOString(),passed:true,platform:'Android x86_64 emulator',openingGames:8,pliesPerOpening:6,movetimeMs:2400,uniqueFirstMoves:new Set(openings.map(g=>g.firstThree[0])).size,uniqueFirstThree:new Set(openings.map(g=>g.firstThree.join(' '))).size,openings,stress,trained,continuousAnalysis:{updates,cancellation:true,staleFiltered:true}};
 writeFileSync('reports/king-recovery-selfplay.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,uniqueFirstMoves:report.uniqueFirstMoves,uniqueFirstThree:report.uniqueFirstThree}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
