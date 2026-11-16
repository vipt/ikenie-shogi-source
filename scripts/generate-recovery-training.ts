import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGame, legalMoves, play, resign, type Game } from '../src/game/engine';
import { RECOVERY_RULES, moveFromUsi, moveToUsi, toSfen } from './lib/usi-format';
import { startInstalledEngine, projectRoot } from './lib/installed-usi';

const out=resolve(projectRoot,'.tools/training/recovery-v1');
const count=Number(process.argv[2]??256);
if(!Number.isInteger(count)||count<1||count>512)throw new Error('Game count 1..512 required');
let cursor=0,completed=0,positions=0;
async function worker(workerId:number) {
  const engine=await startInstalledEngine('recovery',{multiPV:4});
  const stop=()=>{void engine.close();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    while(cursor<count) {
      const id=cursor++;
      const file=resolve(out,'games',String(id).padStart(4,'0')+'.json');
      try {const old=JSON.parse(await readFile(file,'utf8'));if(old.finished){completed++;positions+=old.samples.length;continue;}}catch{}
      let rng=0x4d475231^Math.imul(id+1,2654435761);
      const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
      let game=createGame(RECOVERY_RULES),samples:any[]=[];
      engine.newGame();
      for(let ply=0;ply<160&&!game.result;ply++) {
        const analysis=await engine.analyze(game,20);
        if(!analysis.move){game=resign(game);break;}
        if(analysis.score?.type==='cp'&&!analysis.score.bound&&Math.abs(analysis.score.value)<2200) {
          const features=await engine.features(game);
          samples.push({game:id,ply,turn:game.position.turn,sfen:toSfen(game.position,ply+1,'recovery'),
            score:analysis.score.value,depth:analysis.depth,bestmove:analysis.bestmove,
            ...features});
        }
        let move=analysis.move;
        if(ply<16) {
          const top=analysis.variations.filter(x=>x.score.type==='cp'&&!x.score.bound&&analysis.score?.type==='cp'&&x.score.value>=analysis.score.value-200);
          if(top.length&&random()<0.70)move=moveFromUsi(top[Math.floor(random()*top.length)]!.move);
          if(ply<8&&random()<0.08) {
            const legal=legalMoves(game.position);move=legal[Math.floor(random()*legal.length)]!;
          }
        } else if(ply%12===0 && random()<0.15) {
          const top=analysis.variations.filter(x=>x.score.type==='cp'&&!x.score.bound&&analysis.score?.type==='cp'&&x.score.value>=analysis.score.value-100);
          if(top.length)move=moveFromUsi(top[Math.floor(random()*top.length)]!.move);
        }
        game=play(game,move);
      }
      for(const sample of samples)sample.outcome=game.result ? (game.result.winner===null?0:game.result.winner===sample.turn?1:-1):null;
      const item={finished:true,id,seed:0x4d475231^Math.imul(id+1,2654435761),rules:RECOVERY_RULES,
        movetimeMs:20,multiPV:4,maxPlies:160,teacher:'Hao + recovery engine',
        result:game.result??{winner:null,reason:'ply-limit',adjudicated:false},
        moves:game.log.map(x=>moveToUsi(x.move)),recoveries:game.log.filter(x=>x.selfCapture).length,samples};
      await writeFile(file,JSON.stringify(item));
      completed++;positions+=samples.length;
      if(completed%8===0) {
        console.log('generated '+completed+'/'+count+' games, '+positions+' samples');
        await writeFile(resolve(out,'generation-progress.json'),JSON.stringify({completed,count,positions,updatedAt:new Date().toISOString()}));
      }
    }
  } finally {await engine.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
async function main(){
  await mkdir(resolve(out,'games'),{recursive:true});
  await Promise.all([worker(0),worker(1)]);
  await writeFile(resolve(out,'generation-manifest.json'),JSON.stringify({games:count,samples:positions,rule:RECOVERY_RULES,
    createdAt:new Date().toISOString(),threads:2,teacherMovetimeMs:20,maxPlies:160,multiPV:4},null,2));
  console.log('Dataset complete: '+positions+' samples');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

