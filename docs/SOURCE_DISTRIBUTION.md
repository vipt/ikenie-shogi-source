# v1.2.29 に対応するソースとAndroidビルド

対象は生贄将棋 v1.2.29、Android applicationId `net.vipt.ikenie_shogi`、versionCode `32` です。
アプリ本体はGPL v3以降で配布し、GPLの条件に従って複製・改変・再配布できます。無保証です。
GPL本文は [`COPYING`](../COPYING)、変更内容・日付は [`CHANGELOG.md`](../CHANGELOG.md) にあります。

## 入手先と内容

[GitHub Release v1.2.29](https://github.com/vipt/ikenie-shogi-source/releases/tag/v1.2.29) から
`ikenie-shogi-1.2.29-source.zip` をダウンロードしてください。アカウントや追加料金は不要です。
このZIPにはタグ `v1.2.29` のソースと、公開AABに使用した生成済みの `android/` が含まれます。
`SOURCE-MANIFEST.json` にコミット、バージョン、各ファイルのSHA-256を記録します。
リリース添付の `SHA256SUMS.txt` でAABとソースZIPのハッシュを確認できます。

この公開専用リポジトリには配布版のスナップショットの履歴を収録し、非公開の開発履歴は含みません。以前の配布版はそれぞれのタグから取得できます。
タグ `v1.2.29` を `git clone` した場合も、生成済み `android/` が含まれます。
Androidプロジェクトを再生成する場合は、依存関係をインストール後、`npx expo prebuild --platform android --no-install` を実行します。
公開版と同じ生成済み設定を使う場合は、同梱の `android/` を利用してください。

含まれる主なファイル:

- `App.tsx`、`src/`: 画面、将棋ルール、対局・棋譜保存、CPU接続。
- `modules/meguru-engine/cpp/`: 実際にビルドした改造済みやねうら王、モバイル接続、CMake設定。
- `modules/meguru-engine/android/`、`ios/`: Expoモジュールのネイティブ接続。
- `modules/meguru-engine/assets/`: 配布版に使用した評価関数・定跡そのもの。
- `assets/`: アプリの画像と駒音。
- `package-lock.json`、`plugins/`、`scripts/`: 依存関係固定、生成設定、ビルド・検証・研究用スクリプト。

署名秘密鍵、パスワード、ユーザーの棋譜、開発機のキャッシュ・ログは含みません。
一般の利用者は自分の鍵でビルド・インストールできます。公式配布版への上書きには同じ署名が必要なので、
異なる鍵の場合はテスト用パッケージIDを使って並べてインストールしてください。

## 出典とライセンス

- やねうら王 V9.00: https://github.com/yaneurao/YaneuraOu/releases/tag/V9.00 — GPL v3。
  改造済みの全ソースとGPL本文を同梱し、各ソースの既存の著作権表示を保持しています。
- Háo 2023-05-08: https://github.com/nodchip/tanuki-/releases/tag/tanuki-.halfkp_256x2-32-32.2023-05-08 — 配布元のGPL v3に基づく評価関数。
  `hao.nnue` が元の評価関数、`trained.nnue` が追加学習版です。
- 各資産のハッシュは [`engine-manifest.json`](../modules/meguru-engine/engine-manifest.json) にあります。
  `from` は開発時の入手経路の記録です。ビルド時は同梱の `assets/` を使い、そのローカルパスは不要です。
- 追加学習・定跡の説明と生成スクリプトは `docs/RECOVERY_TRAINING.md`、`docs/king-recovery-book.md`、`scripts/` にあります。
  アプリのビルドに再学習や定跡再生成は不要です。
- React Native、Expo等の依存ライブラリは、`npm ci` で取得される各パッケージのライセンスを参照してください。
  `incbin` の個別ライセンスはソース内の `UNLICENSE.txt` に同梱しています。

## ビルド環境

この公開版の確認環境はWindows、OpenJDK 25.0.2、Node.js 24.22.1です。依存関係の管理には `package.json` 指定のnpm 10.9.9を使用します。
Android SDK Platform 37、Build Tools 36.0.0、NDK 28.2.13676358、CMake 3.22.1を用意してください。
Gradle 9.4.1は同梱Wrapperから取得します。minSdk 26、targetSdk 36、ABIはarm64-v8aとx86_64です。
JavaScript依存関係は `package-lock.json` で固定しています。初回は依存関係取得のためネット接続が必要です。
`JAVA_HOME` と `ANDROID_HOME` を各自のJDK・SDKの絶対パスに設定してください。

ソースZIPを展開したルートで実行:

```powershell
npm ci
npm run typecheck
npm test
```

`scripts/prepare-mobile-engine.cjs` は過去のエンジン移植用です。配布ソースには移植済みのコード・資産が
揃っているため、アプリをビルドするために実行する必要はありません。

### 自分の署名鍵でリリースAABを作る

自分のkeystoreと、別々のファイルに保存したキー別名・keystoreパスワード・キーのパスワードを用意します。
秘密ファイルはソースの外に置き、環境変数でファイルの絶対パスを指定します。

```powershell
$env:MEGURU_KEYSTORE = 'C:\my-signing\release.jks'
$env:MEGURU_KEY_ALIAS_FILE = 'C:\my-signing\alias.txt'
$env:MEGURU_STORE_PASSWORD_FILE = 'C:\my-signing\store.pass'
$env:MEGURU_KEY_PASSWORD_FILE = 'C:\my-signing\key.pass'
$env:NODE_ENV = 'production'
Set-Location android
.\gradlew.bat :app:bundleRelease --init-script ..\scripts\release-signing.gradle --console=plain
```

Linux/macOSでは同じ環境変数を設定し、`./gradlew` を使用します。
出力は `android/app/build/outputs/bundle/release/app-release.aab` です。
同じリリース設定でインストール用APKを作る場合は `:app:assembleRelease` を指定してください。
公式版と共存させる場合はGradleに `-PmeguruTestBuild=true` を追加します（ID末尾に `.test` が付きます）。
APKは `adb install` でインストールできます。ビルドに公式の署名秘密鍵は必要ありません。

GitHubリポジトリから新規生成したAndroidプロジェクトの開発ビルドは、`npm run android` でも実行できます。
専用ソースZIPの `android/app/debug.keystore` は秘密鍵除外のため同梱していません。
開発ビルドを使う場合は自分の開発用鍵を同パスに作るか、上記の自分の鍵によるリリースビルドを利用してください。

署名、タイムスタンプ、SDKや依存関係の解決環境により成果物のバイト列は変わります。
公開版AABとの同一SHA-256を保証する手順ではなく、対応するソースを変更・再ビルドするための手順です。
