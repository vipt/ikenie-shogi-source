import type {Side} from './engine';
import {scoreForSente} from './presentation';
export type EvaluationUpdate={cp:number;depth:number;nodes:number};
export type EvaluationListener=(update:EvaluationUpdate)=>void;
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0;
/** Suppress identical polls, but preserve node-only progress while score/depth stay unchanged. */
export function createEvaluationObserver(turn:Side,listener?:EvaluationListener){
 let last='';
 return (value:{scoreCp?:number;depth?:number;nodes?:number})=>{
  if(!listener||typeof value.scoreCp!=='number'||!Number.isFinite(value.scoreCp))return;
  const update={cp:scoreForSente(value.scoreCp,turn),depth:count(value.depth),nodes:count(value.nodes)};
  const key=update.cp+':'+update.depth+':'+update.nodes;
  if(key===last)return;last=key;listener(update);
 };
}
