# DS と SWE の分担

Start が TODO の DB、保存、候補の採用、画面を所有する。DS API は入力から候補や回答を生成し、アプリ DB に接続しない。両方の実装を同じリポジトリで管理するが、Python は独立して起動・テストできる。

| 変更したいこと                     | 主な変更箇所                                           |
| ---------------------------------- | ------------------------------------------------------ |
| 候補生成の規則、推論、検索         | `services/ds-api/src/logic/demo.py` の `suggest_todos` |
| チャットの生成、公開する工程       | 同ファイルの `stream_chat`                             |
| HTTP、SSE、切断時の処理            | `services/ds-api/src/api/app.py`                       |
| API の入出力                       | `services/ds-api/src/schemas/models.py`                |
| SWE が Python なしで使うダミー処理 | `packages/ds-client/src/index.ts` の mock 実装         |
| 共通のダミー結果と障害シナリオ     | `packages/ds-contract/fixtures/scenarios.json`         |
| AG-UI の検証、SDK との接続         | `packages/ds-contract`、`packages/chat-adapter`        |
| TODO の保存、採用時の業務判断      | `apps/web/src/server/services` と `packages/db`        |

DS の関数は FastAPI、TanStack、アプリ DB に依存しない。`suggest_todos` は検証済み入力を受けて `SuggestionResponse` を返す。`stream_chat` は公式 `ag_ui.core` のイベントを返す async generator である。実際の推論を接続するときもこの関数を直接テストし、薄い HTTP 層は共通処理として保つ。

# 起動と検証

リポジトリルートで以下を実行する。外部 AI の鍵や GPU は不要である。

```sh
uv sync --project services/ds-api
uv run --project services/ds-api uvicorn src.api.app:app --app-dir services/ds-api --port 8001
```

`DS_MODE=mock` は Python を呼ばず、Start 内のダミー実装を利用する。`DS_MODE=http` と `DS_API_URL=http://127.0.0.1:8001` を設定すると Python を呼ぶ。Python が停止しても mock へ自動切り替えしない。Compose では `ds-api` のサービス名とコンテナ内ポートを使用する。

```sh
uv run --project services/ds-api pytest services/ds-api/tests
uv run --project services/ds-api ruff check services/ds-api
npm test
# 起動中の Python に対して同じ TypeScript 契約テストを実行
DS_TEST_HTTP_URL=http://127.0.0.1:8001 npm test
```

通常の `npm test` にも実 HTTP のテスト用 Node サーバーを含む。日本語 UTF-8 の 1 byte 分割、CRLF、複数行 data、不正 JSON、イベント順序、終端なしの切断、待機中の中止で上流ソケットが閉じることを確認する。Python の共通契約テストでは mock と同じ候補、部分回答、途中失敗、停止を確認する。

# 契約を変更する場合

1. DS と SWE で入出力、上限、エラーの意味、公開する工程を決める。
2. Pydantic のモデルと Python の関数・テストを変更する。
3. 初回だけ `npm ci --prefix tools/openapi-codegen` で生成専用依存を用意する。
4. `npm run contracts:generate` で OpenAPI と TypeScript を生成する。
5. 生成した差分、Zod 境界検証、mock、共通 fixture を更新する。
6. Python のテスト、`npm run check:generated -w @demo/ds-contract`、両モードの共通契約テストを実行する。

生成物は `packages/ds-contract/openapi.json` と `src/openapi.ts` にコミットする。OpenAPI は Python のスキーマから生成し、アプリで扱う提案型は生成型を使う。Zod の上限と fixture を保存済み OpenAPI に対してテストする。Python のテストは保存済み OpenAPI の差分を検出し、`check:generated` は生成型の差分をファイルを書き換えず検出する。

生成ツールは TypeScript 5 の compiler API を必要とするため、`tools/openapi-codegen` に独立した依存と lockfile を持つ。通常のアプリの型検証は TypeScript 7 を使い、生成された TypeScript も同じ検証対象に含む。

# 対応するチャット契約

入力は標準 RunAgentInput の一部に限定する。`threadId` は会話ごとに継続し、`runId` は送信・再生成ごとに新しくする。1–100 件の user / assistant のテキスト履歴を受け付け、各本文は 1–4000 文字。最後は user とする。`state` と `forwardedProps` は空 object、`tools` と `context` は空 array とし、ツール実行、添付、メタデータ、親実行、再開は受け付けない。

基本イベントは `RUN_STARTED`、`STEP_STARTED` / `STEP_FINISHED`、`TEXT_MESSAGE_START` / `TEXT_MESSAGE_CONTENT` / `TEXT_MESSAGE_END`、`RUN_FINISHED` / `RUN_ERROR`。公式 TypeScript スキーマと Python SDK のイベント・EventEncoder を使用し、独自の AG-UI イベント仕様は作らない。採用版は JavaScript AG-UI 1.0.3、Python ag-ui-protocol 0.1.22。これは双方に共通する基本イベントの対応であり、プロトコル全体の対応は保証しない。

工程 `retrieve` / `generate` を UI で表示し、モデルの内部思考は配信しない。1 回の実行は正常終了か失敗のどちらか一つで終了する。開始、工程とテキストの開始・終了、messageId / runId の対応、終端を検証し、途中切断を成功に変えない。`RUN_ERROR` は SDK が表示する処理失敗として中継する。Startは最初のイベント到着まで接続を確認し、配信開始前の入力不備・接続失敗は通常の関数エラーとして返す。SSE開始後の失敗は安全な `RUN_ERROR` に変換する。

クライアント単体の既定タイムアウトは実行全体で 10 秒、アプリ設定の既定値は `DS_TIMEOUT_MS=15000`（15 秒）。中止は browser の AbortSignal、Response stream の cancel、DS クライアント、HTTP 接続、Python async generator の待機へ伝える。Python を同期関数や停止不能な GPU 呼び出しへ置き換える場合は、その処理自身の停止方法を追加で検証する。自動再試行、永続履歴、途中再開、長時間ジョブは初期実装の範囲に含めない。

# 開発用の障害シナリオ

目的文またはチャットの最後の入力へ以下を含める。通常の入力では成功する。

| 入力             | 動作                                              |
| ---------------- | ------------------------------------------------- |
| `[error]`        | 生成前のサービスエラー                            |
| `[invalid]`      | 不正な返却値・イベントを受信した場合の検証エラー  |
| `[slow]`         | 最初の待機を 5 秒にして、停止・タイムアウトを確認 |
| `[stream-error]` | 最初のテキスト断片の後に `RUN_ERROR`              |
| `[disconnect]`   | 最初の断片の後に終端なしで切断                    |

下の二つはチャット専用である。開発用シナリオは公開運用の障害注入機能として設計したものではなく、実 AI に接続する際にダミー処理とともに置き換える。

# チャットが不要な案件

`apps/web/src/features/chat`、チャット route / server function、`packages/chat-adapter`、DS クライアントの `streamChat`、Python の `/v1/chat/stream` と対応するテストを外す。候補提案の JSON API と TODO の業務サービスは独立しているため、AG-UI やチャット SDK を外しても通常の TODO と候補採用を維持できる。
