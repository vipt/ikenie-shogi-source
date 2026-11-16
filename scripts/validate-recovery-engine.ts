import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createGame, emptyHand, play, legalMoves, isInCheck, applyUnchecked, resign,
  type Game, type Kind, type Position } from '../src/game/engine';
import { RECOVERY_RULES, moveFromUsi, moveToUsi, toSfen } from './lib/usi-format';
import { projectRoot, startInstalledEngine } from './lib/installed-usi';
import type { UsiAnalysis } from './lib/usi-engine';

const blank = (): Position => {
  const p: Position = { board: Array(81).fill(null), hands: { sente: emptyHand(), gote: emptyHand() },
    turn: 'sente', rules: RECOVERY_RULES };
  p.board[3] = { kind: 'K', side: 'gote', promoted: false };
  p.board[77] = { kind: 'K', side: 'sente', promoted: false };
  return p;
};
const put = (p: Position, at: number, kind: Kind, side: 'sente' | 'gote' = 'sente', promoted = false) => {
  p.board[at] = { kind, side, promoted };
};
async function main() {
  const engine = await startInstalledEngine('recovery');
  const began = Date.now();
  let positions = 0, transitions = 0, recoveries = 0;
  const cases: { name: string; legalMoves: number; recoveryMoves: number }[] = [];
  const probe = async (game: Game, name: string, saveCase = false) => {
    const result = await engine.probe(game);
    assert.equal(result.rule, 'recovery-king-enemy-v1');
    assert.equal(result.valid, true, 'Native state/evaluation/undo invariant: ' + name);
    assert.equal(result.sfen, toSfen(game.position, game.log.length + 1, 'recovery'), 'Root SFEN: ' + name);
    assert.equal(result.inCheck, isInCheck(game.position, game.position.turn));
    const legal = legalMoves(game.position).map(moveToUsi).sort();
    assert.deepEqual(result.children.map(x => x.move).sort(), legal, 'Complete legal move set: ' + name);
    if (game.result?.reason === 'repetition') assert.equal(result.repetition, 'draw');
    if (game.result?.reason === 'perpetual-check') {
      assert.equal(result.repetition, game.result.winner === game.position.turn ? 'win' : 'lose');
    }
    let count = 0;
    for (const child of result.children) {
      const m = moveFromUsi(child.move);
      const p = applyUnchecked(game.position, m);
      const recovery = 'from' in m && game.position.board[m.to]?.side === game.position.turn;
      assert.equal(child.sfen, toSfen(p, game.log.length + 2, 'recovery'), 'Child SFEN: ' + name + ' ' + child.move);
      assert.equal(child.recovery, recovery);
      assert.equal(child.valid, true);
      if (recovery) {
        assert.notEqual(game.position.board['from' in m ? m.from : -1]?.kind, 'K');
        count++;
      }
    }
    positions++; transitions += legal.length; recoveries += count;
    if (saveCase) cases.push({ name, legalMoves: legal.length, recoveryMoves: count });
    if (positions % 50 === 0) console.log('Validated ' + positions + ' positions / ' + transitions + ' transitions');
  };
  const stop = () => { void engine.close(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    let opening = createGame(RECOVERY_RULES);
    await probe(opening, 'initial', true);
    for (const text of ['2h8h', '2b1c', '1i1g', '2a1c', 'B*4e', 'B*3d']) {
      opening = play(opening, moveFromUsi(text));
      await probe(opening, 'opening-history-' + text, true);
    }
    for (const kind of ['P','L','N','S','G','B','R'] as Kind[]) {
      const p = blank();
      put(p, 40, kind); put(p, kind === 'N' ? 21 : kind === 'B' ? 30 : 31, 'P');
      await probe(createGame(RECOVERY_RULES, p), 'recover-with-' + kind, true);
    }
    for (const kind of ['P','L','N','S','B','R'] as Kind[]) {
      const p = blank(); put(p, 40, 'R'); put(p, 31, kind, 'sente', true);
      let g = createGame(RECOVERY_RULES, p);
      await probe(g, 'recover-promoted-' + kind, true);
      g = play(g, { from: 40, to: 31, promote: false });
      assert.equal(g.position.hands.sente[kind as keyof typeof g.position.hands.sente], 1);
      await probe(g, 'after-promoted-recovery-' + kind);
    }
    {
      const p = blank(); p.board[77] = null; put(p, 40, 'K'); put(p, 31, 'G');
      const g = createGame(RECOVERY_RULES, p);
      assert(!legalMoves(p).some(m => 'from' in m && m.from === 40 && m.to === 31));
      await probe(g, 'king-cannot-recover-gold', true);
      put(p, 31, 'P', 'gote');
      assert(legalMoves(p).some(m => 'from' in m && m.from === 40 && m.to === 31));
      await probe(createGame(RECOVERY_RULES, p), 'king-can-capture-enemy-pawn', true);
    }
    {
      const p = blank(); p.board[77] = null; put(p, 49, 'K'); put(p, 40, 'R');
      await probe(createGame(RECOVERY_RULES, p), 'cannot-capture-own-king', true);
    }
    {
      const p = blank(); p.board[77] = null; put(p,76,'K'); put(p,4,'R','gote');
      put(p,58,'G'); put(p,57,'P');
      assert(!legalMoves(p).some(m => 'from' in m && m.from===58 && m.to===57));
      await probe(createGame(RECOVERY_RULES,p),'pinned-recovery-is-illegal',true);
    }
    {
      const p=blank(); put(p,9,'P'); put(p,0,'S');
      await probe(createGame(RECOVERY_RULES,p),'mandatory-promotion-with-recovery',true);
    }
    {
      const p=blank(); put(p,40,'P'); p.hands.sente.P=2;
      await probe(createGame(RECOVERY_RULES,p),'nifu-and-dead-rank-drops',true);
    }
    {
      const p=blank(); p.board[3]=null; p.board[77]=null; put(p,4,'K','gote'); put(p,76,'K');
      put(p,3,'L','gote');put(p,5,'L','gote');put(p,12,'P','gote');put(p,14,'P','gote');put(p,22,'G');
      p.hands.sente.P=1;
      assert(!legalMoves(p).some(m=>'drop'in m && m.drop==='P' && m.to===13));
      await probe(createGame(RECOVERY_RULES,p),'pawn-drop-mate-is-illegal',true);
      p.board[3]=null;
      assert(legalMoves(p).some(m=>'drop'in m && m.drop==='P' && m.to===13));
      await probe(createGame(RECOVERY_RULES,p),'checking-pawn-drop-with-escape',true);
    }
    for (const checking of [false,true]) {
      const p=blank();p.board[3]=null;p.board[77]=null;put(p,4,'K','gote');put(p,76,'K');
      if(checking){p.turn='gote';put(p,22,'R');}
      let g=createGame(RECOVERY_RULES,p);
      const cycle=checking?['5a4a','5c4c','4a5a','4c5c']:['5i6i','5a4a','6i5i','4a5a'];
      for(let repeat=0;repeat<3;repeat++)for(const m of cycle)g=play(g,moveFromUsi(m));
      assert.equal(g.result?.reason,checking?'perpetual-check':'repetition');
      await probe(g,checking?'perpetual-check-loss':'fourfold-repetition',true);
    }
    // Deterministic legal playouts, biased toward recovery and promotion.
    for (let seed=1;seed<=4;seed++) {
      let rng=seed, game=createGame(RECOVERY_RULES);
      const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
      for(let ply=0;ply<50 && !game.result;ply++) {
        await probe(game,'random-'+seed+'-'+ply);
        const moves=legalMoves(game.position);
        const own=moves.filter(m=>'from' in m && game.position.board[m.to]?.side===game.position.turn);
        const promotions=moves.filter(m=>'promote'in m && m.promote);
        const pool=own.length && random()<0.45 ? own : promotions.length && random()<0.3 ? promotions : moves;
        game=play(game,pool[Math.floor(random()*pool.length)]!);
      }
    }
    // One bounded game verifies that the actual search, not just move generation, uses recovery.
    engine.newGame();
    let game=createGame(RECOVERY_RULES);
    const analyses:UsiAnalysis[]=[];
    while(!game.result && game.log.length<256) {
      const analysis=await engine.analyze(game,100);
      analyses.push(analysis);
      game=analysis.move ? play(game,analysis.move) : resign(game);
      if(game.log.length%20===0 || game.result) console.log('Selfplay '+game.log.length+' plies / '+(game.log.at(-1)?.label??'resign'));
      if(game.log.length%20===0 || game.result) await probe(game,'selfplay-'+game.log.length);
    }
    let replay=createGame(RECOVERY_RULES);
    for(const entry of game.log)replay=play(replay,entry.move);
    assert.equal(toSfen(replay.position,1,'recovery'),toSfen(game.position,1,'recovery'));
    const selfCaptures=game.log.filter(m=>m.selfCapture).length;
    assert(selfCaptures>0,'Search should exercise recovery in the functional selfplay game');
    const report={
      createdAt:new Date().toISOString(),engine:engine.name,rules:RECOVERY_RULES,
      evaluation:'Hao 2023-05-08, unmodified standard-shogi weights',threads:1,hashMiB:64,
      positions,transitions,recoveryTransitions:recoveries,cases,elapsedMs:Date.now()-began,
      selfplay:{movetimeMs:100,maxPlies:256,plies:game.log.length,
        result:game.result??{winner:null,reason:'ply-limit',adjudicated:true},
        selfCaptures,moves:game.log,analyses,replayVerified:true},
      build:JSON.parse(await readFile(resolve(projectRoot,'.tools/engines/meguru-v1/build-manifest.json'),'utf8'))
    };
    await mkdir(resolve(projectRoot,'reports'),{recursive:true});
    await writeFile(resolve(projectRoot,'reports/recovery-engine-validation.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({positions,transitions,recoveries,selfplay:report.selfplay.result,plies:game.log.length,selfCaptures}));
  } finally {
    await engine.close(); process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

