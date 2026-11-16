const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const reports=['hao','trained'].map(p=>JSON.parse(fs.readFileSync(path.join(root,'reports/asymmetric-rules-'+p+'.json'),'utf8')));
const validation=JSON.parse(fs.readFileSync(path.join(root,'reports/asymmetric-engine-validation.json'),'utf8'));
for(const r of reports){
 assert.equal(r.complete,true);assert.equal(r.results.length,20);
 assert.ok(r.results.every(g=>g.replayVerified));
 assert.equal(r.summary.wins,r.results.filter(g=>g.result.winner===g.recoverySide).length);
 assert.equal(r.summary.losses,r.results.filter(g=>g.result.winner!==null&&g.result.winner!==g.recoverySide).length);
 assert.equal(r.summary.standardRules.recoveries,0);
 assert.ok(r.results.every(g=>g.searches.every(m=>!m.recovery||m.recoveryAllowed)));
 for(let i=0;i<20;i+=2){assert.equal(r.results[i].recoverySide,'sente');assert.equal(r.results[i+1].recoverySide,'gote');}
}
assert.equal(reports[0].conditions.evaluationNewSha256,reports[0].conditions.evaluationStandardSha256);
assert.equal(reports[0].conditions.engineSha256,reports[1].conditions.engineSha256);
const labels=['双方とも元のHáo（回収権の差を比較）','新ルール側だけ追加学習済みHáo'];
const pct=n=>(100*n).toFixed(1)+'%';
const row=(r,i)=>'| '+[labels[i],r.summary.wins,r.summary.losses,r.summary.draws,pct(r.summary.winRate),r.summary.sente.wins+'勝'+r.summary.sente.losses+'敗',r.summary.gote.wins+'勝'+r.summary.gote.losses+'敗'].join(' | ')+' |';
const endings={};for(const r of reports)for(const g of r.results)endings[g.result.reason]=(endings[g.result.reason]??0)+1;
const checks=validation.results.reduce((s,r)=>({positions:s.positions+r.positions,transitions:s.transitions+r.transitions,recoveries:s.recoveries+r.recoveries,standardMoves:s.standardMoves+r.standardMoves}),{positions:0,transitions:0,recoveries:0,standardMoves:0});
const text=[
'# 新ルール対通常ルール：片側だけ自駒回収可',
'',
'2026-11-14、このPC上で40局を実施。保存先は C:\\Users\\motok\\projects\\shogi。OneDrive・クラウドは使用していません。',
'',
'## 結果',
'',
'新ルール側だけが自駒を回収でき、通常ルール側は自駒を回収できない非対称対局です。両者とも定跡なし。表は新ルール側から見た成績です。',
'',
'| 比較 | 新ルールの勝ち | 通常ルールの勝ち | 引き分け | 新ルール勝率 | 新ルールが先手（10局） | 新ルールが後手（10局） |',
'| --- | ---: | ---: | ---: | ---: | --- | --- |',
...reports.map(row),
'',
'1行目は双方の評価関数を同じにした比較です。2行目は追加学習版と元のHáoの組み合わせなので、回収権と評価関数の両方が異なります。2種類の結果を混ぜて追加学習の効果を判断することはできません。',
'',
'## 対局条件',
'',
'- 双方の探索エンジンは同じMeguruShogi-Asymmetric-1。先後のどちらに回収権があるかを両エンジンに知らせ、探索の全段階でその制限を適用。',
'- 新ルール側の玉以外の駒だけが味方の駒を取れます。通常側は敵駒だけを取れます。両者の玉は味方の駒を取れず、相手の駒は取れます。どちらの玉も捕獲不可。',
'- 成駒は持ち駒になると元に戻ります。二歩・行き所のない駒・王手放置・打ち歩詰め・千日手・連続王手は既存のアプリ判定に従います。入玉宣言は無効。',
'- 双方1手100ms、1スレッド、ハッシュ64MiB、定跡なし、最大256手。評価値による勝敗の打ち切りなし。手数上限到達は引き分け。',
'- 毎局初期局面から開始。各組で新ルール側の先後を交換し、各評価条件10組20局。毎局プロセスを起動し直し、前局の探索表を引き継がない。',
'- 2種類の比較を並行実行し、全体で最大2探索。',
'',
'終局理由：'+JSON.stringify(endings)+'。通常側の自駒回収は全40局で0回。全棋譜をアプリのルール実装で再生し、終局結果と盤面の一致を確認しました。',
'',
'| 比較 | 新ルール側の平均回収回数/局 | 新・平均思考時間 | 通常・平均思考時間 | 平均終局手数 |',
'| --- | ---: | ---: | ---: | ---: |',
...reports.map((r,i)=>'| '+[labels[i],(r.summary.newRules.recoveries/20).toFixed(2),r.summary.newRules.averageMs.toFixed(1)+'ms',r.summary.standardRules.averageMs.toFixed(1)+'ms',r.summary.averagePlies.toFixed(1)].join(' | ')+' |'),
'',
'## 比較用エンジンを追加した理由',
'',
'通常ルール専用の未改造エンジンは、相手も自駒を取れない前提で読みます。それをそのまま使うと、相手に許された手を読めないことが勝敗へ混ざります。また、既存の回収版は両者が回収できる前提でした。',
'',
'そこで既存の回収版のソースを別ディレクトリにコピーし、回収可能な手番を先手・後手で制限する比較用ビルドを作成しました。通常側も相手の回収手を正しく読むためにこのビルドを使用しています。通常側だけ公式の未改造バイナリを使った比較ではありません。既存の通常版・両側回収版の実行ファイルは保持しています。',
'',
'主な変更は、合法手生成と疑似合法手判定の回収権チェック、起動時の回収側設定、診断結果への回収権出力です。回収側の設定は同じプロセス内で切り替えられないようにし、接続側でもゲームのルールとの一致を確認します。両側回収用の定跡はこのモードでは拒否します。',
'',
'ネイティブとアプリの照合：'+checks.positions+'局面、'+checks.transitions+'着手（回収'+checks.recoveries+'手、通常側'+checks.standardMoves+'手）。合法手集合、着手後の盤面・持ち駒、差分評価と再計算、巻き戻し等が一致。成駒の回収、玉の回収禁止、打ち歩詰め、先後両設定を含みます。自動テスト55件と型検査も成功。',
'',
'## 解釈の範囲',
'',
'ここで測ったのは「自分だけ回収権がある」条件での成績です。両者とも回収できる新ルールの先後バランスや、両者とも通常ルールで対戦したときのレーティングを測ったものではありません。',
'',
'1手100ms・各20局の短時間比較です。すべて初期局面からの反復であり、独立した20種類の序盤による検証ではありません。探索の時間変動によって棋譜は変わり得ます。長い持ち時間や人間相手の勝率、正確なレーティング差はこの結果からは分かりません。',
'',
'## 記録と再現',
'',
'- [同じHáoでの20局・全棋譜](asymmetric-rules-hao.json)',
'- [新ルール側を追加学習版にした20局・全棋譜](asymmetric-rules-trained.json)',
'- [片側ルールのネイティブ検証](asymmetric-engine-validation.json)',
'- [対局スクリプト](../scripts/compare-asymmetric-rules.ts)',
'- [パッチ](../scripts/patch-asymmetric-engine.cjs)・[ビルド手順](../scripts/Build-AsymmetricEngine.ps1)',
'',
'実行ファイル・評価関数・関連ソースのSHA256は各JSONに保存しています。比較用エンジンは .tools/engines/meguru-asymmetric-v1、対応ソースはその source 内にあります。GPLの派生物として[ライセンス](../engine/COPYING)を保持しています。',
'',
'    # 検証済みの回収版を基に、比較用エンジンを再ビルド',
'    .\\scripts\\Build-AsymmetricEngine.ps1',
'    node node_modules/tsx/dist/cli.mjs scripts/validate-asymmetric-engine.ts',
'    node node_modules/tsx/dist/cli.mjs scripts/compare-asymmetric-rules.ts hao',
'    node node_modules/tsx/dist/cli.mjs scripts/compare-asymmetric-rules.ts trained',
'    node scripts/summarize-asymmetric-rules.cjs',
'',
'再実行時は同名の結果ファイルを更新します。スマートフォンアプリのCPUや配布APKは今回更新していません。',
''
].join('\n');
fs.writeFileSync(path.join(root,'reports/ASYMMETRIC_RULES.md'),text);
console.log(JSON.stringify({summaries:reports.map(r=>({profile:r.profile,...r.summary})),validation:checks,endings}));
