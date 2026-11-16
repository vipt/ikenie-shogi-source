import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { createGame, play, resign, type Move, type Side } from '../src/game/engine';
import { analyzePosition, LIMITS } from '../src/game/cpu';
import { RECOVERY_RULES, moveFromUsi, moveToUsi, toSfen } from './lib/usi-format';
import { projectRoot, startInstalledEngine } from './lib/installed-usi';

const suite = process.argv[2] ?? 'short';
if (!['short','app'].includes(suite)) throw new Error('Use short or app');
const movetimeMs = suite === 'short' ? 100 : LIMITS.strong.timeMs;
const pairCount = suite === 'short' ? 10 : 2;
const profiles = suite === 'short' ? ['hao','trained'] as const : ['trained'] as const;
const output = resolve(projectRoot,'reports/native-vs-app-'+suite+'.json');
type SearchLog = {side:Side; player:string; depth:number; nodes:number; elapsedMs:number; move:string; recovery:boolean};
type GameRecord = {
  id:number; pair:number; profile:string; nativeSide:Side; opening:string[]; startSfen:string;
  result:{winner:Side|null;reason:string}; points:number; plies:number; elapsedMs:number;
  moves:string[]; searches:SearchLog[]; replayVerified:boolean;
};
async function main(){
  const model=JSON.parse(await readFile(resolve(projectRoot,'artifacts/engines/recovery-v1/training-manifest.json'),'utf8'));
  const lock=JSON.parse(await readFile(resolve(projectRoot,'scripts/usi-engine-lock.json'),'utf8'));
  const build=JSON.parse(await readFile(resolve(projectRoot,'.tools/engines/meguru-v1/build-manifest.json'),'utf8'));
  const sourceHashes:Record<string,string>={};
  for(const f of ['src/game/cpu-search.ts','src/game/engine.ts','scripts/compare-native-vs-app.ts']){
    sourceHashes[f]=createHash('sha256').update(await readFile(resolve(projectRoot,f))).digest('hex');
  }
  const openings:string[][]=[[]];
  for(let pair=1;pair<pairCount;pair++){
    const teacher=JSON.parse(await readFile(resolve(projectRoot,'.tools/training/recovery-v1/games',String((pair-1)*10+9).padStart(4,'0')+'.json'),'utf8'));
    openings.push(teacher.moves.slice(0,8));
  }
  const results:GameRecord[]=[];const began=Date.now();
  const summary=()=>profiles.map(profile=>{
    const rows=results.filter(r=>r.profile===profile);
    const wins=rows.filter(r=>r.points===1).length,losses=rows.filter(r=>r.points===0).length,draws=rows.length-wins-losses;
    const side=(s:Side)=>({wins:rows.filter(r=>r.nativeSide===s&&r.points===1).length,losses:rows.filter(r=>r.nativeSide===s&&r.points===0).length,draws:rows.filter(r=>r.nativeSide===s&&r.points===.5).length});
    const stats=(player:string)=>{
      const moves=rows.flatMap(r=>r.searches.filter(m=>m.player===player));
      const average=(field:'elapsedMs'|'depth'|'nodes')=>moves.reduce((n,m)=>n+m[field],0)/(moves.length||1);
      return {moves:moves.length,averageElapsedMs:average('elapsedMs'),averageCompletedDepth:average('depth'),averageNodes:average('nodes'),
        maxElapsedMs:Math.max(0,...moves.map(m=>m.elapsedMs)),zeroCompletedDepthMoves:moves.filter(m=>m.depth===0).length,
        recoveries:moves.filter(m=>m.recovery).length};
    };
    return {profile,games:rows.length,wins,losses,draws,winRate:rows.length?wins/rows.length:0,scoreRate:rows.length?(wins+draws*.5)/rows.length:0,
      sente:side('sente'),gote:side('gote'),native:stats('native'),oldApp:stats('old-app'),
      averagePlies:rows.reduce((n,r)=>n+r.plies,0)/(rows.length||1)};
  });
  const save=async(complete:boolean)=>{
    await writeFile(output,JSON.stringify({createdAt:new Date().toISOString(),complete,suite,
      conditions:{rules:RECOVERY_RULES,gamesPlanned:pairCount*2*profiles.length,movetimeMs,book:false,
        maxPlies:256,threadsPerNativeSearch:1,hashMiB:64,oldApp:{difficulty:'strong',...LIMITS.strong,timeMs:movetimeMs},
        openings:'Pair 0: initial position. Other pairs: first 8 plies of held-out teacher games 9,19,...; same openings for both colors and profiles.',
        openingSelection:'Fixed before results; model-generated openings, not an exhaustive sample of human play',
        drawPolicy:'Fourfold repetition or 256-ply cap; perpetual check loses according to app rules',
        timing:'Equal requested time budget; actual search time recorded. Old CPU retains app depth/node caps. No artificial eval-score adjudication.',
        engineSha256:build.sha256,haoSha256:lock.evaluation.sha256,trainedSha256:model.sha256,sourceHashes},
      elapsedMs:Date.now()-began,summary:summary(),results},null,2));
  };
  await save(false);
  for(const profile of profiles){
    const engine=await startInstalledEngine('recovery',profile==='trained'?{evalFile:model.evalFile,evalSha256:model.sha256}:{});
    const stop=()=>{void engine.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
    try{
      for(let pair=0;pair<pairCount;pair++)for(const nativeSide of ['sente','gote'] as const){
        let game=createGame(RECOVERY_RULES);
        const opening=openings[pair]!;
        for(const m of opening)game=play(game,moveFromUsi(m));
        assert.equal(game.result,null);
        const startSfen=toSfen(game.position,game.log.length+1,'recovery');
        const searches:SearchLog[]=[];const start=Date.now();
        engine.newGame();
        while(!game.result&&game.log.length<256){
          const side=game.position.turn,native=side===nativeSide;
          let move:Move|null,depth:number,nodes:number,elapsedMs:number;
          if(native){
            const a=await engine.analyze(game,movetimeMs);
            ({move,depth,nodes,elapsedMs}=a);
            if(a.resigned){game=resign(game);break;}
          }else{
            const a=analyzePosition(game.position,{difficulty:'strong',timeMs:movetimeMs,history:game.trail});
            ({move,depth,nodes,elapsedMs}=a);
          }
          assert.ok(move,'No move from active player without terminal game');
          game=play(game,move);
          searches.push({side,player:native?'native':'old-app',depth,nodes,elapsedMs,move:moveToUsi(move),recovery:game.log.at(-1)!.selfCapture});
        }
        let replay=createGame(RECOVERY_RULES);
        for(const m of game.log)replay=play(replay,m.move);
        assert.equal(toSfen(replay.position,1,'recovery'),toSfen(game.position,1,'recovery'));
        if(game.result?.reason!=='resign')assert.deepEqual(replay.result,game.result);
        const result=game.result??{winner:null,reason:'ply-limit'};
        const points=result.winner===null?.5:result.winner===nativeSide?1:0;
        results.push({id:results.length,pair,profile,nativeSide,opening,startSfen,result,points,plies:game.log.length,elapsedMs:Date.now()-start,
          moves:game.log.map(m=>moveToUsi(m.move)),searches,replayVerified:true});
        await save(false);
        console.log(suite+' '+results.length+'/'+(pairCount*2*profiles.length)+' '+profile+' '+nativeSide+' '+(points===1?'win':points===0?'loss':'draw')+' '+game.log.length+' plies');
      }
    }finally{await engine.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
  }
  await save(true);
  console.log(JSON.stringify(summary()));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
