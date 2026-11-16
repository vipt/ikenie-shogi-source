const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const id = process.argv[2];
if (!id) throw new Error('Pass an EAS build ID.');
(async () => {
  const build = JSON.parse(execFileSync(process.execPath, ['node_modules/eas-cli/bin/run', 'build:view', id, '--json'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
  const report = {
    id: build.id, status: build.status, platform: build.platform,
    dashboardUrl: `https://expo.dev/accounts/motokit/projects/meguru-shogi/builds/${build.id}`,
    artifacts: { buildUrl: build.artifacts?.buildUrl, applicationArchiveUrl: build.artifacts?.applicationArchiveUrl }, error: build.error,
    createdAt: build.createdAt, completedAt: build.completedAt,
  };
  fs.writeFileSync(`reports/${build.platform.toLowerCase()}-build.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (build.status === 'ERRORED' || process.argv.includes('--logs')) {
    fs.mkdirSync('artifacts/build-logs', { recursive: true });
    for (let i = 0; i < (build.logFiles || []).length; i++) {
      const text = await (await fetch(build.logFiles[i])).text();
      fs.writeFileSync(`artifacts/build-logs/${build.id}-${i}.log`, text);
      const entries = text.split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
      console.log(entries.filter(e => e.marker === 'END_PHASE' || /(?:^|\s)(?:error[: ]|FAILURE|What went wrong|Could not)/i.test(e.msg || '')).map(e => `[${e.phase}] ${e.msg}`).slice(-8).join('\n'));
      console.log(entries.slice(-4).map(e => `[${e.phase}] ${e.msg}`).join('\n'));
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
