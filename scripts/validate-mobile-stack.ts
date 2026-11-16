import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import assert from 'node:assert/strict';
import {createGame,play,legalMoves,sameMove,type Position} from '../src/game/engine';
import {gameToUsiPosition,moveFromUsi} from '../src/game/usi-format';

const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const serial=process.env.MEGURU_TEST_SERIAL;
if(!serial)throw Error('Set MEGURU_TEST_SERIAL explicitly');
const remote='/data/local/tmp/meguru-crash-check';
async function main(){
const results=[];
for(const test of [{name:'saved-75th-position',ms:2400,max:120,position:JSON.parse(readFileSync('tests/fixtures/mobile-stack-position.json','utf8')) as Position},{name:'initial-position',ms:2400,max:160,position:undefined}]){
 const child=spawn(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/fixed '+remote+'/eval 3 '+test.ms],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let pending:{resolve:(s:string)=>void,reject:(e:Error)=>void}|null=null,closed=false,stderr='';
 const reader=createInterface({input:child.stdout});
 reader.on('line',line=>{if(line.startsWith('MOBILE_RESULT ')||line.startsWith('MOBILE_STACK ')){const p=pending;pending=null;p?.resolve(line.slice(line.indexOf(' ')+1));}});
 child.stderr.on('data',d=>{stderr+=d.toString();});
 child.on('exit',code=>{closed=true;pending?.reject(Error('Engine exited '+code+' '+stderr));});
 child.on('error',e=>pending?.reject(e));
 const ask=(input:string,prefix='analyze ')=>new Promise<string>((resolve,reject)=>{if(closed){reject(Error('Engine already closed'));return;}const timer=setTimeout(()=>{child.kill();reject(Error('Engine response timed out'));},20000);pending={resolve:s=>{clearTimeout(timer);resolve(s);},reject:e=>{clearTimeout(timer);reject(e);}};child.stdin.write(prefix+input+'\n');});
 let g=createGame({kingCapture:'enemy',selfCapture:'both'},test.position);
 const records=[];const start=Date.now();
 try{
  const stackBytes=Number(await ask('stack',''));assert.ok(stackBytes>=8*1024*1024,'Engine worker stack must be at least 8 MiB');
  for(let ply=0;ply<test.max&&!g.result;ply++){
   const raw=await ask(gameToUsiPosition(g,'recovery'));assert.ok(!raw.startsWith('error:'),raw);
   const result=JSON.parse(raw);assert.notEqual(result.bestmove,'resign');
   const move=moveFromUsi(result.bestmove);assert.ok(legalMoves(g.position).some(m=>sameMove(m,move)),result.bestmove);
   g=play(g,move);records.push({...result,ply:ply+1});
   if((ply+1)%10===0)console.log(JSON.stringify({test:test.name,plies:ply+1,elapsedSeconds:Math.round((Date.now()-start)/1000)}));
   writeFileSync('artifacts/crash-20261114/stress-progress.json',JSON.stringify({test:test.name,plies:ply+1,records,result:g.result},null,2));
  }
  results.push({test:test.name,stackBytes,plies:g.log.length,elapsedSeconds:(Date.now()-start)/1000,result:g.result,records});
  writeFileSync('reports/mobile-stack-regression.json',JSON.stringify({serial,results},null,2));
  console.log(JSON.stringify({finished:test.name,plies:g.log.length,result:g.result}));
 }finally{child.stdin.end('quit\n');reader.close();}
}
console.log('Real device native self-play PASS');

}
main().catch(e=>{console.error(e);process.exitCode=1;});
