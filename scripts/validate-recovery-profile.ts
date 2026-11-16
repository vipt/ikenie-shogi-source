import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGame,play } from '../src/game/engine';
import { RECOVERY_RULES,moveFromUsi,fromSfen } from './lib/usi-format';
import { projectRoot } from './lib/installed-usi';
import { startTrainedRecoveryEngine } from './lib/recovery-profile';
async function main(){
  const manifest=JSON.parse(await readFile(resolve(projectRoot,'artifacts/engines/recovery-v1/book-manifest.json'),'utf8'));
  const engine=await startTrainedRecoveryEngine();
  let checked=0,transitions=0,recoveries=0;
  try{
    for(const entry of manifest.entries){
      let game=createGame(RECOVERY_RULES);
      for(const m of entry.history)game=play(game,moveFromUsi(m));
      engine.newGame();
      const a=await engine.analyze(game,1);
      assert.equal(a.bestmove,entry.move,'Book move mismatch at '+entry.sfen);
      assert.equal(a.nodes,0,'Unexpected search instead of book at '+entry.sfen);
      checked++;
    }
    const audits=JSON.parse(await readFile(resolve(projectRoot,'.tools/training/recovery-v1/reload-audit.json'),'utf8'));
    for(const entry of audits){
      const game=createGame(RECOVERY_RULES,fromSfen(entry.sfen,'recovery'));
      assert.equal((await engine.features(game)).raw,entry.expectedRaw);
      const probe=await engine.probe(game);
      assert.ok(probe.valid);
      assert.ok(probe.children.every(c=>c.valid));
      transitions+=probe.children.length;
      recoveries+=probe.children.filter(c=>c.recovery).length;
    }
    const report={createdAt:new Date().toISOString(),positions:checked,incrementalTransitions:transitions,incrementalRecoveries:recoveries,modelSha256:manifest.modelSha256,
      bookSha256:manifest.sha256,allMovesMatch:true,allWithoutSearch:true,
      nativeReloadAudits:manifest.nativeReloadAudits};
    await writeFile(resolve(projectRoot,'reports/recovery-profile-validation.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }finally{await engine.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

