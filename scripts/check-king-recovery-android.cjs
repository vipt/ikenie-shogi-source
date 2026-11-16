const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const serial='emulator-5580',adbPath='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg='com.megurushogi.app';
const adb=(...a)=>execFileSync(adbPath,['-s',serial,...a],{encoding:'utf8',windowsHide:true,timeout:30000}),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function nodes(){for(let i=0;i<4;i++){const result=adb('shell','uiautomator','dump','/sdcard/meguru-limit-ui.xml');if(!result.includes('ERROR')){const xml=adb('exec-out','cat','/sdcard/meguru-limit-ui.xml');return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]])));}await delay(300);}throw Error('Fresh dump unavailable');}
const bounds=n=>n?.bounds?.match(/-?\d+/g).map(Number);function find(ns,id){return [...ns].sort((a,b)=>Number(b['resource-id']===id||b['content-desc']===id)-Number(a['resource-id']===id||a['content-desc']===id)).find(n=>{const b=bounds(n);return (n['resource-id']===id||n.text===id||n['content-desc']===id||n.text?.startsWith(id))&&b&&b[2]>b[0]&&b[3]>b[1];});}
async function locate(id){for(let i=0;i<12;i++){const ns=await nodes(),n=find(ns,id);if(n)return n;const b=bounds(ns[0]);adb('shell','input','swipe',String(b[2]/2),String(Math.round(b[3]*.75)),String(b[2]/2),String(Math.round(b[3]*.35)),'300');await delay(100);}throw Error('Missing '+id);}
async function tap(id){const b=bounds(await locate(id));adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));await delay(250);}
async function top(){for(let i=0;i<10;i++){const ns=await nodes();if(find(ns,'open-preferences'))return;const b=bounds(ns[0]);adb('shell','input','swipe',String(Math.round(b[2]*.95)),String(Math.round(b[3]*.25)),String(Math.round(b[2]*.95)),String(Math.round(b[3]*.8)),'300');}throw Error('Header missing');}
async function setLimit(n){await tap('move-limit-input');adb('shell','input','keyevent','123','67','67','67','67');adb('shell','input','text',String(n));adb('shell','input','keyevent','4');await delay(300);assert.equal((await locate('move-limit-input')).text,String(n));}
async function counts(s,g){const ns=await nodes();assert.equal(find(ns,'sente-recovery-count')?.text,`自駒回収 ${s}回`);assert.equal(find(ns,'gote-recovery-count')?.text,`自駒回収 ${g}回`);}
function shot(name){fs.writeFileSync('artifacts/screenshots/'+name+'.png',execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true}));}
(async()=>{
 adb('install','-r',process.argv[2]);adb('shell','pm','clear',pkg);adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');adb('shell','am','start','-n',pkg+'/.MainActivity');await delay(2000);await top();
 await tap('ひとりで練習');await tap('CPU同士で対局');await tap('やねうら王（端末内で動作）');await tap('強め');await setLimit(14);await tap('両者が回収できる');await tap('味方も相手も取れる');await tap('start-game');
 // Let a bounded CPU match finish; no UI automation interrupts the searches.
 await delay(48000);await top();let ns=await nodes();
 if(!find(ns,'game-result')){await delay(15000);await top();ns=await nodes();}
 assert(find(ns,'game-result'),'CPU match must finish');assert(!find(ns,'retry-cpu'),'No engine error');assert(!find(ns,'評価できません'));
 const ply=parseInt(ns.find(n=>/^\d+ 手目$/.test(n.text))?.text);assert(ply>0&&ply<=15);const result=find(ns,'game-result');
 shot('king-recovery-native-android');const label=(await locate('cpu-engine-label')).text;assert(label.includes('やねうら王 · Háo'));assert(label.includes('両者が回収できる'));assert(!label.includes('従来CPU'));
 // Confirm rule persistence after restarting only the disposable emulator app.
 adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/.MainActivity');await delay(2000);await top();assert(find(await nodes(),'game-result'));assert((await locate('cpu-engine-label')).text.includes('やねうら王 · Háo'));
 const report={createdAt:new Date().toISOString(),passed:true,serial,testApkSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'),settings:{mode:'watch',cpuEngine:'native',difficulty:'strong',kingCapture:'all',selfCapture:'both',moveLimit:14},engineLabel:label,plies:ply,completed:true,restored:true};
 fs.writeFileSync('reports/king-recovery-android.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{try{shot('king-recovery-android-failure');}catch{}console.error(e);process.exitCode=1;});
