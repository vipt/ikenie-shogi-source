import {writeFile} from 'node:fs/promises';
import {createGame,play} from '../src/game/engine';
import {RECOVERY_RULES,moveFromUsi} from './lib/usi-format';
import {startInstalledEngine} from './lib/installed-usi';
async function main(){const e=await startInstalledEngine('recovery',{multiPV:12});try{const g=createGame(RECOVERY_RULES);const a=await e.analyze(g,15000);const rows=a.variations.map(v=>({...v,label:play(g,moveFromUsi(v.move)).log.at(-1)!.label}));await writeFile('reports/recovery-book-v2-root-research.json',JSON.stringify({createdAt:new Date().toISOString(),model:'original Hao',ms:15000,multiPV:12,analysis:a,candidates:rows},null,2));console.log(JSON.stringify(rows.map(v=>({move:v.move,label:v.label,score:v.score,depth:v.depth,pv:v.pv.slice(0,8)})),null,2));}finally{await e.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
