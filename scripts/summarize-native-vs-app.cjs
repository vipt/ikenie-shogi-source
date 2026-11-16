const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root,'reports',name),'utf8'));
const short = read('native-vs-app-short.json'), app = read('native-vs-app-app.json');
assert.ok(short.complete && app.complete, 'Wait until both match suites complete');
assert.equal(short.results.length,40);
assert.equal(app.results.length,4);
for (const report of [short,app]) {
  assert.ok(report.results.every(r=>r.replayVerified));
  for (const s of report.summary) {
    const games = report.results.filter(r=>r.profile===s.profile);
    assert.equal(s.wins,games.filter(r=>r.result.winner===r.nativeSide).length);
    assert.equal(s.draws,games.filter(r=>r.result.winner===null).length);
    assert.equal(s.games,s.wins+s.losses+s.draws);
    for(let i=0;i<games.length;i+=2){
      assert.equal(games[i].nativeSide,'sente');
      assert.equal(games[i+1].nativeSide,'gote');
      assert.equal(games[i].startSfen,games[i+1].startSfen);
      assert.deepEqual(games[i].opening,games[i+1].opening);
    }
  }
}
for(let i=0;i<20;i++)assert.equal(short.results[i].startSfen,short.results[i+20].startSfen);
const rows=[...short.summary.map(s=>({s,time:100})),...app.summary.map(s=>({s,time:2400}))];
const label=s=>s.profile==='hao'?'改造やねうら王＋元のHáo':'改造やねうら王＋追加学習済みHáo';
const pct=n=>(n*100).toFixed(0)+'%';
const table=rows.map(({s,time})=>'| '+[label(s),time+'ms',s.wins,s.losses,s.draws,pct(s.winRate),s.sente.wins+'/'+(s.games/2),s.gote.wins+'/'+(s.games/2)].join(' | ')+' |').join('\n');
const timings=rows.map(({s,time})=>'| '+[label(s),time+'ms',s.native.averageElapsedMs.toFixed(1)+'ms',s.oldApp.averageElapsedMs.toFixed(1)+'ms',s.oldApp.zeroCompletedDepthMoves+'/'+s.oldApp.moves,s.averagePlies.toFixed(1)].join(' | ')+' |').join('\n');
const ends={};
for(const r of [...short.results,...app.results])ends[r.result.reason]=(ends[r.result.reason]??0)+1;
const full=app.results.map(r=>'| '+[r.pair===0?'初期局面':'教材棋譜9の8手目終了局面',r.nativeSide==='sente'?'先手':'後手',r.points===1?'新エンジン勝ち':r.points===0?'旧CPU勝ち':'引き分け',r.plies,r.result.reason].join(' | ')+' |').join('\n');
const text=[
'# 旧アプリCPUと改造やねうら王の比較',
'',
'2026-11-14、C:\\Users\\motok\\projects\\shogi にて、このPC上で44局を実行。OneDrive・クラウドは使用していません。',
'',
'比較対象は配布アプリの「強め」に使っている独自TypeScript CPU（src/game/cpu-search.ts）です。最初期の入門用CPU（cpu-legacy.ts）ではありません。新エンジンは自駒回収対応のMeguruShogi-Recovery-1。前回の「9勝11敗」は新エンジン同士で評価関数を比較した別実験です。',
'',
'## 結果',
'',
'すべて新エンジン側から見た成績です。',
'',
'| 新エンジンの評価関数 | 双方の1手上限 | 勝ち | 負け | 引き分け | 勝率 | 先手時の勝ち/局数 | 後手時の勝ち/局数 |',
'| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
table,
'',
'今回の条件では旧CPUに対して新エンジンが大きく優勢でした。追加学習前のHáoでも優勢なため、追加学習だけによる効果とは解釈できません。全勝という結果から正確なレーティング差や「何倍強いか」は計算できません。短時間比較20局は10種類の開始局面を先後交換した対であり、独立した20種類の局面ではありません。2.4秒の確認も4局に限られます。',
'',
'## 条件',
'',
'- 先後とも自駒回収可能。玉は味方の駒を取れず、相手の駒は取れます。二歩・王手放置・打ち歩詰め・千日手等はアプリの判定を使用。',
'- 定跡は双方無効。新エンジンは1スレッド、ハッシュ64MiB、入玉宣言なし。',
'- 旧CPUは「強め」の最大深さ7、最大32,000ノードを維持。短時間比較のみ時間上限を100msに変更。2.4秒比較では「強め」の元の上限をすべて使用。',
'- 同じ時間上限は同じ探索量を意味しません。処理速度・探索方法・評価関数の差も含む、CPU全体の比較です。',
'- 初期局面と、学習に使っていない教材棋譜9,19,...,89の最初の8手を開始局面に採用。同じ10局面を各評価関数・先後で共有。2.4秒比較は初期局面と棋譜9の開始局面で先後交換。',
'- 開始局面は結果を見る前に固定。教材生成エンジン由来の局面のため、人間のあらゆる指し方を代表するものではありません。',
'- 最大256手。上限到達は引き分け。評価値だけで勝敗を打ち切らず、詰み等の実際の終局まで対局。',
'- アプリと同じ探索処理をPCのNode.jsで同期実行。実機の処理速度や画面描画の待ち時間は再現していません。',
'- 短時間組と2.4秒組を並行実行。各組では1手ずつ探索し、最大2つの探索が同時に動く構成。',
'',
'終局理由の内訳：'+JSON.stringify(ends)+'。全44局の棋譜をアプリのルール処理で再生し、最終盤面と終局結果を照合しました。',
'',
'## 実測時間と補足',
'',
'| 新エンジンの評価関数 | 1手上限 | 新・平均思考時間 | 旧・平均思考時間 | 旧・深さ1も完了しなかった手数 | 平均終局手数 |',
'| --- | ---: | ---: | ---: | ---: | ---: |',
timings,
'',
'平均時間は指定した開始局面より後の着手のみ。終局手数には与えた8手の序盤を含みます。旧CPUはノード数・深さの上限でも終了するため、2.4秒を使い切らない手があります。停止時間の確認間隔などにより実時間が指定をわずかに超える手もあります。探索深さやノード数はアルゴリズムが異なるため、倍率を棋力の倍率としては扱っていません。',
'',
'2.4秒比較の全結果：',
'',
'| 開始局面 | 新エンジンの手番 | 結果 | 終局手数 | 終局理由 |',
'| --- | --- | --- | ---: | --- |',
full,
'',
'## 棋譜と再現',
'',
'- [短時間40局の全棋譜・着手別探索統計](native-vs-app-short.json)',
'- [2.4秒4局の全棋譜・着手別探索統計](native-vs-app-app.json)',
'- [比較スクリプト](../scripts/compare-native-vs-app.ts)',
'',
'各JSONには実行ファイル・評価関数・旧CPUソースのSHA256、設定、全USI指し手列を保存しています。時間制限付き探索なので、再実行時はPCの負荷などにより棋譜が変わる場合があります。同名の結果ファイルを更新します。',
'',
'    node node_modules/tsx/dist/cli.mjs scripts/compare-native-vs-app.ts short',
'    node node_modules/tsx/dist/cli.mjs scripts/compare-native-vs-app.ts app',
'    node scripts/summarize-native-vs-app.cjs',
'',
'今回の作業は比較対局です。配布済みスマホアプリのCPUやAPKは更新していません。',
''
].join('\n');
fs.writeFileSync(path.join(root,'reports/NATIVE_VS_APP.md'),text);
console.log(JSON.stringify({verifiedGames:44,results:rows.map(({s,time})=>({profile:s.profile,time,wins:s.wins,losses:s.losses,draws:s.draws})),endings:ends}));
