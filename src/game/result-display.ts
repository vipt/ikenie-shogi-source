import {SIDE_LABEL,type Result} from './engine';
import {playerFor} from './match-settings';
import type {Settings} from './persistence';

const reasons:Record<Result['reason'],string>={mate:'詰み','no-moves':'指せる手なし',repetition:'千日手','perpetual-check':'連続王手の千日手',resign:'投了','move-limit':'手数上限'};
export function resultDisplay(result:Result,settings:Settings,plies:number){
 const player=result.winner?playerFor(settings,result.winner):null;
 const yourWin=!!result.winner&&player?.kind==='human'&&settings.mode==='cpu';
 const title=result.winner?SIDE_LABEL[result.winner]+'の勝ち':'引き分け';
 const participant=player?(player.kind==='cpu'?'CPU Lv.'+player.level:yourWin?'あなた':SIDE_LABEL[result.winner!]+'プレイヤー'):'勝敗なし';
 return {title,participant,yourWin,detail:reasons[result.reason]+' · '+plies+'手まで',summary:title+' · '+participant};
}

/** Initial restore and unchanged results do not trigger a new emphasis. */
export const isNewResult=(previous:string|null|undefined,current:string|null)=>previous!==undefined&&current!==null&&previous!==current;
