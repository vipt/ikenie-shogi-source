import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createGame,play,resign,type Side} from '../src/game/engine';
import {moveToUsi,toSfen,type UsiRuleMode} from './lib/usi-format';
import {startInstalledEngine,projectRoot} from './lib/installed-usi';
const profile=process.argv[2]??'hao';
if(!['hao','trained'].includes(profile))throw new Error('Use hao or trained');
type Search={side:Side;recoveryAllowed:boolean;move:string;nodes:number;depth:number;elapsedMs:number;recovery:boolean};
type Record={id:number;pair:number;recoverySide:Side;result:{winner:Side|null;reason:string};points:number;plies:number;moves:string[];searches:Search[];replayVerified:boolean};
async function main(){
 const model=JSON.parse(await readFile(resolve(projectRoot,'artifacts/engines/recovery-v1/training-manifest.json'),'utf8'));
 const lock=JSON.parse(await readFile(resolve(projectRoot,'scripts/usi-engine-lock.json'),'utf8'));
 const build=JSON.parse(await readFile(resolve(projectRoot,'.tools/engines/meguru-asymmetric-v1/build-manifest.json'),'utf8'));
 const hashes:{[key:string]:string}={};
 for(const f of ['scripts/compare-asymmetric-rules.ts','scripts/lib/installed-usi.ts','scripts/lib/usi-engine.ts','scripts/lib/usi-format.ts','src/game/engine.ts']){
   hashes[f]=createHash('sha256').update(await readFile(resolve(projectRoot,f))).digest('hex');
 }
 const results:Record[]=[];const began=Date.now();
 const summary=()=>{
  const wins=results.filter(r=>r.points===1).length,losses=results.filter(r=>r.points===0).length,draws=results.length-wins-losses;
  const side=(s:Side)=>({wins:results.filter(r=>r.recoverySide===s&&r.points===1).length,losses:results.filter(r=>r.recoverySide===s&&r.points===0).length,draws:results.filter(r=>r.recoverySide===s&&r.points===.5).length});
  const stats=(allowed:boolean)=>{
   const rows=results.flatMap(r=>r.searches).filter(m=>m.recoveryAllowed===allowed);
   return {moves:rows.length,recoveries:rows.filter(m=>m.recovery).length,averageMs:rows.reduce((s,m)=>s+m.elapsedMs,0)/(rows.length||1),averageDepth:rows.reduce((s,m)=>s+m.depth,0)/(rows.length||1)};
  };
  return {games:results.length,wins,losses,draws,winRate:results.length?wins/results.length:0,scoreRate:results.length?(wins+.5*draws)/results.length:0,
   sente:side('sente'),gote:side('gote'),newRules:stats(true),standardRules:stats(false),averagePlies:results.reduce((s,r)=>s+r.plies,0)/(results.length||1)};
 };
 const save=async(complete:boolean)=>writeFile(resolve(projectRoot,'reports/asymmetric-rules-'+profile+'.json'),JSON.stringify({
  createdAt:new Date().toISOString(),complete,profile,conditions:{gamesPlanned:20,pairs:10,openings:'Initial position every game; sides exchanged within each pair; repeated openings are not independent samples',
   rules:'Only recoverySide may capture friendly non-kings; kings cannot recover; both engines search the same asymmetric rules',
   evaluationNew:profile==='trained'?'fine-tuned Hao':'original Hao',evaluationStandard:'original Hao',
   evaluationNewSha256:profile==='trained'?model.sha256:lock.evaluation.sha256,evaluationStandardSha256:lock.evaluation.sha256,
   book:false,movetimeMs:100,threadsPerSearch:1,hashMiB:64,maxPlies:256,engineSha256:build.sha256,sourceHashes:hashes,
   freshProcessesPerGame:true,adjudication:'Actual app-rule outcome; no eval-score adjudication; 256-ply cap is draw'},
   elapsedMs:Date.now()-began,summary:summary(),results},null,2));
 await save(false);
 for(let pair=0;pair<10;pair++)for(const recoverySide of ['sente','gote'] as const){
   const mode:UsiRuleMode=recoverySide==='sente'?'asymmetric-sente':'asymmetric-gote';
   const rules={kingCapture:'enemy',selfCapture:recoverySide} as const;
   const variant=await startInstalledEngine(mode,profile==='trained'?{evalFile:model.evalFile,evalSha256:model.sha256}:{});
   let standard:Awaited<ReturnType<typeof startInstalledEngine>>|undefined;
   const stop=()=>{void variant.close();void standard?.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
   try{
    standard=await startInstalledEngine(mode);
    let game=createGame(rules);const searches:Search[]=[];
    while(!game.result&&game.log.length<256){
     const side=game.position.turn,recoveryAllowed=side===recoverySide;
     const a=await(recoveryAllowed?variant:standard).analyze(game,100);
     if(a.resigned){game=resign(game);break;}
     assert.ok(a.move);
     game=play(game,a.move);
     const recovery=game.log.at(-1)!.selfCapture;
     if(recovery)assert.ok(recoveryAllowed,'Standard side recovered a friendly piece');
     searches.push({side,recoveryAllowed,move:a.bestmove,nodes:a.nodes,depth:a.depth,elapsedMs:a.elapsedMs,recovery});
    }
    let replay=createGame(rules);
    for(const m of game.log)replay=play(replay,m.move);
    if(game.result?.reason==='resign')replay=resign(replay);
    assert.deepEqual(replay.result,game.result);
    assert.equal(toSfen(replay.position,1,mode),toSfen(game.position,1,mode));
    const result=game.result??{winner:null,reason:'ply-limit'},points=result.winner===null?.5:result.winner===recoverySide?1:0;
    results.push({id:results.length,pair,recoverySide,result,points,plies:game.log.length,moves:game.log.map(m=>moveToUsi(m.move)),searches,replayVerified:true});
    await save(false);
    console.log(profile+' '+results.length+'/20 recovery '+recoverySide+' '+(points===1?'win':points===0?'loss':'draw')+' '+game.log.length+' plies');
   }finally{await variant.close();await standard?.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
 }
 await save(true);console.log(JSON.stringify(summary()));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
