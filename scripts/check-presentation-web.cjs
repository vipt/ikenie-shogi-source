const {chromium}=require('@playwright/test'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:430,height:932}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.__audioStarts=0;const original=HTMLMediaElement.prototype.play;const seen=new WeakSet();HTMLMediaElement.prototype.play=function(){if(!seen.has(this)){seen.add(this);this.addEventListener('playing',()=>window.__audioStarts++);}return original.apply(this,arguments);};});
 const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/presentation.json'));
 const wait=()=>page.waitForTimeout(650);
 try{
  await page.goto('http://127.0.0.1:8788');await page.evaluate(raw=>localStorage.setItem('meguru-shogi.v1',raw),fixtures.initial);await page.reload();
  await page.getByTestId('sente-percent').filter({hasText:/\d+%/}).waitFor();
  assert.equal(await page.evaluate(()=>window.__audioStarts),0,'Restoring must be silent');
  await page.getByTestId('square-70').click();await wait();assert.equal(await page.evaluate(()=>window.__audioStarts),0,'Selection must be silent');
  await page.getByTestId('square-61').click();await wait();assert.equal(await page.evaluate(()=>window.__audioStarts),1,'Human move should play sound');
  await page.getByTestId('square-10').click();await page.getByTestId('square-19').click();await wait();assert.equal(await page.evaluate(()=>window.__audioStarts),2,'Other side should play sound');
  await page.getByRole('button',{name:'↶ 待った',exact:true}).click();await wait();assert.equal(await page.evaluate(()=>window.__audioStarts),2,'Undo must be silent');
  await page.getByTestId('open-preferences').click();await page.getByTestId('show-evaluation-switch').click();await page.getByTestId('move-sound-switch').click();await page.getByRole('button',{name:'盤に戻る',exact:true}).click();
  await page.getByTestId('evaluation-panel').waitFor({state:'hidden'});
  await page.getByTestId('square-10').click();await page.getByTestId('square-19').click();await wait();assert.equal(await page.evaluate(()=>window.__audioStarts),2,'Disabled sound must stay silent');
  await page.reload();await page.getByTestId('shogi-board').waitFor();await wait();assert.equal(await page.evaluate(()=>window.__audioStarts),0);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('meguru-shogi.v1')));assert.equal(saved.moves.length,2);assert.equal(saved.settings.moveSound,false);assert.equal(saved.settings.showEvaluation,false);
  await page.getByTestId('open-preferences').click();await page.getByTestId('show-evaluation-switch').click();await page.getByTestId('move-sound-switch').click();await page.getByRole('button',{name:'盤に戻る',exact:true}).click();await page.getByTestId('sente-percent').filter({hasText:/\d+%/}).waitFor();
  await page.screenshot({path:'artifacts/screenshots/presentation-active-web.png',fullPage:true});
  await page.evaluate(raw=>localStorage.setItem('meguru-shogi.v1',raw),fixtures.beforeMate);await page.reload();await page.getByTestId('shogi-board').waitFor();
  await page.getByTestId('square-'+fixtures.lastMove.from).click();await page.getByTestId('square-'+fixtures.lastMove.to).click();
  if(await page.getByRole('button',{name:'成らない',exact:true}).isVisible())await page.getByRole('button',{name:'成らない',exact:true}).click();
  await page.getByTestId('game-result').waitFor();assert.equal(await page.getByRole('dialog').count(),0,'No terminal dialog');
  const sente=await page.getByTestId('sente-percent').textContent();assert.equal(sente,fixtures.winner==='sente'?'先手 100%':'先手 0%');
  await page.screenshot({path:'artifacts/screenshots/presentation-result-web.png',fullPage:true});
  await page.reload();await page.getByTestId('game-result').waitFor();assert.equal(await page.getByRole('dialog').count(),0);await wait();assert.equal(await page.evaluate(()=>window.__audioStarts),0);
  assert.deepEqual(errors,[]);
  const report={createdAt:new Date().toISOString(),passed:true,noTerminalDialog:true,naturalMate:true,restoredResult:true,percentageVisible:true,preferencePersistence:true,decodedAudioPlayback:true,bothSidesMoveSound:true,selectionUndoRestoreSilent:true,soundOff:true};fs.writeFileSync('reports/presentation-web-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await page.screenshot({path:'artifacts/screenshots/presentation-web-failure.png',fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
