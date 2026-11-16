import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGame, play, type Move, type Side } from '../src/game/engine';

const file = 'reports/self-play-strong-100.json';
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
type Row = { id: number; winner: Side | null; reason: string; recoveries: number; senteRecoveries: number; goteRecoveries: number; plies: number; moves: Move[] };
const rows = report.results as Row[];
assert.equal(rows.length, 100);
assert.equal(new Set(rows.map(r => r.id)).size, 100);
const kinds: Record<string, number> = {};
for (const row of rows) {
  let game = createGame(report.protocol.rules);
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
  if (!game.result) assert.equal(row.plies, report.protocol.maxPlies);
}
const sum = report.summary;
assert.equal(sum.senteWins, rows.filter(r => r.winner === 'sente').length);
assert.equal(sum.goteWins, rows.filter(r => r.winner === 'gote').length);
assert.equal(sum.totalRecoveries, rows.reduce((n, r) => n + r.recoveries, 0));
assert.equal(sum.averageRecoveries, sum.totalRecoveries / rows.length);
report.audit = { replayedLegalGames: rows.length, recoveryKinds: kinds, sourceSha256: Object.fromEntries(['src/game/cpu-search.ts', 'src/game/engine.ts', 'scripts/self-play-strong.ts'].map(f => [f, createHash('sha256').update(fs.readFileSync(f)).digest('hex')])) };
fs.writeFileSync(file, JSON.stringify(report, null, 2));
const percent = (x: number) => `${(x * 100).toFixed(1)}%`;
const content = `# 新CPU同士100局の検証

実施日：2026-11-14。v1.1.0の「強め」同士で100局を実行し、全棋譜を再生して合法性・勝敗・回収数を照合しました。

## 勝率

| 結果 | 局数 | 全100局に対する割合 |
| --- | ---: | ---: |
| 先手勝ち | ${sum.senteWins} | ${percent(sum.senteWinRate)} |
| 後手勝ち | ${sum.goteWins} | ${percent(sum.goteWinRate)} |
| 引き分け | ${sum.draws} | ${percent(sum.drawRate)} |

引き分けを除いた先手勝率：${sum.decisiveSenteRate === null ? '算出不可' : percent(sum.decisiveSenteRate)}。引き分けを0.5勝とした先手得点率：${percent(sum.senteScoreRate)}。
シードの組を単位に再抽出した先手得点率の95%ブートストラップ区間：${sum.senteScorePairBootstrap95.map(percent).join('〜')}。

## 味方の駒の回収

| 集計 | 1局あたり平均 |
| --- | ---: |
| 先後合計 | ${sum.averageRecoveries.toFixed(2)}回 |
| 先手 | ${sum.averageSenteRecoveries.toFixed(2)}回 |
| 後手 | ${sum.averageGoteRecoveries.toFixed(2)}回 |

全100局で合計${sum.totalRecoveries}回。回収があった対局は${sum.gamesWithRecoveries}局。味方の駒を取った1手を1回と数え、成駒も含みます。打ち直した手は数えません。

平均手数は${sum.averagePlies.toFixed(2)}手。異なる全棋譜は${sum.uniqueGames}種類でした。通常探索の平均完了深度は${sum.averageCompletedDepth.toFixed(2)}手（捕獲・成り・王手回避の追加探索を除く）です。

## 条件と限界

- 玉は味方の駒を取れず、相手の駒は取れる標準設定。初期配置から開始。
- 両者とも最大32,000ノード、最大通常深度7。端末速度・並列負荷に結果を左右されないよう時間制限を無効化。実アプリの強めは2.4秒でも停止するため、実機で常に同じ着手になるわけではありません。
- 得点は変更せず、ルートで候補を調べる順番に乱数を導入。同じ棋譜の繰り返しを減らす実験用設定です。50組で乱数seedを先後入れ替え。base seedは20261114。
- 320手で打ち切り、実験上の引き分け。終了理由別の件数：${Object.entries(sum.reasons).map(([k, v]) => `${k} ${v}局`).join('、')}。
- 同じCPUと同じ初期局面による100局の結果です。このルール自体の先後有利・不利や、人間同士の勝率を断定するものではありません。似た手順が多い場合、見かけの100局より情報量は少なくなります。
- [全棋譜・集計・ソースのハッシュ](self-play-strong-100.json)。以前の[旧CPU1,000局](SELF_PLAY.md)とは別の実験です。

## 再現

\`\`\`sh
npx tsx scripts/self-play-strong.ts --games 100 --workers 8
npx tsx scripts/summarize-strong-selfplay.ts
\`\`\`
`;
fs.writeFileSync('reports/SELF_PLAY_STRONG_100.md', content);
console.log(JSON.stringify({ ...sum, audit: report.audit }, null, 2));
