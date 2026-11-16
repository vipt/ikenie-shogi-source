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
 adb('shell','pm','clear',pkg);adb('logcat','-c');adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');
 adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');
 let ns;
 for(let i=0;i<12;i++){await delay(1000);ns=nodes();if(ns.some(n=>/^(ひとりで練習|CPU同士で対局|ふたりで対局)/.test(n.text)))break;}
 const mode=ns.find(n=>/^(ひとりで練習|CPU同士で対局|ふたりで対局)/.test(n.text));assert(mode);await tap(mode.text);
 await tap('CPU同士で対局');await scrollTo('Háo（標準）');await tap('Háo（標準）');
 await scrollTo('専用定跡を使う');let sw=find(nodes(),'専用定跡を使う');if(sw.checked!=='true')await tap('専用定跡を使う');
 ns=nodes();assert.equal(find(ns,'専用定跡を使う').checked,'true');assert(ns.some(n=>n.text?.includes('Háo（標準）')&&n.text.includes('✓')));shot('book-v2-settings');
 await scrollTo('start-game');await tap('start-game');
 let count=0;for(let i=0;i<25;i++){await delay(1500);ns=nodes();assert(!find(ns,'CPUを再試行'),'CPU error');count=ply(ns);if(count>=26)break;}
 assert(count>=26,'Opening did not progress past book');assert(ns.some(n=>n.text?.includes('Háo＋定跡')),'Model/book label wrong');
 assert(adb('shell','dumpsys','window').split('\n').some(l=>l.includes('mHoldScreenWindow=')&&l.includes(pkg)),'Screen should stay on');
 await tap('toggle-autoplay');const saved=ply();shot('book-v2-watch');
 adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(2000);
 ns=nodes();assert.equal(ply(ns),saved);assert(find(ns,'CPU対局を一時停止中'));assert(ns.some(n=>n.text?.includes('Háo＋定跡')));
 const logs=adb('logcat','-d','-s','AndroidRuntime:E','ReactNativeJS:W');assert.doesNotMatch(logs,/FATAL EXCEPTION|CPU search failed|TypeError|ReferenceError/);
 const report={createdAt:new Date().toISOString(),package:pkg,passed:true,haoPreservedWhenEnablingBook:true,bookPast24Plies:true,plies:saved,keepAwake:true,restore:true};fs.writeFileSync('reports/recovery-book-v2-mobile-ui.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{try{shot('book-v2-ui-failure');fs.writeFileSync('.tools/book-v2-ui-failure.json',JSON.stringify(nodes(),null,2));}catch{}console.error(e);process.exitCode=1;});