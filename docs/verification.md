# 実装と検証の記録

2026-10-17、Node.js 24.22.0、npm 11.19.1、Python 3.13.14、uv 0.12.2、macOS arm64とDockerで確認した。計画の案2を実装し、もう一方のリポジトリのコードには依存していない。

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

計画にある「初めて触る別の開発者による小変更」の体験評価は未実施。変更箇所と手順はarchitecture.mdとds-handoff.mdへ記録した。GitHub Actionsは追加したが、pushしない方針のためクラウド上の実行結果は未確認であり、ここに記載した結果はローカル実行である。
