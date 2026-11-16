# 通常将棋エンジンの導入（第1段階）

2026-11-14に、このPCで既存エンジンと学習済み評価関数の接続・対局を確認しました。作業場所は `C:\Users\motok\projects\shogi`。OneDriveは使用していません。

## 導入したもの

| 項目 | 内容 |
| --- | --- |
| 探索エンジン | [やねうら王 V9.00 GitHub版](https://github.com/yaneurao/YaneuraOu/releases/tag/V9.00)、Windows x64 AVX2 |
| 評価関数 | [Háo / tanuki-.halfkp_256x2-32-32.2023-05-08](https://github.com/nodchip/tanuki-/releases/tag/tanuki-.halfkp_256x2-32-32.2023-05-08) |
| 評価形式 | NNUE halfkp_256x2_32_32、作者推奨の FV_SCALE=20 |
| 使用資源 | Threads=1、USI_Hash=64 MiB、GPU不要、相手手番中の先読みなし |
| 定跡 | 無効。学習済み評価関数と探索の動作を検証 |
| 対応ルール | selfCapture=none、kingCapture=enemy（通常将棋） |
| 入玉 | アプリ側に宣言勝ち判定がないため、EnteringKingRule=NoEnteringKing |
| 対局上限 | 自己対局コマンドは既定で256手。上限到達は詰みと区別して記録 |

エンジンは未改造の公式実行ファイルです。学習も新規に実行せず、公開済みの評価関数を使用します。バージョン、取得URL、アーカイブと展開後ファイルのSHA256は [usi-engine-lock.json](../scripts/usi-engine-lock.json) に固定しています。評価関数は約64.2 MB、今回保存したアーカイブ・ソースを含む全体は約108.3 MBです。

## コマンド

PowerShell 7、Node.js、プロジェクトの依存関係が必要です。このPCには導入済みです。再取得時には7-ZipとAVX2/BMI2対応のWindows x64が必要です。

```powershell
Set-Location C:\Users\motok\projects\shogi

# 再インストール時のみ。既存ファイルのハッシュも検証する
.\scripts\Install-UsiEngine.ps1

# 4つの局面で動作確認（初期局面・後手番・角交換と駒打ちの履歴・金打ちの一手詰め）
node node_modules/tsx/dist/cli.mjs scripts/usi-standard.ts --mode smoke

# 1局だけ通常将棋で自己対局。最大256手、1手100ms
node node_modules/tsx/dist/cli.mjs scripts/usi-standard.ts --mode selfplay --movetime 100 --max-plies 256
```

npmがPATHにある環境では `npm run engine:install`、`npm run engine:smoke`、`npm run engine:selfplay` も使用できます。レポートはそれぞれ `reports/usi-smoke.json` と `reports/usi-selfplay.json` に保存します。同じコマンドを再実行すると、そのレポートを更新します。Ctrl+Cで停止できます。

初回のファイル検証・評価関数読み込みは持ち時間とは別です。検索後の終了処理、エラー時・応答タイムアウト時の子プロセス停止を実装しています。Windowsの保護設定の変更やブロック解除は行っていません。

## 接続処理

- `scripts/lib/usi-format.ts`: アプリの盤面・持ち駒・成り・先後をSFENへ変換し、移動・駒打ちをUSI形式へ相互変換。
- `scripts/lib/usi-engine.ts`: プロセス起動、USIハンドシェイク、評価関数読み込み待ち、時間制限つき探索、終了処理。
- `scripts/lib/installed-usi.ts`: 固定した実行ファイルと評価関数のハッシュを照合して起動。
- `scripts/usi-standard.ts`: 局面テストと通常ルールの自己対局、棋譜・探索情報・通信ログの保存。

毎回、開始局面と全指し手をエンジンへ渡すため、千日手の履歴を失いません。返された指し手はアプリの合法手と照合し、実際の着手も `play()` を通します。回収ありのルールや玉の駒取り制限が違うルールは接続前に拒否します。玉の欠落、直前の手番側が王手を放置した不正な局面も送信前に拒否します。

実装はNode.js用です。Expoの画面やスマートフォンのCPUにはまだ接続していません。Android/iOSの配布済みアプリは従来のTypeScript製CPUのままです。

## 検証結果

[詳細記録](../reports/USI_ENGINE_VALIDATION.md) を参照してください。通常ルールでの動作確認段階であり、棋力レーティングや先後の公平性を測定したものではありません。

次の段階は、回収ルールに対応するエンジン改造とその合法手・評価更新の検証です。その後、スマートフォン向けの組み込みと実機負荷の調整が必要です。通常将棋の学習済み評価関数が回収ルールでどこまで有効かは、別途測定します。

## 出典とライセンス

- [USI/SFENの仕様（将棋所）](https://shogidokoro2.stars.ne.jp/usi.html)
- [やねうら王の導入手順](https://github.com/yaneurao/YaneuraOu/wiki/やねうら王のインストール手順)
- [やねうら王 LICENSE](https://github.com/yaneurao/YaneuraOu/blob/master/LICENSE): GPL v3。公式配布アーカイブ内のソースもローカルに保存。
- Háoの配布アーカイブには `gpl-3.0.txt` が同梱されており、そのまま保存。`FV_SCALE=20` は上記公式リリースの推奨値。

今回の実行ファイル・評価関数は `.tools/engines` に保存し、GitおよびEASアップロード対象から除外しています。将来、改造エンジンや評価関数をアプリと一緒に配布する段階では、対応ソースとライセンス表示を含む配布構成を用意します。


## 第2段階の完了

自駒回収ルールに対応する改造版を別途ビルドしました。玉は味方の駒を取れない設定です。現在の構成と検証結果は[回収対応エンジン](USI_RECOVERY_ENGINE.md)を参照してください。通常版の実行ファイルとコマンドも引き続き使用できます。
