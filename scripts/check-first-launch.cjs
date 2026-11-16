// Run after exporting the web app: node scripts/check-first-launch.cjs [export directory]
const {chromium, expect} = require('@playwright/test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(process.argv[2] || 'dist');
const key = 'meguru-shogi.v1';
const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.mp3':'audio/mpeg'};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({channel:'msedge', headless:true});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const read = () => page.evaluate(k => localStorage.getItem(k), key);
  const start = page.getByTestId('start-game');
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await expect(start).toBeVisible();
  assert.equal(await read(), null, 'opening setup must not save a game');
  await page.getByTestId('close-dialog').click();
  await expect(page.getByTestId('game-status')).toContainText('対局開始前');
  await expect(page.getByTestId('cpu-engine-label')).not.toContainText(/やねうら王|Háo/);
  await page.getByTestId('open-preferences').click();
  await page.getByTestId('open-licenses').click();
  const version = require('../app.json').expo.version;
  const sourceUrl = `https://github.com/vipt/ikenie-shogi-source/releases/tag/v${version}`;
  await expect(page.getByTestId('source-code-url')).toHaveText(sourceUrl);
  await page.context().route(sourceUrl, route => route.fulfill({body:'Source release', contentType:'text/html'}));
  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('open-source-code').click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(sourceUrl);
  await popup.close();
  await page.getByTestId('close-dialog').click();
  await expect(page.getByTestId('square-70')).toBeDisabled();
  await expect(page.getByRole('button', {name:'投了',exact:true})).toBeDisabled();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('evaluation-nodes')).toHaveText('探索局面数 0');
  assert.equal(await read(), null, 'dismissing setup must not start or save a game');
  await page.getByTestId('open-archives').click();
  await expect(page.getByTestId('archive-empty')).toBeVisible();
  await page.getByTestId('close-archives').click();
  await page.reload();
  await expect(start).toBeVisible();
  await page.getByTestId('gote-player-human').click();
  await start.click();
  await expect.poll(async () => JSON.parse(await read())?.settings.mode).toBe('local');
  await expect(page.getByTestId('square-70')).toBeEnabled();
  // Starting explicitly at zero moves must still restore as an active game.
  await page.reload();
  await expect(page.getByTestId('square-70')).toBeEnabled();
  await expect(start).toHaveCount(0);
  await page.getByTestId('square-70').click();
  await page.getByTestId('square-61').click();
  await expect.poll(async () => JSON.parse(await read())?.moves.length).toBe(1);
  await page.reload();
  await expect(page.getByTestId('hand-sente-P')).toHaveAttribute('aria-label', /1枚/);
  await expect(start).toHaveCount(0);
  // A CPU first move must wait for explicit start, then run normally.
  await page.getByTestId('open-game-settings').click();
  await page.getByTestId('sente-player-cpu').click();
  await start.click();
  await expect.poll(async () => JSON.parse(await read())?.moves.length, {timeout:20000}).toBe(1);
  // Invalid saved data should show setup without overwriting the original.
  await page.evaluate(k => localStorage.setItem(k, 'invalid-save'), key);
  await page.reload();
  await expect(start).toBeVisible();
  assert.equal(await read(), 'invalid-save');
  await page.getByTestId('close-dialog').click();
  await expect(page.getByTestId('game-status')).toContainText('対局開始前');
  assert.deepEqual(errors, []);
  console.log('PASS: source release link, hidden engine name, fresh install, dismiss/relaunch, no idle save/search, empty archives, explicit start, zero-move and played-game restore, CPU first move, invalid save preservation.');
})().catch(error => {console.error(error); process.exitCode=1;}).finally(async () => {
  await browser?.close();
  server.close();
});
