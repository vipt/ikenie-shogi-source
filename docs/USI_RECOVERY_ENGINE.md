# 自駒回収対応エンジン

やねうら王 V9.00を改造した **MeguruShogi-Recovery-1** を、このPCで動かせるようにしました。学習済み評価関数は Háo 2023-05-08（NNUE halfkp_256x2_32_32、FV_SCALE=20）です。

## 対応したルール

- 先後とも、玉以外の駒は味方の駒を取って自分の持ち駒にできます。
- **玉は味方の駒を取れません。相手の駒は取れます。**
- どちらの玉も取れません。回収した成駒は元に戻ります。
- 二歩、行き所のない駒、王手放置、打ち歩詰め、千日手・連続王手の扱いを維持しています。
- 入玉宣言はアプリと合わせて無効です。

回収ルール専用のビルドです。通常ルール用の公式実行ファイルは別に保存しています。接続側でルールとエンジン識別名を確認し、違う組み合わせを拒否します。

## 変更内容

[パッチスクリプト](../scripts/patch-recovery-engine.cjs)で、公式アーカイブから別ディレクトリに展開したソースへ変更を適用します。完全な改造ソースは .tools/engines/meguru-v1/source にあります。

- 合法手生成・疑似合法手判定に回収を追加し、玉の回収と玉の捕獲を禁止。
- 回収は探索の「敵駒を取る手」には分類せず、通常の手として探索。候補数増加に合わせて手のバッファを拡大。
- 駒価値とSEE（交換の損得見積もり）を修正。回収を敵駒の獲得として加算せず、成駒の降格による価値低下を反映。
- 既存の盤面・持ち駒・NNUE特徴量の更新処理を利用し、差分評価と全再計算の一致を実測。
- 通常ルール専用の高速詰み判定・専用詰み探索と評価ハッシュは無効化。一般の探索と合法手で詰みを判定。
- meguru_probe 診断コマンドで、全合法手、着手後SFEN、評価差分・ハッシュ・駒価値・王手状態・巻き戻しを検査。

既定の比較基準にはHáoの元の重みを保持しています。別ファイルで、回収ルールによる追加学習済み評価関数と専用定跡を作成しました。[追加学習と専用定跡の記録](RECOVERY_TRAINING.md)を参照してください。

## 実行

保存先は C:\Users\motok\projects\shogi。OneDriveは使用していません。

    Set-Location C:\Users\motok\projects\shogi

    # 約240局面の照合と、最大256手・1局の自己対局
    node node_modules/tsx/dist/cli.mjs scripts/validate-recovery-engine.ts

    # ソースから再ビルド（PowerShell 7、既定で2並列）
    .\scripts\Build-RecoveryEngine.ps1

    # 通常ルール版も利用可能
    node node_modules/tsx/dist/cli.mjs scripts/usi-standard.ts --mode smoke

npmがPATHにある環境では npm run engine:recovery:build と npm run engine:recovery:validate も使用できます。

ビルド時は公式アーカイブのSHA256を照合し、原本からパッチを適用します。[w64devkit 2.11.0](https://github.com/skeeto/w64devkit/releases/tag/v2.11.0) を .tools/toolchains に保存し、GCC 16.2.0を使用します。コンパイラは初回に約68.8 MBを取得し、展開後は約751.5 MBです。システムのPATH設定は変更しません。

生成物とソースのハッシュは .tools/engines/meguru-v1/build-manifest.json に保存します。接続時に実行ファイル・評価関数・パッチ入力のハッシュを照合するため、パッチ変更後は再ビルドが必要です。

検証はCPU 1スレッド・ハッシュ64 MiB、自己対局は1手100ms。Ctrl+Cで停止できます。結果は reports/recovery-engine-validation.json に保存し、再実行時に更新します。

## 検証と適用範囲

[検証記録](../reports/RECOVERY_ENGINE_VALIDATION.md)を参照してください。

当初、改造したWindows実行ファイルはスマートアプリコントロールにブロックされました。その後、ユーザーがOFFにした旨を通知し、Windows上の起動・対局が成功しました。こちらでは保護設定を変更していません。代替検証用に起動したAndroidエミュレーターは終了済みです。実際のスマートフォンは操作していません。

**今回の成果はエンジンとPC上の接続処理です。Android/iOSアプリへの組み込みと新しいAPK等の配布はまだ行っていません。** 配布済みアプリは従来のTypeScript製CPUです。Android x86_64向けクロスビルドも成功しましたが、その実行確認は今回の成果に含めていません。

## 出典・ライセンス

- [やねうら王 V9.00公式リリース](https://github.com/yaneurao/YaneuraOu/releases/tag/V9.00)
- [Háo公式リリース](https://github.com/nodchip/tanuki-/releases/tag/tanuki-.halfkp_256x2-32-32.2023-05-08)
- 改造元はGPL v3です。[ライセンス本文](../engine/COPYING)と元のソースを含む公式アーカイブを保存しています。
- 評価関数に同梱された gpl-3.0.txt も保存しています。
- パッチスクリプトと追加C++診断コードは scripts/patch-recovery-engine.cjs と engine/meguru_probe.h。アプリへ配布する段階では対応ソースとライセンス表示を含む構成にします。


