const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const adbPath='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg=process.env.MEGURU_TEST_PACKAGE||'com.megurushogi.app.test';
const adb=(...a)=>execFileSync(adbPath,['-s','emulator-5580',...a],{encoding:'utf8',windowsHide:true,timeout:30000});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>');
function nodes(){const dumped=adb('shell','uiautomator','dump','/sdcard/meguru-ui.xml');assert(!dumped.includes('ERROR'),'UIAutomator did not produce a fresh dump');const xml=adb('exec-out','cat','/sdcard/meguru-ui.xml');return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],decode(v[2])])));}
function find(ns,s){return [...ns].sort((a,b)=>Number(b['resource-id']===s||b['content-desc']===s)-Number(a['resource-id']===s||a['content-desc']===s)).find(n=>{const b=n.bounds?.match(/\d+/g).map(Number);return b&&b[3]>b[1]&&b[2]>b[0]&&(n['resource-id']===s||n.text===s||n['content-desc']===s||n.text?.startsWith(s));});}
async function tap(s){const n=find(nodes(),s);assert.ok(n,'Missing '+s);const b=n.bounds.match(/\d+/g).map(Number);adb('shell','input','tap',''+Math.round((b[0]+b[2])/2),''+Math.round((b[1]+b[3])/2));await delay(300);}
function ply(ns=nodes()){const n=ns.find(n=>/^\d+ 手目$/.test(n.text));assert.ok(n,'move count missing');return parseInt(n.text);}
function shot(s){fs.mkdirSync('artifacts/screenshots',{recursive:true});fs.writeFileSync('artifacts/screenshots/'+s+'.png',execFileSync(adbPath,['-s','emulator-5580','exec-out','screencap','-p'],{windowsHide:true}));}
async function scrollTo(s){for(let i=0;i<12;i++){if(find(nodes(),s))return;const ns=nodes(),raw=ns.find(n=>n['resource-id']===s||n.text===s||n['content-desc']===s);const b=raw?.bounds?.match(/-?\d+/g).map(Number);const down=b&&b[3]<200;adb('shell','input','swipe','540',down?'1100':'1600','540',down?'1600':'1100','600');await delay(200);}throw Error('Cannot scroll to '+s);}
async function top(){for(let i=0;i<7;i++){if(find(nodes(),'open-preferences'))return;adb('shell','input','swipe','1020','600','1020','2100','500');await delay(200);}throw Error('Cannot reach header');}
(async()=>{
 if(process.argv[2])adb('install','-r',process.argv[2]);
 adb('shell','pm','clear',pkg);adb('logcat','-c');adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');
 adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');
 let ns;for(let i=0;i<12;i++){await delay(1000);ns=nodes();if(find(ns,'sente-percent')?.text?.includes('%'))break;}
 const percentages=()=>{const a=nodes();const s=find(a,'sente-percent'),g=find(a,'gote-percent');assert(s&&g);const sv=Number(s.text.match(/(\d+)%/)?.[1]),gv=Number(g.text.match(/(\d+)%/)?.[1]);assert(Number.isFinite(sv)&&Number.isFinite(gv));assert.equal(sv+gv,100);return {sente:sv,gote:gv};};
 const before=percentages();console.log('Initial percentages '+JSON.stringify(before));
 await tap('square-70');await tap('square-61');
 for(let i=0;i<12;i++){await delay(1000);if(ply()>=2)break;}
 assert.equal(ply(),2);percentages();
 const pid=Number(adb('shell','pidof',pkg).trim().split(' ')[0]);const metrics=adb('shell','dumpsys','media.metrics');fs.writeFileSync('.tools/presentation-audio-metrics-on.txt',metrics);
 const packageDump=adb('shell','dumpsys','package',pkg),uid=Number(packageDump.match(/(?:userId|appId)=(\d+)/)?.[1]);
 fs.writeFileSync('.tools/presentation-audio-flinger-on.txt',adb('shell','dumpsys','media.audio_flinger'));
 const startsForPid=(text,ownerPid=pid)=>{const lines=text.split('\n');const ids=new Set(lines.filter(l=>l.includes(', '+ownerPid+', '+uid+')')).map(l=>l.match(/\{audio\.track\.(\d+),/)?.[1]).filter(Boolean));return lines.filter(l=>ids.has(l.match(/\{audio\.track\.(\d+),/)?.[1])&&l.includes('event#=start')).length;};
 const soundOnStarts=startsForPid(metrics);assert(soundOnStarts>=2,'Both human and CPU moves should start audio: '+soundOnStarts);
 await top();await tap('open-preferences');await tap('show-evaluation-switch');await tap('move-sound-switch');await tap('盤に戻る');
 assert(!find(nodes(),'evaluation-panel'),'Hidden evaluation');
 await scrollTo('↶ 待った');await tap('↶ 待った');await top();assert.equal(ply(),0);
 await tap('square-70');await tap('square-61');for(let i=0;i<12;i++){await delay(1000);if(ply()>=2)break;}
 assert.equal(ply(),2);assert(!find(nodes(),'evaluation-panel'));
 const offMetrics=adb('shell','dumpsys','media.metrics');fs.writeFileSync('.tools/presentation-audio-metrics-off.txt',offMetrics);assert.equal(startsForPid(offMetrics),soundOnStarts,'Sound disabled must not start new audio');
 adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(2000);assert.equal(ply(),2);assert(!find(nodes(),'evaluation-panel'));
 await tap('open-preferences');ns=nodes();assert.equal(find(ns,'show-evaluation-switch').checked,'false');assert.equal(find(ns,'move-sound-switch').checked,'false');await tap('show-evaluation-switch');await tap('move-sound-switch');await tap('盤に戻る');await delay(500);percentages();
 await scrollTo('投了');await tap('投了');await tap('投了する');await top();ns=nodes();assert(find(ns,'game-result'));assert(find(ns,'後手の勝ち'));assert(!find(ns,'閉じる'));assert.deepEqual(percentages(),{sente:0,gote:100});shot('presentation-result-android');
 adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(2000);ns=nodes();assert(find(ns,'game-result'));assert(!find(ns,'閉じる'));
 const mode=ns.find(n=>n.text?.startsWith('ひとりで練習'));await tap(mode.text);await tap('CPU同士で対局');await scrollTo('標準');await tap('標準');await scrollTo('start-game');await tap('start-game');
 await delay(12000);
 // Continuous progress updates can prevent UIAutomator from reaching an idle state.
 adb('shell','input','keyevent','3');await delay(600);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(1500);
 ns=nodes();assert(!find(ns,'retry-cpu'));assert(find(ns,'CPU対局を一時停止中'));assert(ply(ns)>=6);percentages();shot('presentation-watch-android');
 const watchMetrics=adb('shell','dumpsys','media.metrics');fs.writeFileSync('.tools/presentation-audio-metrics-watch.txt',watchMetrics);const watchSoundStarts=startsForPid(watchMetrics,Number(adb('shell','pidof',pkg).trim().split(' ')[0]));assert(watchSoundStarts>=6,'CPU spectator moves should play sounds');
 const logs=adb('logcat','-d','-s','AndroidRuntime:E','ReactNativeJS:W');fs.writeFileSync('.tools/presentation-android-errors.txt',logs);assert.doesNotMatch(logs,/FATAL EXCEPTION|CPU search failed|TypeError|ReferenceError/);
 const report={createdAt:new Date().toISOString(),passed:true,package:pkg,testApkSha256:process.argv[2]?require('node:crypto').createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'):null,uid,initialPercentages:before,preferencePersistence:true,livePreferencesPreserveGame:true,noTerminalDialog:true,restoredResult:true,watchWithEvaluation:true,watchPlies:ply(),audioMetricsCaptured:true,soundOnStarts,watchSoundStarts,nativeSoundOffVerified:true};fs.writeFileSync('reports/presentation-android-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{try{shot('presentation-android-failure');fs.writeFileSync('.tools/presentation-android-failure.json',JSON.stringify(nodes(),null,2));}catch{}console.error(e);process.exitCode=1;});