# TanStack Start × DS API — 余白

TODO管理・目的からのTODO候補提案・ストリーミングチャット・作業レポートを備えた、単一利用者向けのローカルデモです。実AI、APIキー、GPUは不要です。Startが業務データを所有し、DS処理はサーバー内モックと独立Python APIを設定だけで交換できます。

![TODOと候補提案](docs/images/todos.png)

## すぐに体験する（Docker）

Docker Composeだけで起動できます。初回ビルド時にはネットワークが必要です。

```sh
# Pythonなし: web + PostgreSQL + migration
 docker compose up --build -d
```

[画面を開く](http://localhost:3001/todos)。最初は空のTODOから使えます。画面3001、DB5434を使います。既存の別デモと同時起動できるポートにしています。`WEB_PORT`、`DS_PORT`で公開ポートを変更できます。

```sh
# 同じ画面を独立Python APIへ接続（DS APIは8001）
DS_MODE=http docker compose --profile http up --build -d

# mockへ戻す
DS_MODE=mock docker compose up -d web

# 停止。保存したTODOはボリュームに残る
 docker compose --profile http down
```

`DS_MODE=http`ではPython障害を画面へ表示し、mockへ自動で切り替えません。DS停止中も通常のTODO操作は使えます。認証・利用者別権限は未導入で、Composeの公開ポートはlocalhostに限定しています。

## ローカルで開発する

Node.js 24、npm、Dockerを使います。httpモードとPythonの変更にはPython 3.12以上とuvも必要です。

```sh
npm ci
cp .env.example .env
 docker compose up -d db
npm run db:migrate
npm run db:seed  # 任意。再実行しても初期TODOを重複作成しない
npm run dev
```

[http://localhost:3001](http://localhost:3001) を開きます。ルートの`.env`はdev・start・DBコマンドで読み込まれます。外から渡した環境変数が優先されます。mockならPythonは不要です。

httpモードは別ターミナルでPythonを起動してから、`.env`の`DS_MODE=http`へ変更してwebを再起動します。

```sh
uv sync --project services/ds-api --frozen
uv run --project services/ds-api uvicorn src.api.app:app --app-dir services/ds-api --host 127.0.0.1 --port 8001
```

| 設定          | 既定値                                               | 用途                            |
| ------------- | ---------------------------------------------------- | ------------------------------- |
| DATABASE_URL  | postgresql://demo:demo@localhost:5434/work_assistant | Start所有のDB                   |
| DS_MODE       | mock                                                 | mock / http。サーバー設定で選択 |
| DS_API_URL    | http://127.0.0.1:8001                                | httpモードのPython接続先        |
| DS_TIMEOUT_MS | 15000                                                | DSリクエスト全体の制限時間      |

PythonにはDATABASE_URLを渡しません。Python APIは外部サービスとして独立配置できます。このモノレポのPythonダミー実装は共通fixtureを読み込むため、別配置時にはfixtureも同梱します。

## 画面で確認できること

- `/todos`: 追加、編集、完了切替、削除、URLによる絞り込み、再読込後の保存。
- 目標を入力して候補を取得。取得しただけでは保存せず、必要な候補の「＋」だけをTODOに追加。
- `/chat`: サーバーから到着する途中テキスト、検索・生成の工程、停止、再生成、会話リセット。
- `/reports`: Startの集計とDSの要約。3秒の初回待機、前回の結果を残した再集計、失敗と再試行。
- エラー再現: 目標やメッセージに`[error]`、`[invalid]`、`[slow]`。チャットには`[stream-error]`、`[disconnect]`も使えます。詳細は[DS引き継ぎ](docs/ds-handoff.md)。

[作業レポートを開く](http://localhost:3001/reports)。ナビゲーションの「振り返る」からも移動できます。取得用useEffectやloading専用stateを追加せず、Router・Query・Suspenseで待機を扱っています。役割とコードは[待機状態の説明](docs/pending.md)へまとめました。

会話はメモリ内のみです。ページ再読込やチャット画面の離脱で消えます。TODOはPostgreSQLへ保存します。

## 変更しやすくするための責務分離

```text
画面 / loader / Query
    ↓
Server Functions（検証、公開エラー変換）
    ↓
services（ユースケース、業務ルール）
    ↓
TodoRepository / DsClient（必要な操作のinterface）
    ↓
Drizzle + PostgreSQL / mock または Python HTTP
```

`sdd-backend-template`のrouters・services・crud・apisと同じ考え方です。Server Functionsへ業務処理を集めず、具体実装は`server/dependencies`で注入します。依存の向き、transaction、変更例は[アーキテクチャ](docs/architecture.md)を参照してください。

| ディレクトリ          | 読み始める場所                                        |
| --------------------- | ----------------------------------------------------- |
| apps/web              | routes → queries → server/functions → server/services |
| packages/db           | schema.ts、repository.ts、migrations                  |
| packages/ds-contract  | OpenAPI、生成型、実行時schema、共通fixture            |
| packages/ds-client    | 共通interface、mock / HTTP、SSE読取り                 |
| packages/chat-adapter | SDK入力変換、標準イベントの検証とSSE応答              |
| services/ds-api       | api → schemas → logic（DSが変更する関数）             |

通常のJSON候補提案・レポートはOpenAPI型とopenapi-fetchを使い、チャットだけAG-UIを使います。TanStack AIは会話状態と表示更新、StartはServer Functionsと配信、QueryはTODOのサーバーデータ、Formは入力を担当します。Base UIのButtonをアプリ内の小さなUI部品にまとめています。共有するUI状態が必要ないためJotaiは追加していません。

## マイグレーションと契約更新

```sh
# DB schemaを変更後、生成SQLとsnapshotをレビューしてコミット
npm run db:generate -- --name=add-field
npm run db:migrate

# Python schemaを変更後にOpenAPIとTS型を更新
npm ci --prefix tools/openapi-codegen
npm run contracts:generate
npm run check:generated -w @demo/ds-contract
```

アプリの型検査はTypeScript 7ベースのOxlintに統合しています。openapi-typescriptは旧コンパイラAPIが必要なため、型生成ツールだけ`tools/openapi-codegen`の独立したTypeScript 5.9環境へ隔離しています。保存済み型があるので、通常のmock開発・ビルドにこの追加インストールは不要です。

## 検証

```sh
npm run lint              # 型検査 + Lint + 依存境界
npm run format:check
npm run verify:type-check # 意図した型エラーを6領域で検出し、一時ファイルを削除
npm test                  # service、mock、SSE、adapter。DB/実Pythonはenvで有効化
npm run lint:python
npm run test:python
npm run build
```

実DBと実Python、ブラウザも含める場合は専用DBを用意します。デモ用DBをテスト対象にしないでください。

```sh
 docker compose up -d db
 docker compose exec -T db createdb -U demo work_assistant_test  # 初回のみ
TEST_DATABASE_URL=postgresql://demo:demo@localhost:5434/work_assistant_test DS_TEST_HTTP_URL=http://127.0.0.1:8001 npm test
npx playwright install chromium
npm run build
npm run test:e2e
DS_MODE=http npm run test:e2e
```

HTTPの共通契約テストには8001番のPython起動が必要です。HTTPのブラウザテストでは専用Python検証プロセスを8101番に起動し、停止が生成器まで届いたことも確認します。webの検証用ポートは3101番です。Chromium、DB、Pythonを含む検証手順はCIにも収めています。

## 計画と紹介資料

- [全体計画](docs/plans/README.md)・[実装計画](docs/plans/implementation.md)・[配信契約](docs/plans/streaming-contract.md)
- [実装と検証の記録](docs/verification.md)
- [画面とコードで見る紹介HTML](docs/demo.html)

このリポジトリで実装するのは案2です。認証、チャット履歴DB、途中再開、永続ジョブ、実モデル接続は追加段階として残しています。
