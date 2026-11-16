# めぐる将棋 v1.1.0 ビルド検証記録

確認日：2026年11月14日（日本時間）。

## Android

- [クラウドビルド](https://expo.dev/accounts/motokit/projects/meguru-shogi/builds/c88f89b6-a53c-4b38-8c1f-ba6240c1f82e)：FINISHED。
- [署名済みAPK](https://expo.dev/artifacts/eas/NVfidiA9a3iZQfsyuOAhucdOmSBXFBWiWfqbjSkn67k.apk)。アプリID `com.megurushogi.app`、versionCode 2。
- ローカル保存先：`artifacts/meguru-shogi-android.apk`。
- SHA-256：`55D6719E896BF8098854EDD90BC3F05E19E4FC2B3AF93C189CA9A97026E9FF9F`。
- Android 17 / Pixel_10a エミュレーターへインストール。Wi-Fiとモバイル通信を無効化して検証。
- 81個のマスがすべて見え、9行それぞれが9マスで同じ高さに並ぶことをUI階層とスクリーンショットで確認。
- 味方の歩を飛車で回収、持ち駒への追加、CPUの応手を確認。
- 更新後のCPUが「強め」と表示されることを確認。
- アプリを強制終了して再起動し、保存した局面が復元されることを確認。
- 「待った」で自分とCPUの2手が戻り、盤上の駒と持ち駒が復元されることを確認。
- テスト中にネイティブまたはJavaScriptのクラッシュなし。
- 再現スクリプト：`node scripts/check-android.cjs artifacts/meguru-shogi-android.apk`。対象は `emulator-5580` のみ。物理端末には操作しない。
- スクリーンショット：`artifacts/screenshots/android-initial.png`、`android-selected.png`、`android-after-cpu.png`。

最初のv1.0.0はAndroidの画素丸めによって盤の列が折り返される表示不具合がありました。v1.0.1では9行を明示して各行に9マスを配置し、折り返しを廃止しました。旧版の成果物は `artifacts/previous-builds/` に分離しています。

## iOS

- [クラウドビルド](https://expo.dev/accounts/motokit/projects/meguru-shogi/builds/dddeacc9-4a17-4ff9-85b6-cf66815184ef)：FINISHED。
- [シミュレーター用アーカイブ](https://expo.dev/artifacts/eas/Q_jnhAK6VhfsHcOFdsLmjDEnOey54dZXe_JtX_VVtOQ.tar.gz)。
- ローカル保存先：`artifacts/meguru-shogi-ios-simulator.tar.gz`。
- SHA-256：`69D5C411136E39AA1FB66B422756C3FA59B4B762ED6165B900B27C47099707F6`。
- Xcodeによるコンパイル成功と、アーカイブ内の `.app` を確認。
- MacのiOSシミュレーター用。iPhone実機向けの署名済みIPAではない。
- iOSでの実行・操作確認は未実施。iPhone向け配布には別途Appleの署名設定が必要。

## 共通

- TypeScript型チェック成功。
- ルール・CPU戦術・探索中止・保存復元テスト37件成功。
- Webの本番バンドル成功。
- Chrome上で回収、駒打ち、玉の制限、CPU強さ選択・応手、思考中の待った、保存再開、ルール説明、投了を確認。
- 320px／390px画面で横方向のはみ出しなし。
- 新旧CPU20局比較：新CPU20勝、旧CPU0勝。条件は `CPU_STRENGTH.md`。
- 新CPU同士はユーザーの指示で50局で終了。先手20勝・後手29勝・引き分け1局。先後合計の回収平均14.88回。全棋譜を再生して照合済み。条件と途中終了による限界は `SELF_PLAY_STRONG_50.md`。
- 旧CPU同士1,000局：先手472勝、後手519勝、引き分け9局。詳細は `SELF_PLAY.md`。
- Windowsの保護設定は変更していない。Expoの有料プラン契約、ストア登録・公開は行っていない。

クラウドの依存関係インストールでnpm 12とnpm 10の解決差が発生したため、ロックファイルをnpm 10.9.9で生成し、`npm ci --dry-run`で検証。EAS環境のNodeは22.23.2に固定しています。
