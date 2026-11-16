const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const names=['initial','varied'];
const reports=names.map(n=>JSON.parse(fs.readFileSync(path.join(root,'reports/book-vs-no-book-'+n+'.json'),'utf8')));
for(const r of reports){
  assert.equal(r.complete,true);
  assert.equal(r.results.length,20);
  assert.ok(r.results.every(g=>g.replayVerified));
  assert.equal(r.summary.wins,r.results.filter(g=>g.result.winner===g.bookSide).length);
  assert.equal(r.summary.losses,r.results.filter(g=>g.result.winner!==null&&g.result.winner!==g.bookSide).length);
  for(let i=0;i<20;i+=2){
    assert.equal(r.results[i].bookSide,'sente');assert.equal(r.results[i+1].bookSide,'gote');
    assert.equal(r.results[i].startSfen,r.results[i+1].startSfen);
  }
}
assert.equal(reports[0].conditions.modelSha256,reports[1].conditions.modelSha256);
assert.equal(reports[0].conditions.bookSha256,reports[1].conditions.bookSha256);
const games=reports.flatMap(r=>r.results);
const totals={
  games:40,wins:games.filter(g=>g.points===1).length,losses:games.filter(g=>g.points===0).length,draws:games.filter(g=>g.points===.5).length
};
const fmt=x=>(x*100).toFixed(1)+'%';
const labels=['初期局面から反復','6手目まで進めた10局面'];
const rows=reports.map((r,i)=>{
  const s=r.summary;
  return '| '+[labels[i],s.wins,s.losses,s.draws,fmt(s.winRate),fmt(s.scoreRate)].join(' | ')+' |';
});
rows.push('| 合計（異なる条件の単純合算） | '+[totals.wins,totals.losses,totals.draws,fmt(totals.wins/40),fmt((totals.wins+.5*totals.draws)/40)].join(' | ')+' |');
const detail=reports.map((r,i)=>{
  const hits=r.results.map(g=>g.searches.filter(m=>m.bookHit).length);
  const s=r.summary;
  return '| '+[labels[i],s.sente.wins+'勝'+s.sente.losses+'敗'+s.sente.draws+'分',s.gote.wins+'勝'+s.gote.losses+'敗'+s.gote.draws+'分',
    s.averageBookHitsPerGame.toFixed(2),hits.filter(n=>n===0).length,
    new Set(r.results.map(g=>g.moves.join(' '))).size].join(' | ')+' |';
});
const unknown=games.flatMap(g=>g.searches).filter(m=>m.useBook&&m.zeroNodes&&!m.bookHit).length;
const endings={};
for(const g of games)endings[g.result.reason]=(endings[g.result.reason]??0)+1;
const contents=[
'# 新ルール：専用定跡あり対なし',
'',
'2026-11-14、このPC上で40局を実施。保存先は C:\\Users\\motok\\projects\\shogi。定跡あり側から見た結果です。',
'',
'## 勝率',
'',
'| 開始条件 | 勝ち | 負け | 引き分け | 勝率（勝ち/全局） | 得点率（引き分けを0.5勝） |',
'| --- | ---: | ---: | ---: | ---: | ---: |',
...rows,
'',
'合計は今回選んだ2種類の条件の単純合算です。普段の対局にそのまま当てはまる勝率や、定跡による確実な強化率を表すものではありません。',
'',
'## 先後・定跡利用',
'',
'| 開始条件 | 定跡あり先手（10局） | 定跡あり後手（10局） | 定跡採用の平均回数/局 | 定跡採用0回の局数 | 重複を除いた全指し手列の数 |',
'| --- | --- | --- | ---: | ---: | ---: |',
...detail,
'',
'定跡採用回数は、探索ノード数0で指し、現在のSFENに登録された手と一致したものを集計。各局で定跡あり側のみの回数です。登録手との直接照合ができなかった定跡あり側の0ノード着手は '+unknown+' 手でした。',
'',
'## 同じにした条件',
'',
'- 両者ともMeguruShogi-Recovery-1と同一の追加学習済みHáo評価関数を使用。変えたのは専用定跡の有効・無効だけです。',
'- 新ルール：先後とも自駒回収可、玉は味方の駒を取れず相手の駒は取れます。玉の捕獲は禁止。成駒の回収時は元に戻り、二歩・王手放置・打ち歩詰め・千日手等はアプリの判定を使用。',
'- 双方1手100ms、1スレッド、ハッシュ64MiB。定跡を指して節約した時間を次の手へ繰り越していません。',
'- 定跡はrecovery-v1の466局面、24手目まで。登録外では同じ評価関数で探索します。既存の定跡プロファイルを変更せず使用しました。',
'- 各開始局面で定跡あり側の先後を交換。両エンジンへ毎局usinewgameを送信。',
'- 最大256手。評価値による打ち切りは行わず、上限到達のみ引き分けに分類。',
'- 初期局面組と変化局面組を並行実行。各組で同時に探索するのは1エンジン、全体で最大2探索です。',
'',
'終局理由：'+JSON.stringify(endings)+'。全40局をルール実装で再生し、最終盤面と終局結果が一致しました。',
'',
'## 結果の限界',
'',
'初期局面組は同じ初期局面からの10組20局です。乱数で指し手を混ぜておらず、時間制限による探索の変動で棋譜が変わり得ます。同じ展開が繰り返されるため、独立した20種類の条件による検証とは扱えません。',
'',
'変化局面組は、定跡の6手目終了時点の25局面をSFEN順に並べ、等間隔で10局面を結果を見る前に選択しました。双方に同じ6手を与えてから先後交換で対戦しています。定跡の対象局面で効果を調べる補助実験であり、人間が自由に指す序盤の分布を再現してはいません。',
'',
'これは1手100msの短時間比較です。定跡の生成は1局面200msだったため、長い持ち時間では効果が変わる可能性があります。今回の結果からレーティング差や長時間対局での優劣は断定しません。結果を見たあとに定跡・評価関数を調整して再測定することはしていません。',
'',
'## 記録と再実行',
'',
'- [初期局面20局：全棋譜・着手別探索統計](book-vs-no-book-initial.json)',
'- [変化局面20局：全棋譜・着手別探索統計](book-vs-no-book-varied.json)',
'- [対局スクリプト](../scripts/compare-recovery-book.ts)',
'- [集計スクリプト](../scripts/summarize-recovery-book.cjs)',
'',
'評価関数・定跡・実行ファイルと比較用ソースのSHA256はJSON内に保存しています。実行すると同名の結果ファイルを更新します。',
'',
'    node node_modules/tsx/dist/cli.mjs scripts/compare-recovery-book.ts initial',
'    node node_modules/tsx/dist/cli.mjs scripts/compare-recovery-book.ts varied',
'    node scripts/summarize-recovery-book.cjs',
'',
'スマートフォンアプリや既定のCPU設定は今回変更していません。',
''
].join('\n');
fs.writeFileSync(path.join(root,'reports/BOOK_VS_NO_BOOK.md'),contents);
console.log(JSON.stringify({totals,suites:reports.map((r,i)=>({label:labels[i],...r.summary})),unmatchedZeroNodes:unknown,endings}));
