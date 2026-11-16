import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {createGame,play,resign,type Side} from '../src/game/engine';
import {RECOVERY_RULES,moveFromUsi,moveToUsi,toSfen} from './lib/usi-format';
import {projectRoot} from './lib/installed-usi';
import {startTrainedRecoveryEngine} from './lib/recovery-profile';

const suite=process.argv[2]??'initial';
if(!['initial','varied'].includes(suite))throw new Error('Use initial or varied');
type Entry={sfen:string;history:string[];move:string};
type Search={side:Side;useBook:boolean;move:string;nodes:number;depth:number;elapsedMs:number;bookHit:boolean;zeroNodes:boolean;recovery:boolean};
type Record={pair:number;bookSide:Side;opening:string[];startSfen:string;result:{winner:Side|null;reason:string};points:number;plies:number;elapsedMs:number;moves:string[];searches:Search[];replayVerified:boolean};
async function main(){
  const root=resolve(projectRoot,'artifacts/engines/recovery-v1');
  const book=JSON.parse(await readFile(resolve(root,'book-manifest.json'),'utf8'));
  const model=JSON.parse(await readFile(resolve(root,'training-manifest.json'),'utf8'));
  const build=JSON.parse(await readFile(resolve(projectRoot,'.tools/engines/meguru-v1/build-manifest.json'),'utf8'));
  const candidates=(book.entries as Entry[]).filter(e=>e.history.length===6).sort((a,b)=>a.sfen<b.sfen?-1:a.sfen>b.sfen?1:0);
  assert.ok(candidates.length>=10);
  const openings=Array.from({length:10},(_,i)=>suite==='initial'?[]:candidates[Math.floor(i*candidates.length/10)]!.history);
  const bookMoves=new Map<string,string>((book.entries as Entry[]).map(e=>[e.sfen,e.move]));

  const hashes:{[key:string]:string}={};
  for(const f of ['scripts/compare-recovery-book.ts','scripts/lib/recovery-profile.ts','scripts/lib/installed-usi.ts','src/game/engine.ts']){
    hashes[f]=createHash('sha256').update(await readFile(resolve(projectRoot,f))).digest('hex');
  }
  const results:Record[]=[];const began=Date.now();
  const summary=()=>{
    const wins=results.filter(r=>r.points===1).length,losses=results.filter(r=>r.points===0).length,draws=results.length-wins-losses;
    const side=(s:Side)=>({wins:results.filter(r=>r.bookSide===s&&r.points===1).length,losses:results.filter(r=>r.bookSide===s&&r.points===0).length,draws:results.filter(r=>r.bookSide===s&&r.points===.5).length});
    const moves=results.flatMap(r=>r.searches);
    const stats=(useBook:boolean)=>{
      const rows=moves.filter(m=>m.useBook===useBook);
      return {moves:rows.length,confirmedBookHits:rows.filter(m=>m.bookHit).length,zeroNodeMoves:rows.filter(m=>m.zeroNodes).length,
        meanElapsedMs:rows.reduce((s,r)=>s+r.elapsedMs,0)/(rows.length||1),meanNodes:rows.reduce((s,r)=>s+r.nodes,0)/(rows.length||1)};
    };
    return {games:results.length,wins,losses,draws,winRate:results.length?wins/results.length:0,scoreRate:results.length?(wins+.5*draws)/results.length:0,
      sente:side('sente'),gote:side('gote'),withBook:stats(true),withoutBook:stats(false),averageBookHitsPerGame:moves.filter(m=>m.bookHit).length/(results.length||1)};
  };
  const save=async(complete:boolean)=>writeFile(resolve(projectRoot,'reports/book-vs-no-book-'+suite+'.json'),JSON.stringify({
    createdAt:new Date().toISOString(),complete,suite,conditions:{rules:RECOVERY_RULES,gamesPlanned:20,movetimeMs:100,threadsPerSearch:1,hashMiB:64,maxPlies:256,
      modelSha256:model.sha256,bookSha256:book.sha256,engineSha256:build.sha256,sourceHashes:hashes,
      openings:suite==='initial'?'Initial position repeated ten color-swapped pairs; repetitions are not independent openings':
        'Ten of the 25 book positions after six plies, SFEN sorted and evenly indexed before matches; both colors at every position',
      bookConfiguration:'Existing recovery-v1 profile, BookMoves=24; no saved time carried forward',
      bookHitDefinition:'Zero search nodes and selected move equals the stored move for the current SFEN',
      evaluation:'Identical fine-tuned Hao model on both sides; only book configuration differs'},openings,elapsedMs:Date.now()-began,summary:summary(),results},null,2));
  await save(false);
  const on=await startTrainedRecoveryEngine(true);
  let off:Awaited<ReturnType<typeof startTrainedRecoveryEngine>>|undefined;
  const stop=()=>{void on.close();void off?.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try{
    off=await startTrainedRecoveryEngine(false);
    for(let pair=0;pair<10;pair++)for(const bookSide of ['sente','gote'] as const){
      let game=createGame(RECOVERY_RULES);
      const opening=openings[pair]!;
      for(const m of opening)game=play(game,moveFromUsi(m));
      assert.equal(game.result,null);
      const startSfen=toSfen(game.position,1,'recovery'),searches:Search[]=[];
      on.newGame();off.newGame();const start=Date.now();
      while(!game.result&&game.log.length<256){
        const side=game.position.turn,useBook=side===bookSide;
        const sfen=toSfen(game.position,1,'recovery');
        const a=await(useBook?on:off).analyze(game,100);
        if(a.resigned){game=resign(game);break;}
        assert.ok(a.move);
        game=play(game,a.move);
        const bookHit=useBook&&a.nodes===0&&bookMoves.get(sfen)===a.bestmove;
        searches.push({side,useBook,move:a.bestmove,nodes:a.nodes,depth:a.depth,elapsedMs:a.elapsedMs,bookHit,zeroNodes:a.nodes===0,recovery:game.log.at(-1)!.selfCapture});
      }
      let replay=createGame(RECOVERY_RULES);
      for(const m of game.log)replay=play(replay,m.move);
      if(game.result?.reason==='resign')replay=resign(replay);
      assert.equal(toSfen(replay.position,1,'recovery'),toSfen(game.position,1,'recovery'));
      assert.deepEqual(replay.result,game.result);
      const result=game.result??{winner:null,reason:'ply-limit'};
      const points=result.winner===null?.5:result.winner===bookSide?1:0;
      results.push({pair,bookSide,opening,startSfen,result,points,plies:game.log.length,elapsedMs:Date.now()-start,moves:game.log.map(m=>moveToUsi(m.move)),searches,replayVerified:true});
      await save(false);
      console.log(suite+' '+results.length+'/20 book '+bookSide+' '+(points===1?'win':points===0?'loss':'draw')+' '+game.log.length+' plies; book hits '+searches.filter(m=>m.bookHit).length);
    }
    await save(true);console.log(JSON.stringify(summary()));
  }finally{await on.close();await off?.close();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

