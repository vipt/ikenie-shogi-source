import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame, play, type Move, type Side } from '../src/game/engine';

type Row = { id: number; pair: number; senteSeed: number; goteSeed: number; winner: Side | null; reason: string; recoveries: number; senteRecoveries: number; goteRecoveries: number; plies: number; totalDepth: number; moves: Move[] };
const rows: Row[] = fs.readdirSync('reports').filter(f => /^self-play-strong-100\.json\.part-\d+\.json$/.test(f)).flatMap(f => JSON.parse(fs.readFileSync(`reports/${f}`, 'utf8'))).sort((a, b) => a.id - b.id);
assert.equal(rows.length, 50, 'exactly 50 finished games are required');
assert.equal(new Set(rows.map(r => r.id)).size, 50);
const kinds: Record<string, number> = {};
for (const row of rows) {
  let game = createGame({ kingCapture: 'enemy' });
  for (const move of row.moves) {
    const target = game.position.board[move.to];
    if ('from' in move && target?.side === game.position.turn) kinds[target.kind] = (kinds[target.kind] ?? 0) + 1;
    game = play(game, move);
  }
  assert.equal(game.log.length, row.plies);
  assert.equal(game.log.filter(r => r.selfCapture).length, row.recoveries);
  for (const side of ['sente', 'gote'] as const) assert.equal(game.log.filter(r => r.selfCapture && r.side === side).length, row[side === 'sente' ? 'senteRecoveries' : 'goteRecoveries']);
  assert.equal(game.result?.winner ?? null, row.winner);
  assert.equal(game.result?.reason ?? 'move-limit', row.reason);
  if (!game.result) assert.equal(row.plies, 320);
}
const games = rows.length;
const senteWins = rows.filter(r => r.winner === 'sente').length, goteWins = rows.filter(r => r.winner === 'gote').length;
const reasons: Record<string, number> = {}, pairs: Record<number, number> = {};
for (const r of rows) { reasons[r.reason] = (reasons[r.reason] ?? 0) + 1; pairs[r.pair] = (pairs[r.pair] ?? 0) + 1; }
const totalRecoveries = rows.reduce((n, r) => n + r.recoveries, 0);
const summary = {
  games, senteWins, goteWins, draws: games - senteWins - goteWins, reasons,
  senteWinRate: senteWins / games, goteWinRate: goteWins / games,
  decisiveSenteRate: senteWins / (senteWins + goteWins),
  totalRecoveries, averageRecoveries: totalRecoveries / games,
  totalSenteRecoveries: rows.reduce((n, r) => n + r.senteRecoveries, 0),
  totalGoteRecoveries: rows.reduce((n, r) => n + r.goteRecoveries, 0),
  averageSenteRecoveries: rows.reduce((n, r) => n + r.senteRecoveries, 0) / games,
  averageGoteRecoveries: rows.reduce((n, r) => n + r.goteRecoveries, 0) / games,
  gamesWithRecoveries: rows.filter(r => r.recoveries > 0).length,
  averagePlies: rows.reduce((n, r) => n + r.plies, 0) / games,
  averageCompletedDepth: rows.reduce((n, r) => n + r.totalDepth, 0) / rows.reduce((n, r) => n + r.plies, 0),
  uniqueGames: new Set(rows.map(r => JSON.stringify(r.moves))).size,
  completeSeedPairs: Object.values(pairs).filter(n => n === 2).length,
  unpairedGames: Object.values(pairs).filter(n => n === 1).length,
};
assert.equal(summary.totalSenteRecoveries + summary.totalGoteRecoveries, totalRecoveries);
const report = {
  finishedAt: new Date().toISOString(), status: 'stopped-at-50-at-user-request',
  protocol: { initiallyPlannedGames: 100, completedGames: games, rules: { kingCapture: 'enemy' }, engine: 'v1.1.0 strong', maxNodes: 32000, maxDepth: 7, timeMs: 'unlimited for reproducibility', randomness: 'seeded root move ordering only; scores unchanged', baseSeed: 20261114, maxPlies: 320, moveLimitIsExperimentalDraw: true, initialPosition: 'standard', initialWorkers: 8, selection: '50 completed games at the requested early stop; unfinished games excluded', selectionLimitation: 'parallel completion and early stopping can favor shorter games; seed pairing is incomplete' },
  summary, results: rows,
  audit: { replayedLegalGames: games, recoveryKinds: kinds, sourceSha256: Object.fromEntries(['src/game/cpu-search.ts', 'src/game/engine.ts', 'scripts/self-play-strong.ts'].map(f => [f, createHash('sha256').update(fs.readFileSync(f)).digest('hex')])) },
};
fs.writeFileSync('reports/self-play-strong-50.json', JSON.stringify(report, null, 2));
const pct = (n: number) => `${(100 * n).toFixed(1)}%`;
fs.writeFileSync('reports/SELF_PLAY_STRONG_50.md', `# 新CPU同士50局の結果

実施日：2026-11-14。v1.1.0の「強め」同士で対戦しました。当初100局の予定でしたが、ユーザーの指示で完了50局の時点で計算を終了しました。

## 勝率

| 結果 | 局数 | 全50局に対する割合 |
| --- | ---: | ---: |
| 先手勝ち | ${senteWins} | ${pct(summary.senteWinRate)} |
| 後手勝ち | ${goteWins} | ${pct(summary.goteWinRate)} |
| 引き分け | ${summary.draws} | ${pct(summary.draws / games)} |

引き分けを除いた先手勝率は${pct(summary.decisiveSenteRate)}です。終了理由：${Object.entries(reasons).map(([k, v]) => `${k} ${v}局`).join('、')}。

## 味方の駒を取った回数

| 対象 | 合計回数 | 1局あたり平均 |
| --- | ---: | ---: |
| 先手 | ${summary.totalSenteRecoveries} | ${summary.averageSenteRecoveries.toFixed(2)}回 |
| 後手 | ${summary.totalGoteRecoveries} | ${summary.averageGoteRecoveries.toFixed(2)}回 |
| 先後合計 | ${totalRecoveries} | ${summary.averageRecoveries.toFixed(2)}回 |

「回収」は味方の駒を取った1手を1回と数えます。成駒も含み、打ち直した手は数えません。回収があった対局は${summary.gamesWithRecoveries}局、平均手数は${summary.averagePlies.toFixed(2)}手でした。

## 条件と限界

- 玉は味方の駒を取れず、相手の駒は取れる標準設定。初期配置から開始。
- 両者とも最大32,000ノード、最大通常深度7。端末速度・並列負荷に左右されないよう時間制限を無効化。実アプリでは2.4秒でも停止するため、実機と常に同じ着手になるわけではありません。
- 候補を調べる順番に乱数を導入し、評価点は変更していません。base seedは20261114。完了した先後交換の組は${summary.completeSeedPairs}組、片側だけ終了したものは${summary.unpairedGames}局です。
- 320手で実験上の引き分け。未完了の対局は勝率にも回収平均にも含めません。
- 並列計算を途中で止め、完了済み50局を集計しました。終了が早い対局が含まれやすい可能性があり、先後の有利不利を断定する実験ではありません。信頼区間は提示しません。
- 異なる全棋譜は${summary.uniqueGames}種類。通常探索の平均完了深度は${summary.averageCompletedDepth.toFixed(2)}手（捕獲・成り・王手回避の追加探索を除く）。
- 全50局を合法手として再生し、勝敗と先後別の回収数を照合済み。
- [全棋譜・集計・ソースのハッシュ](self-play-strong-50.json)。[旧CPU同士の1,000局](SELF_PLAY.md)とは別の実験です。
`);
console.log(JSON.stringify(summary, null, 2));
