const {chromium}=require('@playwright/test'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const server=require('node:child_process').spawn('python',['-m','http.server','8790','--bind','127.0.0.1','--directory','dist'],{windowsHide:true,stdio:'ignore'});
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:430,height:932}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8790');await page.getByTestId('shogi-board').waitFor();await page.waitForTimeout(500);await page.evaluate(raw=>localStorage.setItem('meguru-shogi.v1',raw),JSON.parse(fs.readFileSync('tests/fixtures/presentation.json')).initial);await page.reload();await page.getByTestId('evaluation-bar-fill').waitFor();
  const samples=await page.evaluate(async()=>{const values=[];const start=performance.now();while(performance.now()-start<4000){const el=document.querySelector('[data-testid="evaluation-bar-fill"]');values.push(parseFloat(el.style.width));await new Promise(requestAnimationFrame);}return values;});
  assert(new Set(samples).size>4,'Bar should animate through intermediate widths');assert(samples.some(v=>Math.abs(v-Math.round(v))>.001),'Animated fractional widths');
  await page.getByTestId('evaluation-depth').filter({hasText:/探索深さ [1-9]/}).waitFor();
  const depthText=await page.getByTestId('evaluation-depth').textContent();
  await page.getByTestId('square-70').click();await page.getByTestId('square-61').click();await page.getByTestId('evaluation-move-number').filter({hasText:'1手目'}).waitFor();
  await page.getByTestId('open-preferences').click();await page.getByTestId('show-evaluation-switch').click();await page.getByRole('button',{name:'盤に戻る',exact:true}).click();await page.getByTestId('evaluation-panel').waitFor({state:'hidden'});
  await page.getByTestId('open-preferences').click();await page.getByTestId('show-evaluation-switch').click();await page.getByRole('button',{name:'盤に戻る',exact:true}).click();await page.getByTestId('sente-percent').filter({hasText:/\d+%/}).waitFor();
  await page.screenshot({path:'artifacts/screenshots/live-evaluation-web.png',fullPage:true});assert.deepEqual(errors,[]);
  const report={createdAt:new Date().toISOString(),passed:true,animationIntermediateWidths:new Set(samples).size,depthText,moveDuringAnalysis:true,hideAndResume:true};fs.writeFileSync('reports/presentation-live-web.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await page.screenshot({path:'artifacts/screenshots/live-web-failure.png',fullPage:true});throw e;}finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
