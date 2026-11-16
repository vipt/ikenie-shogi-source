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
 await top();let ns=nodes();const mode=ns.find(n=>n.text?.startsWith('CPU同士で対局'));assert(mode);await tap(mode.text);
 await scrollTo('専用定跡を使う');if(find(nodes(),'専用定跡を使う').checked!=='true')await tap('専用定跡を使う');
 const uid=Number(adb('shell','dumpsys','package',pkg).match(/(?:userId|appId)=(\d+)/)[1]),pid=Number(adb('shell','pidof',pkg).trim());
 const count=()=>{const lines=adb('shell','dumpsys','media.metrics').split('\n');const ids=new Set(lines.filter(l=>l.includes(', '+pid+', '+uid+')')).map(l=>l.match(/\{audio\.track\.(\d+),/)?.[1]).filter(Boolean));return lines.filter(l=>ids.has(l.match(/\{audio\.track\.(\d+),/)?.[1])&&l.includes('event#=start')).length;};
 const before=count();await scrollTo('start-game');await tap('start-game');await delay(6500);adb('shell','input','keyevent','3');await delay(700);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(1500);
 ns=nodes();const moves=ply(ns),sounds=count()-before;assert(moves>=8);assert.equal(sounds,moves,'Each fast book move should play a sound');assert(find(ns,'CPU対局を一時停止中'));assert(ns.some(n=>n.text?.includes('Háo＋定跡')));
 const report={createdAt:new Date().toISOString(),passed:true,moves,sounds,book:true,moveDelayMs:350,soundFileDurationMs:500};fs.writeFileSync('reports/presentation-fast-book-audio.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});