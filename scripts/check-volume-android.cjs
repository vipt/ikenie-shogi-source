const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const serial=process.argv[2];assert(serial,'Explicit device serial required');
const adbPath='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',pkg='com.megurushogi.app';
const adb=(...args)=>execFileSync(adbPath,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function nodes(){assert(!adb('shell','uiautomator','dump','/sdcard/meguru-volume-test.xml').includes('ERROR'));const xml=adb('exec-out','cat','/sdcard/meguru-volume-test.xml');return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(v=>[v[1],v[2]])));}
const bounds=n=>n?.bounds?.match(/-?\d+/g).map(Number);
function find(ns,id){return ns.find(n=>{const b=bounds(n);return (n['resource-id']===id||n.text===id||n['content-desc']===id)&&b&&b[2]>b[0]&&b[3]>b[1];});}
async function tap(id){let n;for(let i=0;i<6;i++){n=find(nodes(),id);if(n)break;const b=bounds(nodes()[0]);adb('shell','input','swipe',String(Math.round(b[2]*.5)),String(Math.round(b[3]*.75)),String(Math.round(b[2]*.5)),String(Math.round(b[3]*.35)),'300');await delay(200);}assert(n,'Missing '+id);const b=bounds(n);adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));await delay(150);}
async function top(){for(let i=0;i<8;i++){const ns=nodes();if(find(ns,'open-preferences'))return;const b=bounds(ns[0]);adb('shell','input','swipe',String(Math.round(b[2]*.62)),String(Math.round(b[3]*.2)),String(Math.round(b[2]*.62)),String(Math.round(b[3]*.85)),'300');}throw Error('Header missing');}
const readVolume=()=>parseInt(find(nodes(),'move-sound-volume')?.text);
async function setVolume(target){
 const v=readVolume();assert(Number.isInteger(v));if(v===target)return;
 const n=find(nodes(),v>target?'sound-volume-down':'sound-volume-up');assert(n);const b=bounds(n);
 for(let i=0;i<Math.abs(target-v)/5;i++){adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));await delay(80);}
 assert.equal(readVolume(),target);
}
function metrics(){return adb('shell','dumpsys','media.metrics');}
function volumes(text){return text.split('\n').filter(l=>l.includes('com.megurushogi.app')&&l.includes('event#=setVolume')).sort((a,b)=>(a.match(/\(\d\d-\d\d ([\d:.]+)/)?.[1]||'').localeCompare(b.match(/\(\d\d-\d\d ([\d:.]+)/)?.[1]||'')).map(l=>Number(l.match(/volume.left=([^,\)]+)/)?.[1])).filter(Number.isFinite);}
(async()=>{
 adb('shell','input','keyevent','3');await delay(500);adb('shell','am','start','-n',pkg+'/.MainActivity');await delay(1500);if(find(nodes(),'盤に戻る'))await tap('盤に戻る');await top();const before=nodes().find(n=>/^\d+ 手目$/.test(n.text))?.text;await tap('open-preferences');const original=Number(process.env.MEGURU_ORIGINAL_VOLUME??readVolume());assert(Number.isInteger(original));const soundWasOn=find(nodes(),'move-sound-switch').checked==='true';
 if(!soundWasOn)await tap('move-sound-switch');
 await setVolume(25);await tap('sound-preview');await delay(750);const low=volumes(metrics());assert.equal(low.at(-1),.25,'Native low volume');console.log('Native preview 25% verified');
 await setVolume(100);await tap('sound-preview');await delay(750);const high=volumes(metrics());assert.equal(high.at(-1),1,'Native full volume');console.log('Native preview 100% verified');
 await setVolume(0);assert.equal(find(nodes(),'sound-preview').enabled,'false');assert.equal(find(nodes(),'sound-volume-down').enabled,'false');
 await setVolume(75);await tap('move-sound-switch');assert.equal(find(nodes(),'sound-preview').enabled,'false');assert.equal(find(nodes(),'sound-volume-up').enabled,'false');await tap('move-sound-switch');
 await setVolume(40);await tap('盤に戻る');await delay(1000);adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/.MainActivity');await delay(1500);await top();const after=nodes().find(n=>/^\d+ 手目$/.test(n.text))?.text;assert.equal(after,before,'Existing game must be retained');await tap('open-preferences');assert.equal(readVolume(),40);
 await setVolume(original);if(!soundWasOn)await tap('move-sound-switch');
 fs.writeFileSync('artifacts/screenshots/volume-settings-android.png',execFileSync(adbPath,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true}));
 const report={createdAt:new Date().toISOString(),passed:true,serial,testApkSha256:process.argv[3]?require('node:crypto').createHash('sha256').update(fs.readFileSync(process.argv[3])).digest('hex'):null,previewVolumes:[25,100],savedVolumeVerified:40,restoredOriginalVolume:original,zeroAndOffDisablePreview:true,existingGameRetained:before===after,gamePly:after};fs.writeFileSync('reports/presentation-volume-android.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
