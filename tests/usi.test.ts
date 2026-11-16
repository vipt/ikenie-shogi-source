import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createGame, emptyHand, initialPosition, play, type Position } from '../src/game/engine';
import { gameToUsiPosition, moveFromUsi, moveToUsi, STANDARD_RULES, toSfen } from '../scripts/lib/usi-format';
import { UsiEngine } from '../scripts/lib/usi-engine';

const startSfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
test('USI uses the correct board orientation, hands, promotion and move numbers', () => {
  assert.equal(toSfen(initialPosition(STANDARD_RULES)), startSfen);
  const p: Position = { board: Array(81).fill(null), hands: { sente: emptyHand(), gote: emptyHand() },
    turn: 'gote', rules: STANDARD_RULES };
  p.board[0] = { side: 'gote', kind: 'B', promoted: true };
  p.board[80] = { side: 'sente', kind: 'P', promoted: true };
  p.hands.sente.R = 1; p.hands.sente.P = 12; p.hands.gote.B = 2;
  assert.equal(toSfen(p, 37), '+b8/9/9/9/9/9/9/9/8+P w R12P2b 37');
});
test('USI moves round-trip including captures, promotion and drops', () => {
  for (const text of ['7g7f', '8h2b+', 'B*8h', 'P*5e', '5a4b', '1i9a+']) {
    assert.equal(moveToUsi(moveFromUsi(text)), text);
  }
  assert.deepEqual(moveFromUsi('7g7f'), { from: 56, to: 47, promote: false });
  for (const text of ['resign', 'win', 'P*0a', 'K*5e', '7g7z', '7g7f\nquit', 'P*5e+']) {
    assert.throws(() => moveFromUsi(text));
  }
});
test('USI preserves history, and rejects all recovery and nonstandard king rules', () => {
  let game = createGame(STANDARD_RULES);
  for (const m of ['7g7f', '3c3d', '8h2b+', '3a2b', 'B*8h']) game = play(game, moveFromUsi(m));
  assert.equal(gameToUsiPosition(game), 'position sfen ' + startSfen + ' moves 7g7f 3c3d 8h2b+ 3a2b B*8h');
  for (const selfCapture of [undefined, 'both', 'sente', 'gote'] as const) {
    assert.throws(() => gameToUsiPosition(createGame({ kingCapture: 'enemy', selfCapture })));
  }
  assert.throws(() => toSfen(initialPosition({ selfCapture: 'none', kingCapture: 'none' })));
});
async function fake(mode = 'normal', options: Record<string, number> = { Threads: 1 }) {
  return UsiEngine.start({ executable: process.execPath, args: [resolve('tests/fixtures/usi-engine.cjs'), mode],
    options, startupTimeoutMs: 1000, searchGraceMs: 100 });
}
test('USI handshake accepts split lines, parses search info and shuts down', async () => {
  const engine = await fake();
  try {
    assert.equal(engine.name, 'Fake USI');
    const result = await engine.analyze(createGame(STANDARD_RULES), 10);
    assert.equal(result.bestmove, '7g7f'); assert.equal(result.depth, 8); assert.equal(result.nodes, 1234);
    assert.deepEqual(result.score, { type: 'cp', value: 42 });
    assert.deepEqual(result.pv, ['7g7f', '3c3d']);
  } finally { await engine.close(); }
});
test('USI fails explicitly on missing options and startup timeout', async () => {
  await assert.rejects(fake('normal', { Missing: 1 }), /unavailable/);
  await assert.rejects(fake('startup-hang'), /timeout/);
});
test('USI rejects illegal bestmove, crashes, timeout, concurrent search and early close', async () => {
  for (const mode of ['illegal', 'crash', 'hang']) {
    const engine = await fake(mode);
    try {
      const pending = engine.analyze(createGame(STANDARD_RULES), 10);
      await assert.rejects(engine.analyze(createGame(STANDARD_RULES), 10), /already in progress/);
      await assert.rejects(pending, /illegal|exited|timeout/);
    } finally { await engine.close(); }
  }
  const engine = await fake('hang');
  const rejected = assert.rejects(engine.analyze(createGame(STANDARD_RULES), 10), /closed/);
  await engine.close(); await rejected;
});
test('USI resignation is a game outcome, not an invalid move', async () => {
  const engine = await fake('resign');
  try {
    const result = await engine.analyze(createGame(STANDARD_RULES), 10);
    assert.equal(result.resigned, true); assert.equal(result.move, null);
  } finally { await engine.close(); }
});


