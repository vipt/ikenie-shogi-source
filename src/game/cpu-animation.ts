import {play,resign,type Game,type Move,type Piece} from './engine';
import {replaceGame,type Timeline} from './history';
export type CpuAnimation={id:number;before:Game;after:Game;move:Move};
export type AnimatedTimeline=Timeline&{cpuAnimation?:CpuAnimation};
export function stageCpuMove(state:AnimatedTimeline,expected:Game,move:Move|null,id:number):AnimatedTimeline {
 if(state.game!==expected||state.cpuAnimation)return state;
 if(!move)return replaceGame(resign(state.game));
 return {...state,cpuAnimation:{id,before:state.game,after:play(state.game,move),move}};
}
export function completeCpuMove(state:AnimatedTimeline,id:number):AnimatedTimeline {
 const motion=state.cpuAnimation;
 return motion?.id===id&&state.game===motion.before?replaceGame(motion.after):state;
}
export function movingPiece(motion:CpuAnimation):Piece {
 return 'from' in motion.move?motion.before.position.board[motion.move.from]!:{kind:motion.move.drop,side:motion.before.position.turn,promoted:false};
}
export type BoardPoint={x:number;y:number};
export function squareCenter(square:number,width:number,flipped:boolean):BoardPoint {
 const index=flipped?80-square:square,size=(width-12)/9;
 return {x:6+(index%9+.5)*size,y:6+(Math.floor(index/9)+.5)*size};
}
