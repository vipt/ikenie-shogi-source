const {chromium}=require('@playwright/test'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const server=require('node:child_process').spawn('python',['-m','http.server','8789','--bind','127.0.0.1','--directory','dist'],{windowsHide:true,stdio:'ignore'});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:430,height:932}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.__volumes=[];const original=HTMLMediaElement.prototype.play,seen=new WeakSet();HTMLMediaElement.prototype.play=function(){if(!seen.has(this)){seen.add(this);this.addEventListener('playing',()=>window.__volumes.push(this.volume));}return original.apply(this,arguments);};});
 const wait=()=>page.waitForTimeout(650),volumes=()=>page.evaluate(()=>window.__volumes),getVolume=async()=>parseInt(await page.getByTestId('move-sound-volume').textContent());
 const setVolume=async target=>{let v=await getVolume();while(v!==target){await page.getByTestId(v>target?'sound-volume-down':'sound-volume-up').click();v=await getVolume();}};
 try{
  await page.goto('http://127.0.0.1:8789');await page.getByTestId('shogi-board').waitFor();await page.waitForTimeout(500);const fixture=JSON.parse(fs.readFileSync('tests/fixtures/presentation.json')).initial;
  await page.evaluate(s=>localStorage.setItem('meguru-shogi.v1',s),fixture);await page.reload();await page.getByTestId('shogi-board').waitFor();
  await page.getByTestId('open-preferences').click();assert.equal(await getVolume(),75);
  await setVolume(25);await page.getByTestId('sound-preview').click();await wait();assert.deepEqual(await volumes(),[.25]);
  await setVolume(100);assert(await page.getByTestId('sound-volume-up').isDisabled());await page.getByTestId('sound-preview').click();await wait();assert.deepEqual(await volumes(),[.25,1]);
  await page.screenshot({path:'artifacts/screenshots/volume-settings-web.png',fullPage:true});
  await setVolume(0);assert(await page.getByTestId('sound-volume-down').isDisabled());assert(await page.getByTestId('sound-preview').isDisabled());
  await page.getByRole('button',{name:'盤に戻る',exact:true}).click();await page.getByTestId('square-70').click();await page.getByTestId('square-61').click();await wait();assert.deepEqual(await volumes(),[.25,1]);
  await page.getByTestId('open-preferences').click();await setVolume(40);await page.getByTestId('move-sound-switch').click();assert(await page.getByTestId('sound-preview').isDisabled());assert(await page.getByTestId('sound-volume-up').isDisabled());
  await page.getByTestId('move-sound-switch').click();await page.getByRole('button',{name:'盤に戻る',exact:true}).click();await wait();await page.reload();await page.getByTestId('shogi-board').waitFor();
  await page.getByTestId('open-preferences').click();assert.equal(await getVolume(),40);await page.getByRole('button',{name:'盤に戻る',exact:true}).click();
  await page.getByTestId('square-10').click();await page.getByTestId('square-19').click();await wait();assert.deepEqual(await volumes(),[.4]);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('meguru-shogi.v1')));assert.equal(saved.moves.length,2);assert.equal(saved.settings.moveSoundVolume,40);
  await page.getByText('ふたりで対局',{exact:false}).click();await setVolume(80);await page.getByTestId('sound-preview').click();await wait();assert.deepEqual(await volumes(),[.4,.8]);
  await page.getByRole('button',{name:'閉じる',exact:true}).click();await page.getByTestId('open-preferences').click();assert.equal(await getVolume(),40);await page.getByRole('button',{name:'盤に戻る',exact:true}).click();
  await page.getByTestId('square-61').click();await page.getByTestId('square-52').click();await wait();assert.deepEqual(await volumes(),[.4,.8,.4]);
  assert.deepEqual(errors,[]);const report={createdAt:new Date().toISOString(),passed:true,legacyVolume:75,previewVolumes:[25,100],zeroMutesMoves:true,offDisablesPreview:true,persistedVolume:40,movesPreserved:true,draftPreviewDoesNotChangeSavedVolume:true};fs.writeFileSync('reports/presentation-volume-web.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await page.screenshot({path:'artifacts/screenshots/volume-web-failure.png',fullPage:true});throw e;}finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});

