import type {Game, Side} from './engine';

/** Indicative advantage only. Not calibrated to this variant's measured win rate. */
export function advantagePercent(senteCp: number): {sente:number;gote:number} {
  if(!Number.isFinite(senteCp))throw new Error('Invalid evaluation');
  const sente=Math.max(1,Math.min(99,Math.round(100/(1+Math.exp(-senteCp/600)))));
  return {sente,gote:100-sente};
}
export function scoreForSente(cp:number,turn:Side){return turn==='sente'?cp:-cp;}
export function resultPercent(result:NonNullable<Game['result']>){
  const sente=result.winner==='sente'?100:result.winner==='gote'?0:50;
  return {sente,gote:100-sente};
}
/** Move records retain identity during play; undo, restore and new games must stay silent. */
export function isNewCommittedMove(previous:Game,current:Game){
  return current.log.length===previous.log.length+1 && previous.log.every((row,i)=>current.log[i]===row);
}

/** Count recovery events per side; the same piece can be recovered more than once. */
export function selfCaptureCounts(game:Game):Record<Side,number>{
  const counts={sente:0,gote:0};
  for(const move of game.log)if(move.selfCapture)counts[move.side]++;
  return counts;
}
