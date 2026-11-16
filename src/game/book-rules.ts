import type {Rules} from './engine';
/** Separate books are researched for each king rule, both-side recovery only. */
export function bookVariant(rules:Rules):'recovery'|'king-recovery'|null {
 if(rules.handicap||(rules.selfCapture??'both')!=='both')return null;
 return rules.kingCapture==='enemy'?'recovery':rules.kingCapture==='all'?'king-recovery':null;
}
export const bookSupported=(rules:Rules)=>bookVariant(rules)!==null;
