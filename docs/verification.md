# 実装と検証の記録

2026-10-17、Node.js 24.22.0、npm 11.19.1、Python 3.13.14、uv 0.12.2、macOS arm64とDockerで確認した。計画の案2を実装し、もう一方のリポジトリのコードには依存していない。

## 2026-10-18 push・クラウドCI・配置比較

mainへpushし、[GitHub Actions](https://github.com/shimpei1494/tanstack-start-ds-api-demo/actions/runs/39120769177)が成功した。Ubuntu上の型・Lint・format・型エラー検出probe・生成差分・Python検査・実DB/実PythonのVitest・本番ビルド・mock/HTTPのChromium操作と、最後のキャッシュ保存まで確認した。

初回実行は全検査が通ったが、バックグラウンドの`uv run`がキャッシュロックを保持し、setup-uvの後処理だけ失敗した。同期済みvenvのPythonを直接起動し、alwaysの終了stepで停止するよう修正した（85c4dc2）。上記の成功runはその修正後の結果。

[AWS・オンプレの配置比較](aws-deployment.md)を追加した。2026-10-18の公式情報をもとに6案と料金の前提を整理し、計算と資料リンクを確認した。紹介HTMLへも比較を追加し、Chromiumのデスクトップと390px表示を確認した。AWSへのデプロイ、負荷測定、IaCの作成は行っていない。

## 2026-10-18 レポート追加の確認

`/reports`を追加した。Startの単一SQLで同じ時点の集計と未完了TODO最大3件を取得し、必要な入力だけをDSへ渡す。DSのmockとPythonは共通fixtureで通常・3秒待機・3秒後失敗を再現する。DB変更とマイグレーション追加はない。

- Vitest: 実PostgreSQL・実Pythonを含め97件成功（10ファイル）。元のTODO・チャットのテストも含む。
- pytest: 27件成功。入力整合性・安全なエラー・待機・中止・保存済みOpenAPIを確認。
- Chromium: mock11件成功（Python専用2件skip）、HTTP13件成功。レポート用5件は初回待機・結果保持の再取得・初回失敗/再試行/条件変更・再取得失敗・TODO更新後キャッシュ無効化・390px表示・SSR先行配信を確認。
- 通常ブラウザ相当User-AgentでSSRをチャンク単位に読んだ。2.5秒未満で待機HTMLを受け取り、結果は2.8秒以降かつ待機表示より2秒以上後に到着することを確認。
- レポート画面には取得用useEffect・loading専用useStateを追加していない。初回の局所エラー境界、Queryの再試行リセット、キャッシュを残した再取得エラーは別々に検証。
- Oxlintの型検査と依存境界、Oxfmt、Ruff、生成型の差分検査、本番ビルドが成功。デスクトップと390pxの実画面を確認し、正常系のブラウザエラーは0件。

初回SSRのSuspense内で失敗したときはブラウザで再評価されるため、3秒待機を2回経る場合がある。このケースもブラウザで確認済み。Queryのretry:falseとは別のReact SSR回復動作であり、取得が常に一度だけであるとは説明しない。詳しくは[pending.md](pending.md)。

Composeのweb・migration・Pythonを再ビルドし、実コンテナのHTTPモードで初回待機・結果表示・前回結果を残した再集計も確認した。確認後はPython不要のmockモードへ戻す。

以下は初期版（2026-10-17）の記録。

## 実装した範囲

- TODO CRUD、URL絞り込み、PostgreSQL永続化、Drizzleの生成SQLとsnapshot、再実行できるseed。
- Startの入口、業務サービス、repository、外部クライアント、公開DTO、依存の組み立てを分離。
- 目的からの候補提案、取得時は保存せず利用者が個別採用。
- DS_MODEによるmock / 実Python HTTPの交換。PythonにDBの接続情報を渡さない。
- SDKによる会話状態、実際のSSE途中表示、工程、停止、再生成、リセット、失敗表示。
- OpenAPIとTS型の生成・差分検査、共通fixture、契約テスト。
- Docker Composeのmock / HTTP起動、CI、引き継ぎ文書、実画面を使った紹介HTML。

## 確認結果

| 確認                           | 結果・範囲                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Oxlint type-aware / type-check | 成功。アプリ、共有package、生成型、テストを含む                                                                |
| 型エラー検出probe              | 6領域すべてで意図的エラーを検出。一時ファイルはfinallyで削除                                                   |
| 依存境界                       | 成功。画面からDB/DS実装、servicesからDrizzle/HTTP等の参照を検出                                                |
| Start import protection        | DBとDSクライアントをclientで禁止。公開bundleにDB接続やpg等の実装がないことも検索確認                           |
| Oxfmt / Ruff                   | 成功                                                                                                           |
| Vitest                         | 実PostgreSQL・実Pythonを含め55件成功（8ファイル）                                                              |
| pytest                         | 12件成功。保存済みOpenAPIとの一致も検証                                                                        |
| 型生成                         | 専用TypeScript 5.9環境から再生成でき、保存済みTSと一致                                                         |
| mockのChromium                 | CRUD、永続化、絞り込み、個別採用、AIエラー、部分配信、停止、再生成、リセット、モバイル                         |
| HTTPのChromium                 | 同じ操作に加え、browser → Start → HTTP → Python生成器の停止・ページ離脱を検証                                  |
| 本番ビルド                     | Vite / Start / NitroのNodeサーバーで成功                                                                       |
| Docker                         | npm ciからweb・migration・Pythonをビルド、Composeのmock / HTTPを起動。コンテナから候補取得・チャット配信を確認 |

Chromiumの最終実行はmockで6件成功（Python専用の2件はskip）、HTTPで8件成功。開始前エラーと終端なし切断からの会話リセット・回復も確認した。

Vitestは入力と応答の上限、mock / HTTPの同じ結果、エラー分類、通常・途中失敗・不正応答・切断・中止を扱う。実HTTPのテストサーバーでは日本語UTF-8の1 byte分割、CRLF、複数行data、不正JSON、ID・順序不正、終端のない切断、タイムアウト、AbortSignalとiterator.returnによるソケット切断も確認した。

Pythonの停止テストは本番の生成器をテスト専用プロセスで包み、5秒待機の終了前に停止操作とページ離脱でfinallyが実行されることを確認する。2秒未満を合格条件とし、正常終了イベントが出ていないことを確認する。計測用endpointは本番の起動moduleへ追加していない。同期推論やGPU処理まで停止できることを示すテストではない。

Composeのhttp環境でDSコンテナを停止し、AIの候補取得だけがエラーになること、同じ画面から通常のTODO追加・削除が成功することも確認した。検証用に作ったTODOは完全一致で削除し、最後は既定ポート3001のmock環境へ戻した。

## 採用版と計画からの調整

主要バージョンはlockfileを正とする。Start 1.169.3、Router 1.170.45、Query 5.104.3、Form 1.33.5、React 19.3.1、TypeScript 7.0.2、AG-UI JavaScript 1.0.3、Python ag-ui-protocol 0.1.22、TanStack AI 0.69.0 / ai-react 0.30.4 / ai-client 0.39.3で組合せを確認した。

- Startの採用版は`createServerFn().validator()`。計画時の古いinputValidatorというAPI名に依存しない。
- useChatのfetcherからServer Functionを呼び、SSE Responseを返す方式で必要な配信と中止を確認できたため、Server Routeの代替版を二重実装しなかった。
- openapi-typescriptの旧compiler APIがTypeScript 7で動かないことを確認した。生成専用依存を独立したtools/openapi-codegenへ隔離し、アプリの検証は7のままにした。
- Base UIを使う小さなアプリ内UI primitiveを作成。shadcn CLIでの生成は行っていない。共有UI状態が不要なためJotaiも追加していない。
- Node用出力はNitro 3.0.260903-betaを固定して検証。公開環境や他の配備先は別途評価する。
- Drizzle Kitの開発依存に含まれる古いesbuildはoverrideで修正版へ固定した。確認時のnpm auditは0件。
- ポートは別デモとの同時利用のためweb3001、DS8001、DB5434。検証時はweb3101 / Compose3201も使用した。

## 残している追加段階

認証・権限、複数利用者、実モデル、チャット永続化、ツール実行、途中再開、長時間ジョブ、運用監視は初期デモの対象外。プロキシ越しのバッファリングや負荷試験も実施していない。

本番ビルドには第三者依存内のuse client directiveに関するNitro / Rolldownの警告が出るが、ビルドとSSR / hydration / ブラウザ操作は成功している。pytestはStarlette TestClientのhttpx非推奨警告が1件あり、現時点のテストは成功している。

計画にある「初めて触る別の開発者による小変更」の体験評価は未実施。変更箇所と手順はarchitecture.mdとds-handoff.mdへ記録した。初期版の表はローカル結果であり、クラウドCIの結果は冒頭の2026-10-18の記録を参照。
