const {execFileSync}=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict');
const adbPath='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg=process.env.MEGURU_TEST_PACKAGE||'com.megurushogi.app.test';
const adb=(...a)=>execFileSync(adbPath,['-s','emulator-5580',...a],{encoding:'utf8',windowsHide:true,timeout:30000});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>');
function nodes(){adb('shell','uiautomator','dump','/sdcard/meguru-ui.xml');const xml=adb('exec-out','cat','/sdcard/meguru-ui.xml');return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],decode(v[2])])));}
function find(ns,s){return [...ns].sort((a,b)=>Number(b['resource-id']===s||b['content-desc']===s)-Number(a['resource-id']===s||a['content-desc']===s)).find(n=>{const b=n.bounds?.match(/\d+/g).map(Number);return b&&b[3]>b[1]&&b[2]>b[0]&&(n['resource-id']===s||n.text===s||n['content-desc']===s||n.text?.startsWith(s));});}
async function tap(s){const n=find(nodes(),s);assert.ok(n,'Missing '+s);const b=n.bounds.match(/\d+/g).map(Number);adb('shell','input','tap',''+Math.round((b[0]+b[2])/2),''+Math.round((b[1]+b[3])/2));await delay(300);}
function ply(ns=nodes()){const n=ns.find(n=>/^\d+ 手目$/.test(n.text));assert.ok(n,'move count missing');return parseInt(n.text);}
function shot(s){fs.mkdirSync('artifacts/screenshots',{recursive:true});fs.writeFileSync('artifacts/screenshots/'+s+'.png',execFileSync(adbPath,['-s','emulator-5580','exec-out','screencap','-p'],{windowsHide:true}));}
async function scrollTo(s){for(let i=0;i<12;i++){if(find(nodes(),s))return;const ns=nodes(),raw=ns.find(n=>n['resource-id']===s||n.text===s||n['content-desc']===s);const b=raw?.bounds?.match(/-?\d+/g).map(Number);const down=b&&b[3]<200;adb('shell','input','swipe','540',down?'1100':'1600','540',down?'1600':'1100','600');await delay(200);}throw Error('Cannot scroll to '+s);}
(async()=>{
 if(process.argv[2])adb('install','-r',process.argv[2]);
 adb('logcat','-c');adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');
 adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(3500);
 let ns=nodes();fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/mobile-ui-initial.json',JSON.stringify(ns,null,2));shot('mobile-initial');
 assert.equal(ns.filter(n=>/^square-\d+$/.test(n['resource-id'])).length,81);
 assert.match(find(ns,'cpu-engine-label').text,/やねうら王/);
 await tap('ひとりで練習');await tap('CPU同士で対局');await scrollTo('start-game');await tap('start-game');
 await delay(8500);assert.ok(ply()>=2,'CPU must play both sides');await scrollTo('toggle-autoplay');await tap('toggle-autoplay');
 const stopped=ply();await delay(3500);assert.equal(ply(),stopped,'pause must reject late engine results');shot('mobile-watch-paused');
 await tap('toggle-autoplay');await delay(3500);assert.ok(ply()>stopped,'resume advances game');
 adb('shell','input','keyevent','3');await delay(3500);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(1000);
 ns=nodes();assert.ok(find(ns,'CPU対局を一時停止中'),'background pauses autoplay');const saved=ply(ns);
 adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(2000);
 ns=nodes();assert.equal(ply(ns),saved,'saved game restored');assert.ok(find(ns,'CPU対局を一時停止中'),'restore is paused');
 await scrollTo('↶ 待った');await tap('↶ 待った');adb('shell','input','swipe','1040','500','1040','2200','400');await delay(300);assert.equal(ply(),saved-1);shot('mobile-watch-restored');
 const logs=adb('logcat','-d','-s','AndroidRuntime:E','ReactNativeJS:W');fs.writeFileSync('artifacts/mobile-ui-log.txt',logs);assert.doesNotMatch(logs,/FATAL EXCEPTION|CPU search failed|TypeError|ReferenceError|Invariant Violation/);
 console.log(JSON.stringify({passed:true,offline:true,native:true,pauseResume:true,backgroundPause:true,restore:true,undo:true,pliesBeforeUndo:saved}));
})().catch(e=>{try{shot('mobile-failure');fs.writeFileSync('artifacts/mobile-ui-failure.json',JSON.stringify(nodes(),null,2));}catch{}console.error(e);process.exitCode=1;});

