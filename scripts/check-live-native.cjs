const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='ZY22H5QCNM',remote='/data/local/tmp/meguru-live-validation';
const run=(...a)=>execFileSync(adb,['-s',serial,...a],{encoding:'utf8',windowsHide:true,timeout:60000});
run('shell','mkdir','-p',remote+'/hao');
for(const [from,to] of [['.tools/m-arm64/meguru_cli',remote+'/meguru_cli'],['C:/Users/motok/AppData/Local/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/aarch64-linux-android/libc++_shared.so',remote+'/libc++_shared.so'],['modules/meguru-engine/assets/hao.nnue',remote+'/hao/nn.bin'],['modules/meguru-engine/assets/user_book1.db',remote+'/hao/user_book1.db']])run('push',from,to);
run('shell','chmod','755',remote+'/meguru_cli');const rows=[];
for(const mask of [0,3]){
 const out=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao '+mask+' 100 '+(mask===3?'book':'')],{input:'stack\nlive\nsearch\nquit\n',encoding:'utf8',windowsHide:true,timeout:30000});fs.writeFileSync('.tools/live-native-'+mask+'.log',out);
 const updates=out.split(/\r?\n/).filter(l=>l.startsWith('MOBILE_PROGRESS ')).map(l=>JSON.parse(l.slice(16))).filter(a=>Number.isFinite(a.scoreCp));assert(updates.length>3);assert(updates.at(-1).depth>updates[0].depth);assert(new Set(updates.map(a=>a.scoreCp)).size>1);assert(out.includes('MOBILE_CANCEL cancelled'));assert(out.includes('MOBILE_STALE {}'));
 const cancelMs=Number(out.match(/MOBILE_CANCEL cancelled (\d+)/)[1]);assert(cancelMs<1000);const result=JSON.parse(out.split(/\r?\n/).find(l=>l.startsWith('MOBILE_RESULT ')).slice(14));assert(result.bestmove&&Number.isFinite(result.scoreCp));assert(Number(out.match(/MOBILE_STACK (\d+)/)[1])>=8*1024*1024);
 rows.push({mask,book:mask===3,updates,cancelMs,nextSearch:result});
}
const report={createdAt:new Date().toISOString(),passed:true,serial,rows};fs.writeFileSync('reports/presentation-live-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
