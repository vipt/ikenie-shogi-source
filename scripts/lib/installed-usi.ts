import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UsiRuleMode } from './usi-format';
import { UsiEngine } from './usi-engine';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export async function startInstalledEngine(mode: UsiRuleMode = 'standard', settings: {multiPV?:number;evalFile?:string;evalSha256?:string;bookDir?:string;bookEvalDiff?:number} = {}): Promise<UsiEngine> {
  if(mode==='mobile-king-all')throw new Error('King recovery requires the mobile native engine');
  const lock = JSON.parse(await readFile(resolve(projectRoot, 'scripts/usi-engine-lock.json'), 'utf8'));
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('This pinned binary is Windows x64 AVX2. Configure a matching build for other platforms.');
  }
  if (settings.evalFile) {
    if (mode === 'standard' || !settings.evalSha256) throw new Error('Custom evaluation requires recovery mode and SHA256');
    lock.evaluation.file=settings.evalFile; lock.evaluation.sha256=settings.evalSha256;
  }
  let executable = lock.engine.executable, executableHash = lock.engine.sha256;
  if (mode !== 'standard') {
    const asymmetric=mode.startsWith('asymmetric-');
    if(asymmetric&&settings.bookDir)throw new Error('Both-side recovery book cannot be used with asymmetric rules');
    const build = JSON.parse(await readFile(resolve(projectRoot, asymmetric?'.tools/engines/meguru-asymmetric-v1/build-manifest.json':'.tools/engines/meguru-v1/build-manifest.json'), 'utf8'));
    if (build.rule !== (asymmetric?'asymmetric-king-enemy-v1':'recovery-king-enemy-v1')) throw new Error('Variant build rule mismatch');
    for (const [file, expected] of Object.entries(build.inputs as Record<string, string>)) {
      const actual = createHash('sha256').update(await readFile(resolve(projectRoot, file))).digest('hex');
      if (actual !== expected) throw new Error('Recovery source changed. Run scripts/Build-RecoveryEngine.ps1: ' + file);
    }
    executable = build.executable; executableHash = build.sha256;
  }
  for (const item of [
    { file: executable, hash: executableHash },
    { file: lock.evaluation.file, hash: lock.evaluation.sha256 },
  ]) {
    let data: Buffer;
    try { data = await readFile(resolve(projectRoot, item.file)); }
    catch { throw new Error('Engine files missing. Run scripts/Install-UsiEngine.ps1 first: ' + item.file); }
    if (createHash('sha256').update(data).digest('hex') !== item.hash) {
      throw new Error('SHA256 mismatch: ' + item.file);
    }
  }
  return UsiEngine.start({
    ruleMode: mode,
    executable: resolve(projectRoot, executable),
    options: { ...lock.options, EvalDir: dirname(resolve(projectRoot, lock.evaluation.file)),
      FV_SCALE: lock.evaluation.fvScale,
      ...(mode !== 'standard' ? { GenerateAllLegalMoves: true, PvInterval: 0, OutputFailLHPV: false } : {}),
      ...(settings.multiPV ? {MultiPV:settings.multiPV}:{}),
      ...(settings.bookDir ? {USI_OwnBook:true,BookDir:settings.bookDir,BookFile:'user_book1.db',BookMoves:24,BookDepthLimit:0,BookEvalBlackLimit:-99999,BookEvalWhiteLimit:-99999,BookEvalDiff:settings.bookEvalDiff??0,NarrowBook:false,ConsiderBookMoveCount:false,BookIgnoreRate:0,IgnoreBookPly:true,BookOnTheFly:false}: {}) },
  });
}

