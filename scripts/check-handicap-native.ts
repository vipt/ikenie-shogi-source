// Android emulator parity/search check. Build .tools/m-x64/meguru_cli first.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createGame,play,legalMoves,applyUnchecked,isInCheck} from '../src/game/engine';
import {HANDICAP_KINDS} from '../src/game/handicap';
import {gameToUsiPosition,moveToUsi,moveFromUsi,toSfen,type UsiRuleMode} from '../src/game/usi-format';
const adb=process.env.ADB??'C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const serial=process.env.ANDROID_SERIAL??'emulator-5580';
const remote='/data/local/tmp/meguru-handicap';
const run=(...args:string[])=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:40*1024*1024});
run('shell','mkdir','-p',remote+'/hao');
for(const [from,to] of [
 ['.tools/m-x64/meguru_cli',remote+'/meguru_cli'],
 ['C:/Users/motok/AppData/Local/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/x86_64-linux-android/libc++_shared.so',remote+'/libc++_shared.so'],
 ['modules/meguru-engine/assets/hao.nnue',remote+'/hao/nn.bin'],
])run('push',from!,to!);
run('shell','chmod','755',remote+'/meguru_cli');
const results=[];
for(let mask=0;mask<8;mask++){
 const selfCapture=(['none','sente','gote','both'] as const)[mask&3]!;
 const kingCapture=mask&4?'all' as const:'enemy' as const;
 const mode:UsiRuleMode=mask&4?'mobile-king-all':mask===0?'standard':mask===3?'recovery':mask===1?'asymmetric-sente':'asymmetric-gote';
 const starts=HANDICAP_KINDS.flatMap(kind=>(['sente','gote'] as const).map(side=>createGame({kingCapture,selfCapture,handicap:{kind,side}})));
 const games=starts.flatMap(g=>[g,play(g,legalMoves(g.position)[0]!)]);
 const input=[...games.map(g=>gameToUsiPosition(g,mode)),...starts.flatMap(g=>['newgame','analyze '+gameToUsiPosition(g,mode)]),'quit'].join('\n')+'\n';
 const output=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao '+mask+' 50'],{input,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:40*1024*1024});
 const probes=output.split(/\r?\n/).filter(s=>s.startsWith('MOBILE_PROBE ')).map(s=>JSON.parse(s.slice(13)));
 assert.equal(probes.length,games.length,output.slice(-2000));
 let transitions=0;
 probes.forEach((p,i)=>{
  const g=games[i]!;assert(p.valid);assert.equal(p.inCheck,isInCheck(g.position,g.position.turn));
  assert.deepEqual(p.children.map((c:any)=>c.move).sort(),legalMoves(g.position).map(moveToUsi).sort());
  for(const child of p.children){assert(child.valid);assert.equal(child.sfen,toSfen(applyUnchecked(g.position,moveFromUsi(child.move)),g.log.length+2,mode));transitions++;}
 });
 const searches=output.split(/\r?\n/).filter(s=>s.startsWith('MOBILE_RESULT ')).map(s=>JSON.parse(s.slice(14)));
 assert.equal(searches.length,starts.length);
 searches.forEach((s,i)=>{assert(legalMoves(starts[i]!.position).map(moveToUsi).includes(s.bestmove));assert(Number.isFinite(s.scoreCp));});
 results.push({mask,positions:games.length,transitions,searches:searches.length});console.log(JSON.stringify(results.at(-1)));
}
mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/handicap-native-validation.json',JSON.stringify({serial,results},null,2));
console.log('PASS: all handicaps, both sides, all eight recovery masks, native legal moves and searches.');
