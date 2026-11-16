import {undo,play,resign,opposite,withMoveLimit,type Game,type Move,type Side} from './engine';
export type RedoStep={moves:Move[];resigned:Side|null};
export type Timeline={game:Game;redo:RedoStep[]};
/** A new move or resignation starts a new branch. */
export const replaceGame=(game:Game):Timeline=>({game,redo:[]});
export function takeBackHistory(state:Timeline,plies:number):Timeline {
 if(plies<1||!state.game.log.length)return state;
 const game=undo(state.game,plies),removed=state.game.log.slice(game.log.length).map(r=>r.move);
 return {game,redo:[{moves:removed,resigned:state.game.result?.reason==='resign'?opposite(state.game.result.winner!):null},...state.redo]};
}
export function replayStep(game:Game,step:RedoStep):Game {
 // Older saved records can extend beyond a newly introduced move limit.
 const {moveLimit,...rules}=game.position.rules;
 let next:Game={...game,position:{...game.position,rules},trail:game.trail.map(t=>({...t,position:{...t.position,rules}})),result:game.result?.reason==='move-limit'?null:game.result};
 for(const move of step.moves)next=play(next,move);
 if(step.resigned)next=resign(next,step.resigned);
 return moveLimit===undefined?next:withMoveLimit(next,moveLimit);
}
export function goForwardHistory(state:Timeline):Timeline {
 const step=state.redo[0];return step?{game:replayStep(state.game,step),redo:state.redo.slice(1)}:state;
}
