# 玉回収ルールの専用定跡

対象: 両者が味方を回収でき、玉も味方・相手を取れる。Háo評価関数。片側回収・回収なし・玉が何も取れない設定には使わない。

## 再生成

1. `modules/meguru-engine/cpp` をAndroid NDKでCMake構成し、`-DMEGURU_CLI=ON` で `meguru_book_research` と `meguru_cli` をビルドする。既存の構成は `.tools/m-x64`。
2. PCのAndroidエミュレーター `emulator-5580` の `/data/local/tmp/meguru-king-all` に research実行ファイルと `libc++_shared.so`、`hao/nn.bin` を配置する。評価関数のSHA256はモジュールのengine-manifest.jsonに一致させる。
3. `npx tsx scripts/build-king-recovery-book.ts`。初期局面MultiPV12を15秒探索し、候補の次局面を各3秒で再評価。合法な玉の移動も初手候補として再評価する。上位との差150cp以内から最大8手を選ぶ。続く2手は100cp以内で2候補、以降は最善候補で24手まで作成する。各局面MultiPV3、序盤2秒・以降0.8秒、4プロセス。
4. `npx tsx scripts/validate-king-recovery-book.ts` で全局面の合法手一覧と登録手の移動後の盤面をJSエンジンと照合する。
5. `node scripts/update-king-recovery-book.cjs` がルール・モデル・SHA256を確認してアプリへコピーする。
6. `node scripts/validate-king-book-native.cjs` でスマホ用C APIの全局面定跡採用と240回の初手選択を確認する。`npx tsx scripts/check-king-book-selfplay.ts` で24手の定跡から探索へ移ることを確認する。

生成用USIは起動時にルール情報のprobeを必須とし、旧Windowsエンジンを誤って使用できないようにしている。

## 配布

- 玉回収あり: `modules/meguru-engine/assets/king_recovery_book.db`（native flags 7）
- 玉回収なし: `modules/meguru-engine/assets/user_book1.db`（native flags 3）

Android/iOSは両ファイルを同梱し、C++側でルールからファイル名を選ぶ。ファイル名はエンジンのBookFile選択肢にも登録が必要。片側回収・回収なしは定跡を禁止する。定跡切替では異なるルールの探索キャッシュをリセットする。

## 限界

通常将棋で学習したHáoを、独自ルール対応の探索で使用している。時間制限付き探索による候補であり、隣接深さのMultiPVが含まれうる。評価値は勝率ではなく、棋力向上は未測定。定跡は登録した応手から外れた場合、および24手を過ぎた場合に通常探索へ戻る。
