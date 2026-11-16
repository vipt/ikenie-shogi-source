import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {CPU_LEVELS,cpuLevelProfile} from '../src/game/cpu-levels';
import {createGame,legalMoves} from '../src/game/engine';
import {moveToUsi} from '../src/game/usi-format';
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='emulator-5580',remote='/data/local/tmp/meguru-levels';
const run=(...a:string[])=>execFileSync(adb,['-s',serial,...a],{encoding:'utf8',windowsHide:true,timeout:30000});
run('shell','mkdir','-p',remote+'/hao');
for(const [a,b] of [['.tools/m-x64/meguru_cli','meguru_cli'],['modules/meguru-engine/assets/hao.nnue','hao/nn.bin'],['C:/Users/motok/AppData/Local/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/x86_64-linux-android/libc++_shared.so','libc++_shared.so']])run('push',a!,remote+'/'+b);
run('shell','chmod','755',remote+'/meguru_cli');
const legal=legalMoves(createGame({kingCapture:'all',selfCapture:'both'}).position).map(moveToUsi),results=[];
for(const level of CPU_LEVELS){const p=cpuLevelProfile(level),start=Date.now();const output=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao 7 '+p.timeMs+' no-book 320 '+p.nativeDepth],{input:'search\nquit\n',encoding:'utf8',windowsHide:true,timeout:30000});const a=JSON.parse(output.split(/\r?\n/).find(l=>l.startsWith('MOBILE_RESULT '))!.slice(14));assert(legal.includes(a.bestmove));assert.equal(a.depthLimit,p.nativeDepth);if(p.nativeDepth)assert(a.depth<=p.nativeDepth);const row={level,...p,wallMs:Date.now()-start,analysis:a};results.push(row);console.log(JSON.stringify(row));}
assert(results[0]!.analysis.nodes<results.at(-1)!.analysis.nodes);assert(results[0]!.analysis.depth<results.at(-1)!.analysis.depth);
const out=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao 7 100 no-book 320 1'],{input:'live\nsearch\nquit\n',encoding:'utf8',windowsHide:true,timeout:30000});assert(out.includes('MOBILE_CANCEL cancelled'));const after=JSON.parse(out.split(/\r?\n/).find(l=>l.startsWith('MOBILE_RESULT '))!.slice(14));assert.equal(after.depthLimit,1);assert(after.depth<=1);assert(legal.includes(after.bestmove));
const bad=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao 7 100 no-book 320 65'],{input:'search\nquit\n',encoding:'utf8',windowsHide:true,timeout:30000});assert(bad.includes('error:Invalid search depth'));
const report={createdAt:new Date().toISOString(),passed:true,serial,results,lowLevelAfterContinuousAnalysis:after,invalidDepthRejected:true,ratingsMeasured:false};writeFileSync('reports/cpu-levels-native.json',JSON.stringify(report,null,2));