test('USI refuses invalid composed positions before starting native search', () => {
  const p = initialPosition(STANDARD_RULES);
  p.board[4] = null;
  assert.throws(() => gameToUsiPosition(createGame(STANDARD_RULES, p)), /one king/);
  p.board = Array(81).fill(null);
  p.board[4] = { kind: 'K', side: 'gote', promoted: false };
  p.board[76] = { kind: 'K', side: 'sente', promoted: false };
  p.board[22] = { kind: 'R', side: 'sente', promoted: false };
  assert.throws(() => gameToUsiPosition(createGame(STANDARD_RULES, p)), /previous side/);
});

test('recovery bridge permits only both-side recovery with kingCapture=enemy', async () => {
  const { RECOVERY_RULES } = await import('../scripts/lib/usi-format');
  let game=createGame(RECOVERY_RULES);
  game=play(game,moveFromUsi('2h8h'));
  assert.match(gameToUsiPosition(game,'recovery'),/moves 2h8h$/);
  assert.throws(()=>gameToUsiPosition(game),/standard shogi/);
  assert.doesNotThrow(()=>gameToUsiPosition(createGame(),'recovery'));
  for(const kingCapture of ['all','none'] as const) {
    assert.throws(()=>gameToUsiPosition(createGame({selfCapture:'both',kingCapture}),'recovery'),/kingCapture/);
  }
  for(const selfCapture of ['sente','gote','none'] as const) {
    assert.throws(()=>gameToUsiPosition(createGame({selfCapture,kingCapture:'enemy'}),'recovery'),/both sides/);
  }
});
test('recovery bridge refuses an unpatched engine even when its protocol works', async () => {
  await assert.rejects(UsiEngine.start({
    ruleMode:'recovery', executable:process.execPath,
    args:[resolve('tests/fixtures/usi-engine.cjs'),'normal'], options:{}, startupTimeoutMs:1000,
  }), /patched Meguru/);
});


test('SFEN reader preserves promoted pieces, hands and recovery rules', async () => {
  const {fromSfen,RECOVERY_RULES}=await import('../scripts/lib/usi-format');
  const sfen='+b8/9/9/9/9/9/9/9/8+P w R12P2b 37';
  const p=fromSfen(sfen,'recovery');
  assert.equal(toSfen(p,37,'recovery'),sfen);
  assert.deepEqual(p.rules,RECOVERY_RULES);
  assert.deepEqual(fromSfen(startSfen),initialPosition(STANDARD_RULES));
  for(const invalid of [
    '9/9/9/9/9/9/9/9/8 b - 1',
    '9/9/9/9/9/9/9/9/+K8 b - 1',
    '9/9/9/9/9/9/9/9/9 b 19P 1',
    '9/9/9/9/9/9/9/9/9 b PP 1',
    '9/9/9/9/9/9/9/9/9 b K 1',
    '9/9/9/9/9/9/9/9/9 x - 1',
  ])assert.throws(()=>fromSfen(invalid));
});
test('MultiPV exact scores follow the chosen move despite later bounds and rank changes', async () => {
  const engine=await fake('multipv');
  try {
    const a=await engine.analyze(createGame(STANDARD_RULES),10);
    assert.equal(a.bestmove,'7g7f');
    assert.deepEqual(a.score,{type:'cp',value:42});
    assert.equal(a.depth,8);
    assert.deepEqual(a.pv,['7g7f','3c3d']);
    assert.equal(a.variations.length,2);
    assert.ok(a.variations.every(v=>!v.score.bound));
  } finally {await engine.close();}
});

test('asymmetric bridge requires the exact recovery side and rejects king recovery', async () => {
  const {fromSfen}=await import('../scripts/lib/usi-format');
  for(const side of ['sente','gote'] as const){
    const mode=side==='sente'?'asymmetric-sente':'asymmetric-gote';
    const rules={kingCapture:'enemy',selfCapture:side} as const;
    assert.doesNotThrow(()=>gameToUsiPosition(createGame(rules),mode));
    assert.deepEqual(fromSfen(startSfen,mode).rules,rules);
    assert.throws(()=>gameToUsiPosition(createGame(),mode),/mismatch/);
    assert.throws(()=>gameToUsiPosition(createGame({...rules,kingCapture:'all'}),mode),/mismatch/);
    assert.throws(()=>gameToUsiPosition(createGame({...rules,selfCapture:side==='sente'?'gote':'sente'}),mode),/mismatch/);
  }
});
test('asymmetric bridge refuses an engine without side-specific rules', async () => {
  await assert.rejects(UsiEngine.start({ruleMode:'asymmetric-sente',executable:process.execPath,
    args:[resolve('tests/fixtures/usi-engine.cjs'),'normal'],options:{},startupTimeoutMs:1000}),/asymmetric Meguru/);
});
