# 自駒回収ルールの追加学習と専用定跡（初版）

2026-11-14、このPC上で学習・生成・検証を実施。保存先は C:\Users\motok\projects\shogi。OneDrive・クラウド学習は使用していません。

**追加学習済み評価関数と専用定跡は作成済みですが、棋力向上は確認できていません。** 学習前との比較は9勝11敗（20局、勝率45%）でした。既定の評価関数は元のHáoを維持し、今回の成果は明示的に選ぶ実験版としています。スマホ版1.2.0では、評価関数の選択と専用定跡の切り替えを追加しました。既定は元のHáo・定跡なしです。

## ルールと成果物

先後とも自駒回収可能、玉は味方の駒を取れず相手の駒は取れます。玉の捕獲は禁止。成駒の回収時は元に戻り、二歩・王手放置・打ち歩詰め・千日手等は既存実装に従います。

- 学習済み評価関数：[nn.bin](../artifacts/engines/recovery-v1/eval/nn.bin)（64,217,066 bytes）
- 専用定跡：[user_book1.db](../artifacts/engines/recovery-v1/book/user_book1.db)
- 学習条件・損失：[training-manifest.json](../artifacts/engines/recovery-v1/training-manifest.json)
- 全定跡の局面・棋譜：[book-manifest.json](../artifacts/engines/recovery-v1/book-manifest.json)
- 比較対局20局の全棋譜：[recovery-training-match.json](../reports/recovery-training-match.json)
- ネイティブ検証：[recovery-profile-validation.json](../reports/recovery-profile-validation.json)

評価関数SHA256：fff2b55c373bf1d3bc2fb10d99ea4161329c3eedb566fa0dfc2c13c1450a266e

定跡SHA256：a54ecd5a8fe876a565d9ad87e440da6196bf2346fe0f1c8408542890c6afdd14

## 実施した追加学習

改造やねうら王＋Háoによる独自ルールの自己対局256局から、10,879局面を収集しました。1手20ms、MultiPV 4、最大160手、2エンジン各1スレッドで生成。序盤には探索候補からの選択と一部のランダム合法手を加えています。自己対局中の自駒回収は先後合計2,926回でした。

棋譜単位で206局を学習、25局をモデル選択、25局を最終評価に分離。SFENの手数部分を除いて重複局面を除去し、最終評価を優先して各集合間の重複も排除しました。

| 用途 | 局面数 |
| --- | ---: |
| 学習 | 8,196 |
| モデル選択 | 971 |
| 最終評価 | 1,032 |
| 除去した重複 | 680 |

教師は「探索評価をsigmoid(cp/600)に変換した値90%＋実際の終局結果10%」。手数上限に達した棋譜では勝敗を捏造せず、探索評価だけを使用します。詰みスコア・探索値の上下限・絶対値2,200cp以上は教材から除外しました。

**全NNUEの再学習ではありません。** HáoのHalfKP特徴変換層を固定し、後段の全結合3層（17,505パラメータ）をNumPyで追加学習しました。量子化を反映した順伝播、STEによる勾配近似、Adam、元の重みからの変更幅制限を使用。20エポック、バッチ256、乱数シード20261114で学習し、モデル選択用データの損失が最小だった5エポック目を採用。量子化後に4,016パラメータが変わっています。元のHáoファイルは保持しています。

| 最終評価1,032局面 | 学習前 | 学習後 |
| --- | ---: | ---: |
| 教師確率に対するRMSE | 0.188929 | 0.170863 |
| 交差エントロピー | 0.615102 | 0.590263 |

RMSEは約9.6%低下しました。ただし短時間探索で作った教師への適合を測った値であり、勝率・レーティングの改善を意味しません。

## 専用定跡

追加学習モデルで初期局面から探索し、**466局面、最大24手目まで**の定跡を作成しました。通常将棋の定跡をそのまま転用していません。

- 各局面200ms、MultiPV 2。
- 最初の6手は最善評価との差150cp以内の上位2候補を分岐。その後は最善手で延長。
- 各局面に指す手を1つ保存。うち135局面で自駒回収を選択。
- 初手の登録手は「2h2g」（飛車で自分の歩を回収）。この条件での探索結果であり、最善性が証明された手ではありません。
- 探索由来の試作定跡であり、長時間探索・多数の対局による優劣検証は未実施。
- 登録外の局面では追加学習済みモデルで通常探索します。

