import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createGame,play,type Game } from '../src/game/engine';
import { RECOVERY_RULES,fromSfen,moveFromUsi,moveToUsi,toSfen } from './lib/usi-format';
import { projectRoot,startInstalledEngine } from './lib/installed-usi';

async function main(){
  const artifact=resolve(projectRoot,'artifacts/engines/recovery-v1');
  const model=JSON.parse(await readFile(resolve(artifact,'training-manifest.json'),'utf8'));
  const settings={evalFile:model.evalFile,evalSha256:model.sha256,multiPV:2};
  const engines=await Promise.all([startInstalledEngine('recovery',settings),startInstalledEngine('recovery',settings)]);
  const stop=()=>{for(const e of engines)void e.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    const audits=JSON.parse(await readFile(resolve(projectRoot,'.tools/training/recovery-v1/reload-audit.json'),'utf8'));
    for(const row of audits){
      const p=fromSfen(row.sfen,'recovery'),g=createGame(RECOVERY_RULES,p);
      const f=await engines[0]!.features(g);
      assert.equal(f.raw,row.expectedRaw,'Native quantized model reload mismatch');
    }
    const queue:Game[]=[createGame(RECOVERY_RULES)],visited=new Set<string>(),entries:any[]=[];
    const key=(g:Game)=>toSfen(g.position,1,'recovery');
    visited.add(key(queue[0]!));
    while(queue.length && entries.length<1024){
      const batch=queue.splice(0,Math.min(2,1024-entries.length));
      const results=await Promise.all(batch.map((g,i)=>engines[i]!.analyze(g,200)));
      for(let i=0;i<batch.length;i++){
        const g=batch[i]!,a=results[i]!;
        if(!a.move||a.score?.type!=='cp'||a.score.bound)continue;
        const next=play(g,a.move);
        let ponder='none';
        if(a.pv[1]&&!next.result){try{play(next,moveFromUsi(a.pv[1]));ponder=a.pv[1];}catch{}}
        entries.push({sfen:key(g),history:g.log.map(m=>moveToUsi(m.move)),move:a.bestmove,ponder,
          value:a.score.value,depth:a.depth,recovery:next.log.at(-1)!.selfCapture});
        if(g.log.length<23){
          const branches=g.log.length<6?a.variations.filter(v=>v.score.type==='cp'&&!v.score.bound&&v.score.value>=a.score!.value-150).slice(0,2):[{move:a.bestmove}];
          for(const v of branches){
            const child=play(g,moveFromUsi(v.move)),k=key(child);
            if(!child.result&&!visited.has(k)){visited.add(k);queue.push(child);}
          }
        }
      }
      if(entries.length%50<2)console.log('book '+entries.length+' positions, '+queue.length+' pending');
    }
    assert(entries.length>=24,'Book unexpectedly small');
    // Every stored move and ponder must be legal under exactly the recovery rule.
    for(const e of entries){
      let g=createGame(RECOVERY_RULES);
      for(const m of e.history)g=play(g,moveFromUsi(m));
      assert.equal(key(g),e.sfen);
      g=play(g,moveFromUsi(e.move));
      if(e.ponder!=='none')play(g,moveFromUsi(e.ponder));
    }
    const lines=['#YANEURAOU-DB2016 1.00'];
    for(const e of [...entries].sort((a,b)=>a.sfen.localeCompare(b.sfen))){
      lines.push('sfen '+e.sfen,e.move+' '+e.ponder+' '+e.value+' '+e.depth+' 1');
    }
    const db=lines.join('\n')+'\n',bookDir=resolve(artifact,'book');
    await mkdir(bookDir,{recursive:true});
    await writeFile(resolve(bookDir,'user_book1.db'),db);
    const report={createdAt:new Date().toISOString(),rules:RECOVERY_RULES,modelSha256:model.sha256,
      positions:entries.length,recoveryMoves:entries.filter(e=>e.recovery).length,maxPly:Math.max(...entries.map(e=>e.history.length))+1,
      searchMs:200,multiPV:2,branching:'top two within 150 cp for first 6 plies, then best continuation through ply 24',
      sha256:createHash('sha256').update(db).digest('hex'),entries,verifiedMoves:true,nativeReloadAudits:audits.length};
    await writeFile(resolve(artifact,'book-manifest.json'),JSON.stringify(report,null,2));
    await writeFile(resolve(projectRoot,'reports/recovery-book.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({positions:report.positions,recoveryMoves:report.recoveryMoves,maxPly:report.maxPly}));
  } finally{for(const e of engines)await e.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

