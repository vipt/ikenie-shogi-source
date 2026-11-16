import type {Rules, Side} from './engine';

/** Squares removed from the upper (gote) camp; rotate 180° for sente. */
export const HANDICAPS = {
  lance: {label:'香落ち', removed:[8], description:'左の香（角のある側）'},
  bishop: {label:'角落ち', removed:[16], description:'角'},
  rook: {label:'飛車落ち', removed:[10], description:'飛車'},
  'rook-lance': {label:'飛香落ち', removed:[10,8], description:'飛車と左の香'},
  two: {label:'二枚落ち', removed:[10,16], description:'飛車・角'},
  four: {label:'四枚落ち', removed:[10,16,0,8], description:'飛車・角・左右の香'},
  six: {label:'六枚落ち', removed:[10,16,0,8,1,7], description:'飛車・角・左右の香と桂'},
  eight: {label:'八枚落ち', removed:[10,16,0,8,1,7,2,6], description:'飛車・角・左右の香・桂・銀'},
  ten: {label:'十枚落ち', removed:[10,16,0,8,1,7,2,6,3,5], description:'玉と歩以外のすべての駒'},
} as const;
export type HandicapKind = keyof typeof HANDICAPS;
export type Handicap = {kind:HandicapKind; side:Side};
export const HANDICAP_KINDS = Object.keys(HANDICAPS) as HandicapKind[];
export function validHandicap(value:unknown):value is Handicap {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const h=value as Handicap;
  return Object.hasOwn(HANDICAPS,h.kind)&&['sente','gote'].includes(h.side);
}
export function handicapLabel(rules:Rules):string {
  const h=rules.handicap;
  if(h!==undefined&&!validHandicap(h))return '手合割不明';
  return h ? `${HANDICAPS[h.kind].label} · 上手：${h.side==='sente'?'先手':'後手'}側` : '平手';
}
