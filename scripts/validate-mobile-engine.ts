import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createGame,play,legalMoves,applyUnchecked,isInCheck} from '../src/game/engine';
import {gameToUsiPosition,moveToUsi,moveFromUsi,toSfen,type UsiRuleMode} from '../src/game/usi-format';
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const run=(...args:string[])=>execFileSync(adb,['-s','emulator-5580',...args],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:40*1024*1024});
const remote='/data/local/tmp/meguru-mobile';
run('shell','mkdir','-p',remote+'/hao',remote+'/trained');
for(const [from,to] of [
 ['.tools/m-x64/meguru_cli',remote+'/meguru_cli'],
 ['C:/Users/motok/AppData/Local/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/x86_64-linux-android/libc++_shared.so',remote+'/libc++_shared.so'],
 ['modules/meguru-engine/assets/hao.nnue',remote+'/hao/nn.bin'],
 ['modules/meguru-engine/assets/trained.nnue',remote+'/trained/nn.bin']
])run('push',from!,to!);
run('shell','chmod','755',remote+'/meguru_cli');
let seed=20261114;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const results=[];
for(const [mask,selfCapture,mode] of [[0,'none','standard'],[1,'sente','asymmetric-sente'],[2,'gote','asymmetric-gote'],[3,'both','recovery']] as const){
 const games:ReturnType<typeof createGame>[]=[];let g=createGame({kingCapture:'enemy',selfCapture});
 for(let n=0;n<50&&!g.result;n++){games.push(g);const moves=legalMoves(g.position);const rec=moves.filter(m=>'from'in m&&g.position.board[m.to]?.side===g.position.turn);const candidates=rec.length&&random()<.4?rec:moves;g=play(g,candidates[Math.floor(random()*candidates.length)]!);}
 const input=games.map(g=>gameToUsiPosition(g,mode)).concat(['search','quit']).join('\n')+'\n';
 const output=execFileSync(adb,['-s','emulator-5580','shell', 'LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao '+mask],{input,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:40*1024*1024});
 const probes=output.split(/\r?\n/).filter(l=>l.startsWith('MOBILE_PROBE ')).map(l=>JSON.parse(l.slice(13)));
 assert.equal(probes.length,games.length,output.slice(-2000));let transitions=0;
 probes.forEach((p,i)=>{const game=games[i]!;assert.ok(p.valid);assert.equal(p.recoveryMask,mask);assert.equal(p.inCheck,isInCheck(game.position,game.position.turn));assert.deepEqual(p.children.map((c:any)=>c.move).sort(),legalMoves(game.position).map(moveToUsi).sort());for(const c of p.children){assert.ok(c.valid);assert.equal(c.sfen,toSfen(applyUnchecked(game.position,moveFromUsi(c.move)),game.log.length+2,mode as UsiRuleMode));transitions++;}});
 const result=JSON.parse(output.split(/\r?\n/).find(l=>l.startsWith('MOBILE_RESULT '))!.slice(14));
 assert.ok(legalMoves(createGame({kingCapture:'enemy',selfCapture}).position).map(moveToUsi).includes(result.bestmove));
 results.push({mask,positions:games.length,transitions,search:result});console.log(JSON.stringify(results.at(-1)));
}
const trained=execFileSync(adb,['-s','emulator-5580','shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/trained 3'],{input:'search\nquit\n',encoding:'utf8',windowsHide:true,timeout:120000});
assert.match(trained,/MOBILE_RESULT \{"bestmove":"/);
mkdirSync('reports',{recursive:true});writeFileSync('reports/mobile-engine-validation.json',JSON.stringify({createdAt:new Date().toISOString(),platform:'Android x86_64 emulator, 16KB pages',results,trainedSearch:true},null,2));
console.log('Android native rule parity and both evaluations PASS');

