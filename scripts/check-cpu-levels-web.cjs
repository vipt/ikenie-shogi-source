const {chromium}=require('@playwright/test'),fs=require('fs'),assert=require('assert/strict'),{spawn}=require('child_process');
(async()=>{
 const server=spawn('python',['-m','http.server','8792','--bind','127.0.0.1','--directory','dist'],{windowsHide:true,stdio:'ignore'}),browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:430,height:932}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8792');await page.getByTestId('shogi-board').waitFor();await page.waitForTimeout(500);
  const old=JSON.parse(JSON.parse(fs.readFileSync('tests/fixtures/presentation.json')).initial);old.settings.showEvaluation=false;old.settings.cpuEngine='classic';old.settings.model='trained';delete old.settings.cpuLevel;
  await page.evaluate(raw=>localStorage.setItem('meguru-shogi.v1',raw),JSON.stringify(old));await page.reload();await page.getByTestId('shogi-board').waitFor();
  await page.getByText('ふたりで対局',{exact:false}).first().click();await page.getByRole('radio',{name:/ひとりで練習/}).click();
  assert.equal(await page.getByTestId('fixed-cpu-model').count(),0);assert.equal(await page.getByRole('radio',{name:/従来CPU|追加学習版|どの駒も取れない/}).count(),0);
  assert.equal(await page.getByTestId('cpu-level-value').textContent(),'レベル 7 / 10');
  const descriptions=[];for(let level=1;level<=10;level++){const button=page.getByRole('radio',{name:'CPUレベル'+level,exact:true});await button.click();await page.getByTestId('cpu-level-value').filter({hasText:`レベル ${level} / 10`}).waitFor();assert.equal(await page.getByTestId('cpu-level-value').textContent(),`レベル ${level} / 10`);descriptions.push(await page.getByTestId('cpu-level-description').textContent());}
  await page.getByTestId('cpu-level-value').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/screenshots/cpu-levels-settings-web.png'});
  await page.getByTestId('start-game').click();await page.getByTestId('cpu-engine-label').filter({hasText:'Lv.10'}).waitFor();await page.waitForTimeout(400);await page.reload();await page.getByTestId('cpu-engine-label').filter({hasText:'Lv.10'}).waitFor();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('meguru-shogi.v1')));assert.equal(saved.settings.cpuLevel,10);assert.equal(saved.settings.cpuEngine,'native');assert.equal(saved.settings.model,'hao');
  await page.getByText('ひとりで練習',{exact:false}).first().click();await page.getByRole('radio',{name:'CPUレベル1',exact:true}).click();await page.getByRole('radio',{name:/CPU同士で対局/}).click();await page.getByRole('radio',{name:/味方も相手も取れる/}).click();await page.getByTestId('move-limit-input').fill('2');await page.getByTestId('start-game').click();await page.getByTestId('game-result').waitFor({timeout:15000});
  assert((await page.getByTestId('game-result').textContent()).includes('3手まで'));assert.deepEqual(errors,[]);
  const report={createdAt:new Date().toISOString(),passed:true,levels:10,descriptions,migratedStrongTo:7,restoredLevel:10,fixedCpu:'native',fixedModel:'hao',removedChoicesVerified:true,level1WatchDrawAfter:3};fs.writeFileSync('reports/cpu-levels-web.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }catch(e){await page.screenshot({path:'artifacts/screenshots/cpu-levels-web-failure.png'});throw e;}finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
