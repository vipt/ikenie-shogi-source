import type {Difficulty} from './cpu';
export const CPU_LEVELS=[1,2,3,4,5,6,7,8,9,10] as const;
export type CpuLevel=typeof CPU_LEVELS[number];
export const DEFAULT_CPU_LEVEL:CpuLevel=7;
export const validCpuLevel=(n:unknown):n is CpuLevel=>typeof n==='number'&&Number.isInteger(n)&&n>=1&&n<=10;
export const legacyCpuLevel=(difficulty:Difficulty):CpuLevel=>difficulty==='easy'?1:difficulty==='normal'?5:7;
export function cpuLevel(settings:{cpuLevel?:CpuLevel;difficulty:Difficulty}):CpuLevel{return settings.cpuLevel??legacyCpuLevel(settings.difficulty);}
export const legacyDifficulty=(level:CpuLevel):Difficulty=>level<=2?'easy':level<=5?'normal':'strong';
// Level 7 retains the previous strong CPU's search budget.
const times=[100,200,300,450,700,1200,2400,4000,6500,10000] as const;
const depths=[1,2,3,4,6,9,0,0,0,0] as const;
const nodes=[250,500,1000,3000,8000,16000,32000,64000,128000,256000] as const;
export function cpuLevelProfile(level:CpuLevel){return {timeMs:times[level-1]!,nativeDepth:depths[level-1]!,maxDepth:level,maxNodes:nodes[level-1]!};}
export function cpuLevelDescription(level:CpuLevel){
 const seconds=cpuLevelProfile(level).timeMs/1000;
 return `1手の思考時間：最大${seconds}秒程度`;
}
