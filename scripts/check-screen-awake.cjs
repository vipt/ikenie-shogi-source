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
function holdScreen(){return adb('shell','dumpsys','window').split('\n').find(l=>l.includes('mHoldScreenWindow='))||'';}
function isHeld(){return holdScreen().includes(pkg);}
(async()=>{
 const timeout=adb('shell','settings','get','system','screen_off_timeout').trim();
 const stayOn=adb('shell','settings','get','global','stay_on_while_plugged_in').trim();
 try{
  if(process.argv[2])adb('install','-r',process.argv[2]);
  adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');
  adb('shell','settings','put','system','screen_off_timeout','15000');
  adb('shell','settings','put','global','stay_on_while_plugged_in','0');
  adb('shell','am','force-stop',pkg);adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(2200);
  for(let i=0;i<10;i++){if(nodes().some(n=>/^(ひとりで練習|CPU同士で対局|ふたりで対局)/.test(n.text)))break;adb('shell','input','keyevent','224');await delay(1000);}
  const startMode=async label=>{
   const mode=nodes().find(n=>/^(ひとりで練習|CPU同士で対局|ふたりで対局)/.test(n.text));
   assert.ok(mode);await tap(mode.text);assert.equal(isHeld(),false,'settings release keep-screen-on');
   await tap(label);await scrollTo('start-game');await tap('start-game');await delay(700);
  };
  await startMode('ひとりで練習');assert.ok(isHeld(),'human vs CPU keeps screen on while user thinks');
  console.log('Human vs CPU active; waiting 35 seconds without input');
  await delay(35000);
  assert.match(adb('shell','dumpsys','power'),/mWakefulness=Awake/);
  assert.match(adb('shell','dumpsys','display'),/mPowerRequest=policy=BRIGHT/);
  shot('screen-awake-human');
  await startMode('ふたりで対局');assert.ok(isHeld(),'two-player game keeps screen on');
  console.log('Human vs CPU idle remains BRIGHT; two-player keep-screen-on PASS');
  await startMode('CPU同士で対局');
  await delay(1200);assert.ok(isHeld(),'autoplay must request KEEP_SCREEN_ON');
  console.log('Autoplay keep-screen-on flag PASS; waiting 35 seconds without input');
  await delay(35000);
  const power=adb('shell','dumpsys','power'),display=adb('shell','dumpsys','display');
  assert.match(power,/mWakefulness=Awake/);assert.match(power,/mStayOn=false/);
  assert.match(display,/mPowerRequest=policy=BRIGHT/);
  assert.ok(isHeld());shot('screen-awake-autoplay');
  const activePly=ply();assert.ok(activePly>=2);
  await tap('toggle-autoplay');await delay(400);assert.equal(isHeld(),false,'pause releases keep-screen-on');
  console.log('35 seconds idle remains BRIGHT; pause releases flag; waiting for normal sleep');
  await delay(25000);
  const pausedPower=adb('shell','dumpsys','power');assert.match(pausedPower,/mWakefulness=(Asleep|Dozing)/);
  adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');await delay(800);
  await tap('toggle-autoplay');await delay(500);assert.ok(isHeld(),'resume reacquires flag');
  adb('shell','input','keyevent','3');await delay(800);assert.equal(isHeld(),false,'background releases screen');
  adb('shell','am','start','-n',pkg+'/com.megurushogi.app.MainActivity');await delay(800);
  assert.equal(isHeld(),false,'returning stays paused');
  const modeAtEnd=nodes().find(n=>/^(ひとりで練習|CPU同士で対局|ふたりで対局)/.test(n.text));
  await tap(modeAtEnd.text);await tap('ふたりで対局');await scrollTo('start-game');await tap('start-game');await delay(600);assert.ok(isHeld());
  await scrollTo('投了');await tap('投了');await tap('投了する');await delay(600);assert.equal(isHeld(),false,'game over releases screen');
  const report={passed:true,gameOverReleases:true,package:pkg,humanVsCpu:true,twoPlayers:true,cpuVsCpu:true,settingsRelease:true,screenTimeoutMs:15000,usbStayAwake:false,idleObservationMs:35000,remainedBright:true,pauseSleepsNormally:true,resumeReacquires:true,backgroundReleases:true,returnPaused:true,activePly};
  fs.writeFileSync('reports/screen-awake-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{
  for(const [scope,key,value]of[['system','screen_off_timeout',timeout],['global','stay_on_while_plugged_in',stayOn]]){
   if(value==='null')adb('shell','settings','delete',scope,key);else adb('shell','settings','put',scope,key,value);
  }
  adb('shell','input','keyevent','224');adb('shell','wm','dismiss-keyguard');
 }
})().catch(e=>{try{shot('screen-awake-failure');}catch{}console.error(e);process.exitCode=1;});
