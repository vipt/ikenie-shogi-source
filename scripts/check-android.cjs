const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sdk = process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
const adbPath = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const serial = process.env.MEGURU_TEST_SERIAL || 'emulator-5580';
if (!serial.startsWith('emulator-')) throw new Error('This script only operates on an Android emulator.');
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const decode = s => s.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
function nodes() {
  adb('shell', 'uiautomator', 'dump', '/sdcard/meguru-ui.xml');
  const xml = adb('exec-out', 'cat', '/sdcard/meguru-ui.xml');
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(v => [v[1], decode(v[2])])));
}
function locate(items, value) {
  const item = items.find(n => n['resource-id'] === value || n.text === value || n['content-desc'] === value);
  assert.ok(item, `Missing native UI element: ${value}`);
  return item;
}
async function tap(value) {
  const item = locate(nodes(), value);
  const b = item.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/).slice(1).map(Number);
  adb('shell', 'input', 'tap', String(Math.round((b[0] + b[2]) / 2)), String(Math.round((b[1] + b[3]) / 2)));
  await delay(250);
}
function screenshot(name) {
  fs.mkdirSync('artifacts/screenshots', { recursive: true });
  const bytes = execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { windowsHide: true });
  fs.writeFileSync(`artifacts/screenshots/${name}.png`, bytes);
}
(async () => {
  if (process.argv[2]) adb('install', '-r', path.resolve(process.argv[2]));
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  adb('shell', 'am', 'start', '-n', 'com.megurushogi.app/.MainActivity');
  await delay(3000);
  screenshot('android-initial');
  let items = nodes();
  fs.writeFileSync('artifacts/android-ui.json', JSON.stringify(items, null, 2));
  assert.equal(items.filter(n => /^square-\d+$/.test(n['resource-id'])).length, 81, 'all 81 squares must be visible');
  for (let row = 0; row < 9; row++) {
    const tops = Array.from({ length: 9 }, (_, col) => locate(items, `square-${row * 9 + col}`).bounds.match(/\[\d+,(\d+)\]/)[1]);
    assert.equal(new Set(tops).size, 1, `row ${row + 1} must have nine aligned cells`);
  }
  assert.match(locate(items, 'square-70')['content-desc'], /先手の飛/);
  await tap('square-70');
  items = nodes();
  assert.match(locate(items, 'square-61')['content-desc'], /回収できる/);
  screenshot('android-selected');
  await tap('square-61');
  for (let attempt = 0; attempt < 8; attempt++) {
    await delay(500);
    items = nodes();
    if (items.some(n => n.text === '先手の番です')) break;
  }
  assert.match(locate(items, 'hand-sente-P')['content-desc'], /1枚/);
  assert.ok(items.some(n => n.text === '先手の番です'), 'CPU should have replied');
  assert.ok(items.some(n => n.text === 'こまめ · 強め'), 'upgraded CPU should be the default');
  screenshot('android-after-cpu');
  adb('shell', 'am', 'force-stop', 'com.megurushogi.app');
  adb('shell', 'am', 'start', '-n', 'com.megurushogi.app/.MainActivity');
  await delay(1800);
  items = nodes();
  assert.match(locate(items, 'hand-sente-P')['content-desc'], /1枚/);
  await tap('↶ 待った');
  items = nodes();
  assert.match(locate(items, 'square-70')['content-desc'], /先手の飛/);
  assert.match(locate(items, 'hand-sente-P')['content-desc'], /0枚/);
  const logs = adb('logcat', '-d', '-s', 'AndroidRuntime:E', 'ReactNativeJS:E');
  fs.writeFileSync('artifacts/android-error-log.txt', logs);
  assert.doesNotMatch(logs, /FATAL EXCEPTION|TypeError|ReferenceError|Invariant Violation/);
  console.log('Android APK PASS (offline): 81 visible squares in a 9x9 grid, native launch, own-piece recovery, CPU reply, save/resume, two-ply undo; no native or JS crash.');
})().catch(error => { try { screenshot('android-failure'); } catch {} console.error(error); process.exitCode = 1; });
