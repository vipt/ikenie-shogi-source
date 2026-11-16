import {createEvaluationObserver,type EvaluationListener} from './evaluation-progress';
export type {EvaluationUpdate} from './evaluation-progress';
import {bookSupported,bookVariant} from './book-rules';
import {scoreForSente} from './presentation';
import nativeEngine from '../../modules/meguru-engine';
import {chooseCpuMoveAsync,analyzePositionAsync,evaluatePosition} from './cpu';
import {cpuSearchProfile} from './match-settings';
import {legalMoves,sameMove,type Game,type Move,type Rules} from './engine';
import type {Settings} from './persistence';
import {gameToUsiPosition,moveFromUsi,type UsiRuleMode} from './usi-format';
export const NATIVE_AVAILABLE=!!nativeEngine;
export const MODE_LABELS={cpu:'ひとりで練習',local:'ふたりで対局',watch:'CPU同士で対局'};
export const RECOVERY_LABELS={both:'両者が回収できる',none:'通常ルール（回収なし）',sente:'先手だけ回収できる',gote:'後手だけ回収できる'};
export function nativeSupported(rules:Rules){return rules.kingCapture==='enemy'||rules.kingCapture==='all';}
export function usesNative(s:Settings){return NATIVE_AVAILABLE&&s.cpuEngine==='native'&&nativeSupported(s.rules);}
export function engineLabel(s:Settings){
  if(usesNative(s))return (s.model==='trained'?'やねうら王 · 追加学習':'やねうら王 · Háo')+(s.book&&bookSupported(s.rules)?bookVariant(s.rules)==='king-recovery'?'＋定跡（玉も回収）':'＋定跡':'');
  return '従来CPU';
}
function mode(rules:Rules):UsiRuleMode{
  if(rules.kingCapture==='all')return 'mobile-king-all';
  const recovery=rules.selfCapture??'both';
  return recovery==='both'?'recovery':recovery==='none'?'standard':recovery==='sente'?'asymmetric-sente':'asymmetric-gote';
}
// Native flags: recovery sides in bits 0/1, king recovery in bit 2.
function mask(rules:Rules){return ({both:3,none:0,sente:1,gote:2})[rules.selfCapture??'both'] | (rules.kingCapture==='all'?4:0);}
let sequence=0;
const nextRequest=()=>sequence=Math.max(Date.now()*1000,sequence+1);
const observer=(game:Game,listener?:EvaluationListener)=>createEvaluationObserver(game.position.turn,listener);
function pollProgress(id:number,emit:ReturnType<typeof observer>,enabled:boolean){
  if(!enabled)return ()=>{};
  const timer=setInterval(()=>{
    try{emit(JSON.parse(nativeEngine!.progress(id)));}catch{/* The completed result still reports errors. */}
  },200);
  return ()=>clearInterval(timer);
}
export function startCpuSearch(game:Game,settings:Settings,gameId:string,onUpdate?:EvaluationListener):{result:Promise<Move|null>;cancel:()=>void}{
  let cancelled=false;const requestId=nextRequest(),native=usesNative(settings);
  const profile=cpuSearchProfile(settings,game.position.turn);
  const emit=observer(game,onUpdate),stopPoll=pollProgress(requestId,emit,native&&!!onUpdate);
  const cancel=()=>{cancelled=true;stopPoll();if(native)nativeEngine?.cancel(requestId);};
  const result=(async()=>{
    if(!native){
      emit({scoreCp:evaluatePosition(game.position)});
      return chooseCpuMoveAsync(game.position,{difficulty:'strong',...profile,variety:game.log.length<12?15:0,history:game.trail,shouldStop:()=>cancelled,onUpdate:a=>{if(!cancelled)emit({scoreCp:a.bestScore??a.score,depth:a.depth,nodes:a.nodes});}});
    }
    const book=settings.book&&bookSupported(game.position.rules);
    const raw=await nativeEngine!.analyze(gameToUsiPosition(game,mode(game.position.rules)),settings.model,mask(game.position.rules),
      book,profile.timeMs,gameId,requestId,{moveLimit:game.position.rules.moveLimit??0,maxDepth:profile.nativeDepth});
    if(cancelled||raw==='cancelled')return null;
    if(raw.startsWith('error:'))throw new Error(raw.slice(6));
    const analysis=JSON.parse(raw) as {bestmove:string;scoreCp:number;depth:number;nodes:number};emit(analysis);
    if(analysis.bestmove==='resign')return null;
    const move=moveFromUsi(analysis.bestmove);
    if(!legalMoves(game.position).some(m=>sameMove(m,move)))throw new Error('CPUが不正な手を返しました。');
    return move;
  })().finally(stopPoll);
  return {result,cancel};
}

/** Continuous analysis is cancelled on a position/lifecycle change; CPU turns share their own search. */
export function startPositionEvaluation(game:Game,settings:Settings,gameId:string,options:{continuous?:boolean;onUpdate?:EvaluationListener}={}):{result:Promise<number|null>;cancel:()=>void}{
  let cancelled=false;const requestId=nextRequest(),native=usesNative(settings);
  const emit=observer(game,options.onUpdate),stopPoll=pollProgress(requestId,emit,native&&!!options.onUpdate);
  const cancel=()=>{cancelled=true;stopPoll();if(native)nativeEngine?.cancel(requestId);};
  const result=(async()=>{
    if(game.result)return null;
    if(!native){
      const initial=evaluatePosition(game.position);emit({scoreCp:initial});
      if(!options.continuous)return scoreForSente(initial,game.position.turn);
      let bestDepth=0,bestCp=initial,completedNodes=0;
      while(!cancelled){
        const report=(a:{depth:number;score:number;bestScore?:number;nodes:number})=>{
          if(cancelled)return;
          if(a.depth>=bestDepth){bestDepth=a.depth;bestCp=a.bestScore??a.score;}
          emit({scoreCp:bestCp,depth:bestDepth,nodes:completedNodes+a.nodes});
        };
        const result=await analyzePositionAsync(game.position,{difficulty:'strong',timeMs:2000,maxNodes:64000,maxDepth:20,history:game.trail,shouldStop:()=>cancelled,onUpdate:report});
        if(result&&!cancelled){report(result);completedNodes+=result.nodes;}
        if(!cancelled)await new Promise<void>(resolve=>setTimeout(resolve,250));
      }
      return null;
    }
    const book=settings.book&&bookSupported(game.position.rules);
    const raw=await nativeEngine!.analyze(gameToUsiPosition(game,mode(game.position.rules)),settings.model,mask(game.position.rules),book,options.continuous?0:100,gameId,requestId,{moveLimit:game.position.rules.moveLimit??0,maxDepth:0});
    if(cancelled||raw==='cancelled')return null;
    if(raw.startsWith('error:'))throw new Error(raw.slice(6));
    const a=JSON.parse(raw) as {scoreCp?:number;depth?:number;nodes?:number};
    if(typeof a.scoreCp!=='number'||!Number.isFinite(a.scoreCp))throw new Error('Evaluation unavailable');
    emit(a);return scoreForSente(a.scoreCp,game.position.turn);
  })().finally(stopPoll);
  return {result,cancel};
}
