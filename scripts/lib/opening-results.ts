import assert from 'node:assert/strict';
export type Outcome={root:string;replicate:number;result:{winner:'sente'|'gote'|null}};
export const point=(g:Outcome):number=>g.result.winner==='sente'?1:g.result.winner==='gote'?0:.5;
export function trainWeights(roots:string[],games:Outcome[],trainingReplicates=16):Record<string,number>{
 return Object.fromEntries(roots.map(root=>{const rows=games.filter(g=>g.root===root&&g.replicate<trainingReplicates);assert.equal(rows.length,trainingReplicates);assert.equal(new Set(rows.map(g=>g.replicate)).size,trainingReplicates);const posterior=(rows.reduce((n,g)=>n+point(g),0)+4)/(rows.length+8);return [root,Math.max(1,Math.min(6,Math.round(8*posterior*posterior)))];}));
}
export function wilson(wins:number,total:number){if(!total)return null;const z=1.959963984540054,p=wins/total,d=1+z*z/total,c=(p+z*z/(2*total))/d,h=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/d;return [c-h,c+h];}
/** Roundoff must not turn a confidence bound of zero into positive evidence. */
export const supportedImprovement=(difference:number,lower:number)=>difference>1e-12&&lower>1e-12;
export function assessWeights(roots:string[],games:Outcome[],weights:Record<string,number>,trainingReplicates=16,validationReplicates=16){
 const sum=roots.reduce((n,r)=>n+weights[r]!,0);assert(sum>0);const rows:{replicate:number;uniform:number;weighted:number;difference:number}[]=[];
 for(let replicate=trainingReplicates;replicate<trainingReplicates+validationReplicates;replicate++){const scores=roots.map(root=>{const matches=games.filter(g=>g.root===root&&g.replicate===replicate);assert.equal(matches.length,1);return point(matches[0]!);});const uniform=scores.reduce((a,b)=>a+b,0)/roots.length,weighted=scores.reduce((n,s,i)=>n+s*weights[roots[i]!]!,0)/sum;rows.push({replicate,uniform,weighted,difference:weighted-uniform});}
 let seed=202611151;const random=()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
 const samples=Array.from({length:10000},()=>{let v=0;for(let i=0;i<rows.length;i++)v+=rows[Math.floor(random()*rows.length)]!.difference;return v/rows.length;}).sort((a,b)=>a-b);
 const average=(key:'uniform'|'weighted'|'difference')=>rows.reduce((n,r)=>n+r[key],0)/rows.length;
 const confidence95=[samples[250]!,samples[9749]!].map(v=>Math.abs(v)<1e-12?0:v);return {uniformScore:average('uniform'),weightedScore:average('weighted'),difference:average('difference'),confidence95,adopt:supportedImprovement(average('difference'),confidence95[0]!),method:'Paired cluster bootstrap by common replicate seed; 10000 draws; independent validation fold; expected score of initial-move selection policy, not head-to-head win rate',replicates:rows};
}
