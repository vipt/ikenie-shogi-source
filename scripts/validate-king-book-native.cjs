const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',remote='/data/local/tmp/meguru-king-book';
const run=(...args)=>execFileSync(adb,['-s','emulator-5580',...args],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
run('shell','mkdir','-p',remote+'/hao');
for(const [from,to] of [
 ['.tools/m-x64/meguru_cli',remote+'/meguru_cli'],
 ['C:/Users/motok/AppData/Local/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/x86_64-linux-android/libc++_shared.so',remote+'/libc++_shared.so'],
 ['modules/meguru-engine/assets/hao.nnue',remote+'/hao/nn.bin'],
 ['modules/meguru-engine/assets/king_recovery_book.db',remote+'/hao/king_recovery_book.db']])run('push',from,to);
run('shell','chmod','755',remote+'/meguru_cli');
const m=JSON.parse(fs.readFileSync('artifacts/engines/king-recovery-book-v1/book-manifest.json'));
const input=['stack',...Array(240).fill('search'),...m.entries.map(e=>'analyze position sfen '+e.sfen),'quit'].join('\n')+'\n';
const out=execFileSync(adb,['-s','emulator-5580','shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao 7 100 book'],{input,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024});
fs.writeFileSync('.tools/king-book-native-output.log',out);
const results=out.split(/\r?\n/).filter(l=>l.startsWith('MOBILE_RESULT ')).map(l=>JSON.parse(l.slice(14)));
assert.equal(results.length,240+m.entries.length);
const rootCounts={};for(const a of results.slice(0,240)){assert.equal(a.nodes,0);assert(m.rootMoves.some(v=>v.move===a.bestmove));rootCounts[a.bestmove]=(rootCounts[a.bestmove]||0)+1;}
assert.equal(Object.keys(rootCounts).length,m.rootMoves.length);
for(let i=0;i<m.entries.length;i++){const a=results[i+240];assert.equal(a.nodes,0,'Book miss '+m.entries[i].sfen);assert(m.entries[i].moves.some(v=>v.move===a.bestmove),'Wrong book move '+m.entries[i].sfen);}
const stackBytes=Number(out.match(/MOBILE_STACK (\d+)/)?.[1]);assert(stackBytes>=8*1024*1024);
const report={createdAt:new Date().toISOString(),platform:'Android x86_64, 16KB page emulator',bookSha256:m.sha256,positionsVerified:m.entries.length,initialSelections:240,rootCounts,stackBytes,passed:true};
fs.writeFileSync('reports/king-book-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
