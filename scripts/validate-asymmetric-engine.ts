import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createGame,initialPosition,emptyHand,legalMoves,applyUnchecked,play,isInCheck,opposite,type Position,type Kind,type Side} from '../src/game/engine';
import {moveToUsi,moveFromUsi,toSfen,type UsiRuleMode} from './lib/usi-format';
import {startInstalledEngine,projectRoot} from './lib/installed-usi';
async function main(){
 const results=[];
 for(const variant of ['sente','gote'] as const){
  const mode:UsiRuleMode=variant==='sente'?'asymmetric-sente':'asymmetric-gote';
  const rules={kingCapture:'enemy',selfCapture:variant} as const;
  const engine=await startInstalledEngine(mode);
  let positions=0,transitions=0,recoveries=0,standardMoves=0;
  const probe=async(g:ReturnType<typeof createGame>)=>{
    const r=await engine.probe(g);
    assert.equal(r.rule,'asymmetric-king-enemy-v1');assert.equal(r.recoveryMask,variant==='sente'?1:2);assert.ok(r.valid);
    assert.equal(r.inCheck,isInCheck(g.position,g.position.turn));
    assert.equal(r.sfen,toSfen(g.position,g.log.length+1,mode));
    assert.deepEqual(r.children.map(c=>c.move).sort(),legalMoves(g.position).map(moveToUsi).sort());
    for(const c of r.children){
      assert.ok(c.valid);
      const m=moveFromUsi(c.move),recovery='from' in m&&g.position.board[m.to]?.side===g.position.turn;
      assert.equal(c.recovery,recovery);
      if(recovery){assert.equal(g.position.turn,variant);recoveries++;}
      assert.equal(c.sfen,toSfen(applyUnchecked(g.position,m),g.log.length+2,mode));
      transitions++;if(g.position.turn!==variant)standardMoves++;
    }positions++;
  };
  const mirror=(p:Position):Position=>({...p,turn:opposite(p.turn),board:[...p.board].reverse().map(v=>v?{...v,side:opposite(v.side)}:null),hands:{sente:p.hands.gote,gote:p.hands.sente}});
  const blank=():Position=>{
    const p:Position={board:Array(81).fill(null),hands:{sente:emptyHand(),gote:emptyHand()},turn:'sente',rules};
    p.board[3]={kind:'K',side:'gote',promoted:false};p.board[77]={kind:'K',side:'sente',promoted:false};return p;
  };
  try{
    for(const turn of ['sente','gote'] as const){
      const p=initialPosition(rules);p.turn=turn;
      assert.equal(legalMoves(p).filter(m=>'from'in m&&p.board[m.to]?.side===turn).length>0,turn===variant);
      if(turn!==variant)assert.equal(legalMoves(p).length,30);
      await probe(createGame(rules,p));
    }
    for(const mover of ['sente','gote'] as const){
      for(const kind of ['P','L','N','S','B','R'] as Kind[]){
        let p=blank();p.board[40]={kind:'R',side:'sente',promoted:false};p.board[31]={kind,side:'sente',promoted:true};
        if(mover==='gote')p=mirror(p);
        const g=createGame(rules,p);await probe(g);
        const m={from:40,to:mover==='sente'?31:49,promote:false};
        if(mover===variant)await probe(play(g,m));else assert.throws(()=>play(g,m));
      }
      let p=blank();p.board[77]=null;p.board[40]={kind:'K',side:'sente',promoted:false};p.board[31]={kind:'G',side:'sente',promoted:false};
      if(mover==='gote')p=mirror(p);
      await probe(createGame(rules,p));
      assert.throws(()=>play(createGame(rules,p),{from:40,to:mover==='sente'?31:49,promote:false}));
      p=blank();p.board[3]=null;p.board[77]=null;
      for(const [at,kind,side] of [[4,'K','gote'],[76,'K','sente'],[3,'L','gote'],[5,'L','gote'],[12,'P','gote'],[14,'P','gote'],[22,'G','sente']] as const)p.board[at]={kind,side,promoted:false};
      p.hands.sente.P=1;if(mover==='gote')p=mirror(p);
      await probe(createGame(rules,p));
      assert.throws(()=>play(createGame(rules,p),{drop:'P',to:mover==='sente'?13:67}));
    }
    let seed=20261114;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let run=0;run<3;run++){
      let g=createGame(rules);
      for(let ply=0;ply<40&&!g.result;ply++){
        await probe(g);
        const moves=legalMoves(g.position);
        const captures=moves.filter(m=>'from'in m&&g.position.board[m.to]?.side===variant);
        const candidates=captures.length&&random()<.4?captures:moves;
        g=play(g,candidates[Math.floor(random()*candidates.length)]!);
      }
    }
    results.push({variant,positions,transitions,recoveries,standardMoves});
    console.log(JSON.stringify(results.at(-1)));
  }finally{await engine.close();}
 }
 await writeFile(resolve(projectRoot,'reports/asymmetric-engine-validation.json'),JSON.stringify({createdAt:new Date().toISOString(),results,allLegalSetsMatch:true,allTransitionsMatch:true},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
