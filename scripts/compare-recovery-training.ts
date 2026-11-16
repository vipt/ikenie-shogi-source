import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGame,play,resign } from '../src/game/engine';
import { RECOVERY_RULES,moveFromUsi,moveToUsi,toSfen } from './lib/usi-format';
import { projectRoot,startInstalledEngine } from './lib/installed-usi';
async function main(){
  const model=JSON.parse(await readFile(resolve(projectRoot,'artifacts/engines/recovery-v1/training-manifest.json'),'utf8'));
  const baseline=await startInstalledEngine('recovery');
  const trained=await startInstalledEngine('recovery',{evalFile:model.evalFile,evalSha256:model.sha256});
  const engines=[baseline,trained];
  const stop=()=>{for(const e of engines)void e.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const results:any[]=[];const began=Date.now();
  try{
    for(let pair=0;pair<10;pair++){
      const teacherId=pair*10+9;
      const teacher=JSON.parse(await readFile(resolve(projectRoot,'.tools/training/recovery-v1/games',String(teacherId).padStart(4,'0')+'.json'),'utf8'));
      const opening=teacher.moves.slice(0,8) as string[];
      for(const trainedSide of ['sente','gote'] as const){
        let game=createGame(RECOVERY_RULES);
        for(const m of opening)game=play(game,moveFromUsi(m));
        const startSfen=toSfen(game.position,game.log.length+1,'recovery');
        for(const e of engines)e.newGame();
        while(!game.result&&game.log.length<256){
          const e=game.position.turn===trainedSide?trained:baseline;
          const a=await e.analyze(game,100);
          game=a.move?play(game,a.move):resign(game);
        }
        let replay=createGame(RECOVERY_RULES);for(const m of game.log)replay=play(replay,m.move);
        assert.equal(toSfen(replay.position,1,'recovery'),toSfen(game.position,1,'recovery'));
        const result=game.result??{winner:null,reason:'ply-limit'};
        const points=result.winner===null?.5:result.winner===trainedSide?1:0;
        const record={pair,teacherId,opening,startSfen,trainedSide,result,points,plies:game.log.length,
          recoveries:game.log.filter(x=>x.selfCapture).length,moves:game.log.map(x=>moveToUsi(x.move)),replayVerified:true};
        results.push(record);
        await writeFile(resolve(projectRoot,'reports/recovery-training-match-progress.json'),JSON.stringify({completed:results.length,results},null,2));
        console.log('match '+results.length+'/20: trained '+trainedSide+' '+(points===1?'win':points===0?'loss':'draw')+' ('+game.log.length+' plies)');
      }
    }
    const wins=results.filter(x=>x.points===1).length,losses=results.filter(x=>x.points===0).length,draws=results.length-wins-losses;
    const report={createdAt:new Date().toISOString(),rules:RECOVERY_RULES,modelSha256:model.sha256,
      games:20,pairs:10,movetimeMs:100,threadsPerSearch:1,hashMiB:64,book:false,maxPlies:256,
      openings:'First 8 plies of ten held-out teacher games (ids 9,19,...99); models exchange colors within each pair',
      wins,losses,draws,scoreRate:(wins+draws*.5)/20,elapsedMs:Date.now()-began,results,
      interpretation:'Small paired test, not a rating estimate or proof of general strength improvement'};
    await writeFile(resolve(projectRoot,'reports/recovery-training-match.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({wins,losses,draws,scoreRate:report.scoreRate}));
  }finally{for(const e of engines)await e.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

