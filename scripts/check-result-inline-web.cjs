// After expo export: node scripts/check-result-inline-web.cjs [export directory]
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(process.argv[2]||'dist'),key='meguru-shogi.v1';
const server=http.createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}catch{res.writeHead(404).end();}});
let browser,page;
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'msedge',headless:true});
 page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const fixture=JSON.parse(await fs.readFile('tests/fixtures/presentation.json','utf8'));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const click=id=>page.getByTestId(id).evaluate(el=>el.click());
 const load=async(name,settings={})=>{
  const seed=JSON.parse(fixture[name]);Object.assign(seed.settings,{showEvaluation:false},settings);
  await page.evaluate(({key,seed})=>localStorage.setItem(key,JSON.stringify(seed)),{key,seed});await page.reload();
  await expect(page.getByTestId('shogi-board')).toBeVisible();await page.waitForTimeout(250);
 };
 const board=()=>page.evaluate(()=>{const sc=document.querySelector('[data-testid=game-scroll]'),b=document.querySelector('[data-testid=shogi-board]').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,scroll:sc.scrollTop};});
 const unchanged=async before=>{const after=await board();for(const k in before)assert(Math.abs(before[k]-after[k])<1,JSON.stringify({before,after}));};
 const solo={mode:'cpu',humanSide:'sente',players:{sente:{kind:'human',level:7},gote:{kind:'cpu',level:7}}};
 await fs.mkdir('artifacts/screenshots',{recursive:true});
 const unobstructed=async()=>{
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for(const id of ['result-overlay','result-banner','result-card','result-confetti'])await expect(page.getByTestId(id)).toHaveCount(0);
 };
 for(const width of [320,390,1100]){
  await page.setViewportSize({width,height:width===320?568:844});await page.emulateMedia({reducedMotion:'no-preference'});await load('beforeMate',solo);
  await page.getByTestId('game-scroll').evaluate(el=>el.scrollTop=170);const before=await board();
  await click('square-'+fixture.lastMove.from);await click('square-'+fixture.lastMove.to);
  await expect(page.getByTestId('player-result-sente')).toHaveText('勝ち');await expect(page.getByTestId('player-result-gote')).toHaveText('負け');
  await expect(page.getByTestId('result-emphasis')).toBeVisible();await unobstructed();await unchanged(before);
  await page.waitForTimeout(1100);await expect(page.getByTestId('result-emphasis')).toHaveCount(0);await unchanged(before);
  await page.screenshot({path:'artifacts/screenshots/result-inline-'+width+'.png'});
 }
 await page.reload();await expect(page.getByTestId('player-result-sente')).toHaveText('勝ち');await unobstructed();await expect(page.getByTestId('result-emphasis')).toHaveCount(0);
 await click('undo-move');await expect(page.getByTestId('player-result-sente')).toHaveCount(0);
 await click('redo-move');await expect(page.getByTestId('player-result-sente')).toHaveText('勝ち');await expect(page.getByTestId('result-emphasis')).toHaveCount(0);await unobstructed();
 await click('open-archives');await expect(page.getByTestId('result-banner')).toHaveCount(0);await click('close-archives');
 await click('open-game-settings');await page.getByTestId('gote-player-human').click();await page.getByTestId('start-game').click();await expect(page.getByTestId('player-result-sente')).toHaveCount(0);await unobstructed();
 await load('initial',solo);await page.getByRole('button',{name:'投了',exact:true}).click();await page.getByRole('button',{name:'投了する',exact:true}).click();
 await expect(page.getByTestId('player-result-gote')).toHaveText('勝ち');await expect(page.getByTestId('player-result-sente')).toHaveText('負け');await expect(page.getByTestId('game-status')).toContainText('CPU Lv.7');await unobstructed();
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:320,height:568});await load('beforeMate',solo);
 await click('square-'+fixture.lastMove.from);await click('square-'+fixture.lastMove.to);await expect(page.getByTestId('player-result-sente')).toHaveText('勝ち');await expect(page.getByTestId('result-emphasis')).toHaveCount(0);await unobstructed();
 await load('initial',{mode:'watch',players:{sente:{kind:'cpu',level:1},gote:{kind:'cpu',level:1}},rules:{kingCapture:'all',selfCapture:'both',moveLimit:2}});
 await click('toggle-autoplay');await expect(page.getByTestId('player-result-sente')).toHaveText('引き分け',{timeout:30000});await expect(page.getByTestId('player-result-gote')).toHaveText('引き分け');await unobstructed();
 assert.deepEqual(errors,[]);console.log('PASS: inline winner/loser/draw, no dialog/banner/confetti, unchanged board/scroll, undo/redo, restore, new game and reduced motion; 320/390/1100px.');
})().catch(async e=>{console.error(e);await page?.screenshot({path:'.tools/result-inline-failure.png'}).catch(()=>{});process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
