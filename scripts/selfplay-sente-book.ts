import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createGame,play,resign,type Side} from '../src/game/engine';
import {RECOVERY_RULES,moveFromUsi,moveToUsi,toSfen} from './lib/usi-format';
import {projectRoot,startInstalledEngine} from './lib/installed-usi';
import type {UsiEngine} from './lib/usi-engine';

const arg=(name:string,fallback:number)=>{const at=process.argv.indexOf('--'+name);const n=at<0?fallback:Number(process.argv[at+1]);if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid '+name);return n;};
const games=arg('games',50),workers=arg('workers',4),movetimeMs=arg('movetime',100),maxPlies=arg('max-plies',256);
if(workers>8||games>1000||movetimeMs>60000||maxPlies>1000)throw Error('Unsafe benchmark size');
type Search={side:Side;move:string;nodes:number;depth:number;elapsedMs:number;recovery:boolean;score:unknown;bookEnabled:boolean;bookHit:boolean};
type RecordGame={id:number;worker:number;result:{winner:Side|null;reason:string};plies:number;moves:string[];searches:Search[];finalSfen:string;recoveries:{sente:number;gote:number};elapsedMs:number;replayVerified:boolean};
async function main(){
 const output=resolve(projectRoot,'reports/recovery-sente-book-hao-'+games+'.json');
 const lock=JSON.parse(await readFile(resolve(projectRoot,'scripts/usi-engine-lock.json'),'utf8'));
 const build=JSON.parse(await readFile(resolve(projectRoot,'.tools/engines/meguru-v1/build-manifest.json'),'utf8'));
 assert.equal(lock.options.USI_OwnBook,false);assert.equal(lock.options.BookFile,'no_book');
 const bookRoot=resolve(projectRoot,'artifacts/engines/recovery-v1');
 const book=JSON.parse(await readFile(resolve(bookRoot,'book-manifest.json'),'utf8'));
 const bookBytes=await readFile(resolve(bookRoot,'book/user_book1.db'));
 assert.equal(createHash('sha256').update(bookBytes).digest('hex'),book.sha256);
 assert.deepEqual(book.rules,RECOVERY_RULES);
 const bookMoves=new Map<string,string>(book.entries.map((e:{sfen:string;move:string})=>[e.sfen,e.move]));
 const hashes:Record<string,string>={};
 for(const f of ['scripts/selfplay-sente-book.ts','scripts/lib/installed-usi.ts','scripts/lib/usi-engine.ts','src/game/engine.ts','src/game/usi-format.ts']){
  hashes[f]=createHash('sha256').update(await readFile(resolve(projectRoot,f))).digest('hex');
 }
 const protocol={plannedGames:games,workers,movetimeMs,maxPlies,rules:RECOVERY_RULES,evaluation:lock.evaluation.name,evaluationSha256:lock.evaluation.sha256,engine:build.name,engineSha256:build.sha256,threadsPerGame:1,hashMiB:lock.options.USI_Hash,book:{sente:true,gote:false,sha256:book.sha256,positions:book.positions,maxPly:24,generatedWithEvaluationSha256:book.modelSha256,appliedToEvaluationSha256:lock.evaluation.sha256,bookHitDefinition:'Zero searched nodes and move matches stored entry for current SFEN'},options:lock.options,
  initialPosition:'All games start from the standard initial placement; no forced or randomized opening moves.',
  engineState:'One shared engine for both sides; USI_OwnBook toggles before each move without clearing search state. A fresh process and hash table for every game.',
  stopping:'Run every predetermined game ID to completion or the 256-ply limit. No early stop based on win rate.',
  limitations:'PC, 100ms per move, 64MiB hash; mobile strong mode uses 2400ms and 32MiB. Repeated identical starting conditions and time-limited search can correlate games. This is not a universal first-move advantage estimate.'};
 const results:RecordGame[]=[];const active=new Set<UsiEngine>();let abort=false;const began=Date.now();
 const summary=()=>{
  const n=results.length,sente=results.filter(r=>r.result.winner==='sente').length,gote=results.filter(r=>r.result.winner==='gote').length,draws=n-sente-gote;
  const allSearches=results.flatMap(r=>r.searches);
  const bySide=(side:Side)=>{const a=allSearches.filter(x=>x.side===side);return {moves:a.length,meanNodes:a.reduce((s,x)=>s+x.nodes,0)/(a.length||1),meanDepth:a.reduce((s,x)=>s+x.depth,0)/(a.length||1),meanElapsedMs:a.reduce((s,x)=>s+x.elapsedMs,0)/(a.length||1)};};
  return {games:n,senteWins:sente,goteWins:gote,draws,senteWinRate:n?sente/n:null,goteWinRate:n?gote/n:null,drawRate:n?draws/n:null,senteDecisiveWinRate:sente+gote?sente/(sente+gote):null,senteScoreRate:n?(sente+.5*draws)/n:null,
   meanPlies:results.reduce((s,r)=>s+r.plies,0)/(n||1),meanRecoveries:results.reduce((s,r)=>s+r.recoveries.sente+r.recoveries.gote,0)/(n||1),
   uniqueFullGames:new Set(results.map(r=>r.moves.join(' '))).size,uniqueFirst10Plies:new Set(results.map(r=>r.moves.slice(0,10).join(' '))).size,
   reasons:Object.fromEntries([...new Set(results.map(r=>r.result.reason))].map(reason=>[reason,results.filter(r=>r.result.reason===reason).length])),
   bookHits:allSearches.filter(s=>s.bookHit).length,meanBookHits:allSearches.filter(s=>s.bookHit).length/(n||1),gamesWithoutBookHits:results.filter(r=>!r.searches.some(s=>s.bookHit)).length,
   search:{sente:bySide('sente'),gote:bySide('gote')}};
 };
 let writes=Promise.resolve();
 const save=(complete:boolean)=>{const text=JSON.stringify({createdAt:new Date().toISOString(),complete,protocol,sourceHashes:hashes,elapsedMs:Date.now()-began,summary:summary(),results:[...results].sort((a,b)=>a.id-b.id)},null,2);writes=writes.then(async()=>{await writeFile(output+'.tmp',text);await rename(output+'.tmp',output);});return writes;};
 const stop=()=>{abort=true;for(const e of active)void e.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 await save(false);
 try{
  await Promise.all(Array.from({length:Math.min(workers,games)},(_,worker)=>(async()=>{
   for(let id=worker;id<games&&!abort;id+=workers){
    const e=await startInstalledEngine('recovery',{bookDir:resolve(bookRoot,'book')});active.add(e);const started=Date.now();
    try{
     let game=createGame(RECOVERY_RULES);const searches:Search[]=[];
     while(!game.result&&game.log.length<maxPlies&&!abort){
      const side=game.position.turn,bookEnabled=side==='sente';
      e.setOwnBook(bookEnabled);
      const beforeSfen=toSfen(game.position,1,'recovery');
      const a=await e.analyze(game,movetimeMs);
      const bookHit=bookEnabled&&a.nodes===0&&bookMoves.get(beforeSfen)===a.bestmove;
      if(!a.move){game=resign(game);break;}
      game=play(game,a.move);searches.push({side,move:a.bestmove,nodes:a.nodes,depth:a.depth,elapsedMs:a.elapsedMs,recovery:game.log.at(-1)!.selfCapture,score:a.score,bookEnabled,bookHit});
     }
     if(abort)throw Error('Benchmark interrupted');
     let replay=createGame(RECOVERY_RULES);
     for(const entry of game.log)replay=play(replay,moveFromUsi(moveToUsi(entry.move)));
     if(game.result?.reason==='resign')replay=resign(replay);
     assert.deepEqual(replay.position,game.position);assert.deepEqual(replay.result,game.result);
     results.push({id,worker,result:game.result??{winner:null,reason:'ply-limit'},plies:game.log.length,moves:game.log.map(r=>moveToUsi(r.move)),searches,finalSfen:toSfen(game.position,game.log.length+1,'recovery'),recoveries:{sente:searches.filter(s=>s.side==='sente'&&s.recovery).length,gote:searches.filter(s=>s.side==='gote'&&s.recovery).length},elapsedMs:Date.now()-started,replayVerified:true});
     await save(false);const s=summary();console.log(JSON.stringify({completed:s.games,total:games,sente:s.senteWins,gote:s.goteWins,draws:s.draws,lastGame:id,plies:game.log.length}));
    }finally{active.delete(e);await e.close();}
   }
  })().catch(error=>{stop();throw error;})));
  assert.equal(results.length,games);await save(true);console.log(JSON.stringify(summary()));
 }finally{stop();await Promise.allSettled([...active].map(e=>e.close()));process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
