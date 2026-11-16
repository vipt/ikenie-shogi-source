const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',remote='/data/local/tmp/meguru-evaluation';
const run=(...a)=>execFileSync(adb,['-s','emulator-5580',...a],{encoding:'utf8',windowsHide:true,timeout:60000});
run('shell','mkdir','-p',remote+'/hao');
for(const [from,to] of [['.tools/m-x64/meguru_cli',remote+'/meguru_cli'],['C:/Users/motok/AppData/Local/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/x86_64-linux-android/libc++_shared.so',remote+'/libc++_shared.so'],['modules/meguru-engine/assets/hao.nnue',remote+'/hao/nn.bin'],['modules/meguru-engine/assets/user_book1.db',remote+'/hao/user_book1.db']])run('push',from,to);
run('shell','chmod','755',remote+'/meguru_cli');
const input='stack\nsearch\nanalyze position sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1 moves 7g7f\nquit\n';
const rows=[];
for(const [mask,book] of [[0,false],[1,false],[2,false],[3,false],[3,true]]){
 const out=execFileSync(adb,['-s','emulator-5580','shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao '+mask+' 100 '+(book?'book':'')],{input,encoding:'utf8',windowsHide:true,timeout:60000});
 const results=out.split(/\r?\n/).filter(l=>l.startsWith('MOBILE_RESULT ')).map(l=>JSON.parse(l.slice(14)));
 assert.equal(results.length,2);for(const a of results)assert(Number.isFinite(a.scoreCp)&&Math.abs(a.scoreCp)<=30000);assert(Number(out.match(/MOBILE_STACK (\d+)/)[1])>=8*1024*1024);
 rows.push({mask,book,results});
}
fs.writeFileSync('reports/mobile-evaluation-validation.json',JSON.stringify({createdAt:new Date().toISOString(),passed:true,rows},null,2));console.log(JSON.stringify(rows));