## 検証結果

- 元のモデルの10,199局面で、Pythonの整数評価とネイティブエンジンの出力が完全一致。
- 保存した学習済みモデルを読み直し、未学習32局面の出力がPythonの量子化後の出力と完全一致。
- 学習済みモデルで4,463着手（うち自駒回収283手）の差分評価・全再計算・巻き戻し等が一致。
- 定跡の全466局面について棋譜から再現し、指し手・読み筋の次の手が独自ルール上合法。
- 実エンジンでも全466局面で登録手を選択し、探索ノード数0で定跡読み込みを確認。
- 自動テスト53件成功、TypeScript型検査成功。

## 学習前との20局比較

定跡を双方無効にし、評価関数の差だけを比較しました。同じ改造エンジン、1手100ms、1スレッド、ハッシュ64MiB、最大256手。最終評価用棋譜のうち10局の最初の8手を開始局面とし、各局面で先後を入れ替えて2局ずつ対戦しました。全棋譜をルール実装で再生して合法性を確認しています。

**追加学習版：9勝11敗、引き分け0、勝率45%。**

20局だけでは改善とも悪化とも断定できず、レーティング換算もしていません。教材の誤差は減ったものの、採用を裏づける棋力向上は得られませんでした。今回の結果を受けて同じテスト結果へ合わせ込む調整は行っていません。

次回は探索時間を増やした教師局面と中終盤・回収後の局面を増やし、新しい未使用の開始局面で比較する方針です。定跡の効果は、評価関数の比較とは別に定跡あり／なしで測る必要があります。

## 実行と再現

現環境では以下で実験版を使用できます。引数なしは初期局面、引数は初期局面からのUSI指し手列です。

    Set-Location C:\Users\motok\projects\shogi
    node node_modules/tsx/dist/cli.mjs scripts/use-trained-recovery.ts
    node node_modules/tsx/dist/cli.mjs scripts/use-trained-recovery.ts 2h2g 8b8c
    node node_modules/tsx/dist/cli.mjs scripts/validate-recovery-profile.ts

npmがPATHにある環境では、それぞれ npm run engine:trained、npm run engine:trained:validate が使えます。

学習用Python環境は .tools/training-venv にあります。初めて作成する場合はPython 3.14と scripts/training-requirements.txt（NumPy 2.3.5）を使用します。

    python -m venv .tools/training-venv
    .tools/training-venv/Scripts/python.exe -m pip install -r scripts/training-requirements.txt --cache-dir .tools/pip-cache

再生成は以下の順序です。既存の完成棋譜は再利用します。別条件の実験は元の成果物を保存したうえで出力先を分けてください。再学習・定跡生成・比較は同名の出力を更新します。

    node node_modules/tsx/dist/cli.mjs scripts/generate-recovery-training.ts 256
    .tools/training-venv/Scripts/python.exe scripts/train-recovery-nnue.py
    node node_modules/tsx/dist/cli.mjs scripts/build-recovery-book.ts
    node node_modules/tsx/dist/cli.mjs scripts/validate-recovery-profile.ts
    node node_modules/tsx/dist/cli.mjs scripts/compare-recovery-training.ts

生成棋譜・特徴量は .tools/training/recovery-v1/games。時間制限付き探索なので、PC負荷などにより再生成時の棋譜・定跡は変わり得ます。学習自体は保存教材とシードを使って再実行できます。各コマンドは完了を待って次へ進めてください。

## 出典と適用範囲

[やねうら王V9.00](https://github.com/yaneurao/YaneuraOu/releases/tag/V9.00)と[Háo 2023-05-08](https://github.com/nodchip/tanuki-/releases/tag/tanuki-.halfkp_256x2-32-32.2023-05-08)を基礎としています。[GPLライセンス](../engine/COPYING)を保存し、学習成果物にもコピーしています。

これはWindows PC向けのエンジン用成果物です。スマートフォン内のCPU、APK、iOSビルドは今回更新していません。定跡と評価関数のモデルハッシュ・ルール設定を接続時に照合し、取り違えを拒否します。
