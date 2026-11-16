import { createGame,play } from '../src/game/engine';
import { RECOVERY_RULES,moveFromUsi } from './lib/usi-format';
import { startTrainedRecoveryEngine } from './lib/recovery-profile';
async function main(){
  let game=createGame(RECOVERY_RULES);
  for(const m of process.argv.slice(2))game=play(game,moveFromUsi(m));
  const engine=await startTrainedRecoveryEngine();
  try{
    const a=await engine.analyze(game,500);
    console.log(JSON.stringify({engine:engine.name,profile:'recovery-v1 fine-tuned NNUE + recovery book',
      bestmove:a.bestmove,label:a.move?play(game,a.move).log.at(-1)!.label:'投了',
      score:a.score,depth:a.depth,nodes:a.nodes,elapsedMs:a.elapsedMs},null,2));
  }finally{await engine.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

