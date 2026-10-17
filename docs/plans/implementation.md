# 案2 TanStack Startと独立したDS APIの実装計画

TODO、ダミーAI候補提案、ストリーミングチャットを持つアプリを、新しい独立モノレポとして作る。StartがTODOのDBと業務処理を所有し、DS担当のPython APIを差し替え可能な接続先にする。Pythonサービスや本物のAIがなくても、SWEが画面、DB、チャットを開発できることを示す。

背景と共通仕様は [全体計画](README.md) を参照する。この責任分担はNext.jsでも成立し、Startの扱いやすさは別の評価軸とする。

## 実装状況（2026-10-17）

段階1〜6のアプリ機能、責務分離、mock / HTTP接続、配信契約、起動・検証手順を実装した。結果と採用版の調整は [検証記録](../verification.md)、変更時の責務は [アーキテクチャ](../architecture.md)、画面からの紹介は [HTML](../demo.html) を参照する。元の計画はGit履歴に保存している。別の初学者による体験評価、公開環境での運用検証は未実施で、追加評価として残す。

## 示したい体験

| 体験                               | 確認する価値                                         |
| ---------------------------------- | ---------------------------------------------------- |
| Pythonを起動せずTODOとAI提案を使う | DSの実装待ちでアプリ開発が止まらない                 |
| 設定だけ変えてPython APIを呼ぶ     | UIと業務サービスを変更せず接続先を交換できる         |
| DSがPythonの関数だけ変更する       | アプリDBや画面を理解せず分析処理を改善できる         |
| APIエラーを模擬する                | DSの実サービスに障害を起こさずエラー表示を開発できる |
| チャットを途中表示し、止める       | モックでも配信とキャンセルを開発できる               |
| AI候補をTODOとして保存する         | 保存と業務データの所有がStart側へまとまる            |

まずTODOと候補提案を作り、次にチャットを加える。分析依頼管理、実行履歴の専用テーブル、チャット履歴DB、永続ジョブを初期の完成条件にしない。

## 新規モノレポの構成

リポジトリ名はtanstack-start-ds-api-demoとする。案1や既存リポジトリのサブフォルダではなく、独立したGit履歴と起動手順を持つモノレポにする。

```text
tanstack-start-ds-api-demo/
  apps/
    web/
      src/routes/
      src/features/todos/
      src/features/chat/
      src/contracts/        # ブラウザにも渡せる業務DTOと入力スキーマ
      src/server/functions/ # 検証、サービス呼び出し、公開エラー変換
      src/server/services/  # ユースケースと業務ルール
      src/server/dependencies/ # DB・DSの組み立てと設定（composition root）
      src/queries/
  packages/
    db/                     # schema、repository、migration（サーバー専用）
    ds-contract/            # API仕様、生成した型、共通fixture
    ds-client/              # 共通インターフェースとmock、http実装
    chat-adapter/           # AG-UIの検証、中継、SDKとの型の調整
    ui/
  services/
    ds-api/                 # DS担当のPythonサービス
      src/api/
      src/schemas/
      src/logic/
      tests/
  docs/
    ds-handoff.md           # DSとSWEの担当、関数差し替え、契約変更
  compose.yml
  README.md
```

JavaScriptはworkspaces、Pythonはservices/ds-api内で依存関係を管理する。DSクライアントはサーバー専用とし、mockとhttpの選択をブラウザへ持たせない。モノレポでも、アプリとDSサービスは独立してビルドと起動ができる構成にする。

## Start側のバックエンド責務分離

`sdd-backend-template` の `routers → services → crud / apis` を参考に、同じ責務と依存の向きをTypeScriptへ適用する。既存テンプレートのコードへの依存は作らない。

| テンプレートの責務      | このアプリの配置                                  | 内容                                                                           |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| routers                 | `apps/web/src/server/functions`                   | Server Functionsの入口。入力検証、サービス呼び出し、公開エラーへの変換に限定   |
| services                | `apps/web/src/server/services`                    | TODO操作、候補の採用など業務上の判断。Router、React、Drizzle、HTTPに依存しない |
| crud / models           | `packages/db`                                     | Drizzleスキーマ、SQL、repository実装、マイグレーション                         |
| apis                    | `packages/ds-client`                              | DsClientのportとmock / HTTP実装、タイムアウト、外部応答検証                    |
| schemas                 | `apps/web/src/contracts` / `packages/ds-contract` | アプリの入出力DTOとDS契約を区別。DBの行やSDK内部型を画面の契約にしない         |
| dependencies / settings | `apps/web/src/server/dependencies`                | 環境変数の検証と依存の組み立て。サービスに具体実装を注入                       |

画面・Query → Server Functions → services → repository / DsClientの順に呼ぶ。画面、loader、Server Functionsから直接SQLやDSのfetchを書かない。サービスは小さなrepository interfaceとDsClientを受け取り、テストでは差し替えられるようにする。抽象基底クラスや汎用CRUDフレームワークは作らず、必要な操作だけ定義する。

DBと外部通信の実装はサーバー専用ファイルとStartのimport protectionでブラウザからの読み込みを防ぐ。公開DTO、入力スキーマ、Query定義とサーバーの組み立てを同じbarrelにまとめない。接続文字列、内部エラー詳細をブラウザへ返さない。

現在のCRUDは一操作・一SQLを原子操作とする。将来、複数更新を一ユースケースとしてまとめる場合はサービスの境界でtransactionを開始し、そのtransactionに束縛したrepositoryを渡す。候補の取得中にDB transactionを保持しない。候補の保存は既存のTODO追加サービスを再利用する。

業務上の未検出、入力不備、外部サービスの失敗を識別し、入口で安定した公開エラーへ変換する。例外や接続情報をそのまま返さない。ストリームの開始後の失敗は共通のRUN_ERRORとして扱う。

サービスの単体テスト、実DBを使うrepositoryテスト、DSのmock / HTTP共通契約テスト、ブラウザの主要操作テストを分ける。依存境界は自動チェックを追加し、入口への業務処理の集中やブラウザからのサーバー専用importを検出する。詳細な配置と変更例を `docs/architecture.md` に記録する。

## 段階1 アプリDBとTODOを作る

1. Start、Router、Query、Node.js、TypeScript 7系の互換性を確認し、依存関係を固定する。Vite、Vitest、TanStack Form、shadcn/uiとBase UI、OxlintとOxfmtを使う。型チェックはOxlintのtype-awareとtype-checkへ統合し、アプリと共有パッケージの検出範囲を初期確認する。
2. PostgreSQLへtodosテーブルを作り、再現できる初期化手順と初期データを用意する。
3. DBアクセスはDrizzle ORMとpg、マイグレーションはDrizzle Kitとし、使用する安定版を動作確認して固定する。
4. サーバー関数から業務サービスとDBアクセスを呼び、TODOの追加、取得、編集、完了切り替え、削除を実装する。
5. loaderとQueryで表示し、一覧条件をURLと連動させる。

DBの接続情報と実装はサーバーだけに置く。PythonサービスにはアプリDBの資格情報を渡さない。初期のTODO項目と画面操作は案1と揃える。

完了条件は、PythonなしでTODOが動き、再読み込み後も内容が残ることである。

### マイグレーションの運用

TypeScriptのスキーマを変更し、Drizzle KitのgenerateでSQLとスキーマのスナップショットを生成する。生成物をレビューしてGitへ含め、migrateで未適用の変更だけをDBへ反映する。開発用の直接反映だけに依存せず、新しいDBを履歴から作れるようにする。

```sh
npx drizzle-kit generate --name=add-todos
npx drizzle-kit migrate
```

上記はDBパッケージの設定を読み込める場所で実行するコマンド例であり、実装時にはルートから使うnpmスクリプトへまとめる。既存データの変換は必要に応じてカスタムSQLにし、複数アプリプロセスが同時にマイグレーションを実行する構成にはしない。[生成](https://orm.drizzle.team/docs/drizzle-kit-generate)、[適用](https://orm.drizzle.team/docs/drizzle-kit-migrate)

## 段階2 DSの入力と出力を決める

最初のAPIはPOST /v1/todo-suggestionsとし、入力はgoal、出力はsuggestionsとmodel_versionに絞る。suggestionsの各要素はtitleを持つ。空の入力、入力上限、候補数、空の候補、エラー応答を契約に含める。

| 担当    | 実装する範囲                                       |
| ------- | -------------------------------------------------- |
| SWE     | TODOのDB、画面、候補の採用、DSクライアントとモック |
| DS      | goalから候補を作るPython関数とその検証             |
| SWEとDS | 入出力、処理時間、エラーの意味、APIへの接続        |

FastAPIとPydanticのスキーマからOpenAPIを生成してリポジトリへ保存し、TypeScript側の型と応答検証に使う。Pythonの実行がなくても、保存済み契約とfixtureからSWEが開発できるようにする。

型生成はopenapi-typescript、HTTPクライアントはopenapi-fetchを第一候補とする。生成した型からDSクライアントとmockの入出力を定義する。HTTPの返却値は必要な境界でZod検証し、mockも同じ応答契約のテストに通す。TypeScriptだけで完結するブラウザとStartの間は、サーバー関数の型を使い、OpenAPI経由にはしない。

OpenAPI生成ツールがTypeScriptの旧コンパイラAPIを必要とする場合は、型生成用workspaceへ互換依存を分ける。生成したTypeScriptの型はアプリ側の7系の型チェックに含め、生成ツールの依存を理由に通常のチェックを二重化しない。

型とスキーマをそれぞれ手で別管理する方式は避け、生成または契約テストで対応を確認する。Pythonの型があるだけで、HTTP応答が自動的にTypeScriptの実行時検証まで済むとは扱わない。

契約の変更はSWEがDSと相談して決めてもよい。DSがAPI化に慣れていなくても、Python関数の入口と出口に集中できる接続用の小さなコードを用意する。

## 段階3 モックでAI付きTODOを完成させる

DSクライアントには次の形の共通呼び出し口を設ける。

```typescript
interface DsClient {
  suggestTodos(input: { goal: string }): Promise<SuggestionResponse>;
  streamChat(input: ChatInput, signal?: AbortSignal): AsyncIterable<AgUiChatEvent>;
}
```

ChatInputは初期に対応するAG-UIのRunAgentInputの範囲を検証した型、AgUiChatEventは採用するAG-UIの基本イベント型を表す計画上の名前である。型と実行時スキーマは採用版の標準型から定義し、独自の同名イベント仕様を作らない。

mock実装は契約に合うfixtureを返し、短い遅延、サービスエラー、不正な応答をローカルで再現できるようにする。アプリはサーバー設定DS_MODE=mockで起動し、Pythonのコンテナを必要としない。

サーバー関数から業務サービスを通してDsClientを呼ぶ。画面には目的文、提案ボタン、処理中表示、候補のプレビュー、候補ごとの追加ボタンを置く。候補の取得はDBを変更せず、利用者が採用した候補だけを通常のTODO追加処理で保存する。

入力不備、DSの一時的な失敗、タイムアウト、不正な返却値を、表示に必要な分類へ変換する。候補取得だけではアプリDBに副作用を起こさない。提案を再試行した場合は結果が変わる可能性を許容し、利用者が保存前に確認する。高価な推論の重複課金対策や永続的な再実行制御は追加検証とする。

完了条件は、DS APIを一切起動せず、TODOとAI候補の取得、採用、エラー表示まで体験できることである。

## 段階4 独立したPython APIへ接続する

1. DSのサービスにFastAPIの小さなAPI層、Pydanticの入出力、差し替えるPython関数を用意する。
2. Python側も最初は固定規則のダミー応答とし、実AIやGPUを要求しない。
3. http実装でAPIを呼び、応答を共通契約で検証する。
4. サーバー設定をDS_MODE=httpへ変更して、同じ画面操作を行う。
5. Pythonの候補生成関数を変更し、画面とアプリDBのコードを変えず結果が変わることを確認する。

| モード | 呼び出し先              | Pythonサービス         |
| ------ | ----------------------- | ---------------------- |
| mock   | サーバー内のfixture実装 | 不要                   |
| http   | 独立したDS API          | 必要。処理自体はダミー |

両実装を同じ契約テストに通し、形がずれたモックで開発が進まないようにする。Python停止時に勝手にmockへ切り替えず、httpの障害として表示する。モードの切り替えは起動設定で明示する。

mockとhttpは同じインターフェースだが、ネットワークやPythonの起動不備まで同じ動作になるわけではない。httpモードで実際の接続、タイムアウト、応答検証も別途確認する。

## 段階5 チャットとストリーミングの契約を追加する

チャットSDKはTanStack AIの@tanstack/ai-reactと@tanstack/aiを初期導入し、案1と同じ方針にする。公式トップは現在RC表記であるため、配信、エラー、中止、型の互換性を小さな動作確認で検証してからバージョンを固定する。チャットの状態はSDK、保存済みTODOはQuery、共有UI状態は必要に応じたJotaiに分ける。不要な案件ではチャット画面と依存を削除できる構成にする。

DSとの入力と出力は [ストリーミング共通契約案](streaming-contract.md) に従う。ChatInputは対応範囲を限定したAG-UIのRunAgentInputとし、TanStack固有のUIMessageはStart側で変換する。AG-UIの基本イベントを使い、フィールド、配信順序、終了条件を契約とfixtureへ含める。通常のJSON応答にはAG-UIを適用しない。

| イベント                                                     | 内容                               |
| ------------------------------------------------------------ | ---------------------------------- |
| RUN_STARTED / RUN_FINISHED                                   | 実行の開始と正常終了               |
| TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT / TEXT_MESSAGE_END | 返答の開始、追加テキスト、返答終了 |
| STEP_STARTED / STEP_FINISHED                                 | 検索、生成等の工程の開始と終了     |
| RUN_ERROR                                                    | 途中エラーのコードとメッセージ     |

mockはサーバー内のasync generatorから時間差で同じAG-UIイベントを返す。httpはPythonのPOST /v1/chat/streamを呼び、SSEのAG-UIイベントを読み、同じ対応イベント型で返す。PythonはAG-UI SDKのイベント型とEventEncoderを使う。通常のJSON APIと異なり、HTTP本文を最後までjsonやtextで読み切ってから返す実装にはしない。

StartのPOSTサーバー関数からDSクライアントを呼び、AG-UIの検証と必要なSDKとの型の調整を行って配信する。useChatのfetcherからサーバー関数を呼び、送信、途中表示、停止、再生成、エラーを扱う。関数はSSEのResponseまたは対応するAsyncIterableを返す。Promiseを返すサーバー関数を同期の生成器向けのstream()へそのまま渡さない。[Server Functionsとの接続](https://tanstack.com/ai/latest/docs/transports/server-functions)

採用版のAG-UIとSDK双方の基本イベント契約を満たす。工程イベントから「検索中」「回答生成中」を表示する共通フックと表示部品を用意する。精度上、回答全体の確認が必要な処理では、途中は工程だけを通知し、回答を検証後に返す。DSはTanStack固有の画面型やアプリDBに依存しない。

採用版のサーバー関数で必要な配信や中止を満たせない場合は、StartのPOST /api/chatとfetchServerSentEventsへ接続方法を変更する。SDKの差はchat-adapterへ閉じ、必要ならAI SDKを再検討できる構成にする。両方式を完成品として並行実装することは求めない。

ストリームの各イベントを実行時に検証し、RUN_FINISHEDなしの切断は正常終了扱いにしない。RUN_ERRORは処理失敗として表示する。ブラウザの中止要求を上流HTTPとモック生成器へ伝える。キャンセルを無視して生成を続けないことを、両モードでテストする。通信チャンクとイベントの境界が一致する前提を置かず、UTF-8の分割も確認する。

OpenAPIから得る型はイベントの形に使えるが、イベント順序やキャンセルは別の契約テストで確認する。会話の履歴は初期にはメモリ内に置き、再接続による途中再開や永続ジョブへ広げない。

## 段階6 起動と独立開発の実演

ComposeはアプリとDBだけでmockモードを起動でき、プロファイルなどでDS APIを加えてhttpモードを動かせるようにする。両モードのコマンドをREADMEへ記載する。

紹介では次の順に操作する。

1. PythonなしのmockモードでTODOを作り、AI候補を採用する。
2. 同じUIのままhttpモードへ切り替える。
3. Pythonのダミー処理だけを変更し、返却候補の変化を確認する。
4. 両モードでチャットを送り、工程の進捗表示、完了前の返答表示と生成停止を試す。
5. DS APIを止め、TODOの通常操作は継続し、AIのエラーだけが表示されることを確認する。
6. DS APIを戻し、画面側の修正なしで提案とチャットが再び使えることを確認する。

型チェック、Lint、DBを含むTODOの機能テスト、mockとhttpの契約テスト、主要操作のブラウザテスト、本番ビルドを必要な範囲で実行する。認証やアクセス制限はローカルデモと公開運用を分け、公開する段階で要件に合わせて追加する。

## 完成条件

- 新規リポジトリだけで、TODOとストリーミングチャットのアプリを起動できる。
- mockモードではPythonの起動と外部AI接続が不要である。
- httpモードへの変更で、画面、TODOの業務処理、DBスキーマを変えない。
- DSが触るPython関数と、SWEが触るアプリの範囲を説明できる。
- 同じ入力と出力をモックとPython APIで検証できる。
- 両モードでストリームの途中表示、正常終了、途中エラー、停止要求の伝播を確認できる。
- 採用した候補だけをStart側が保存し、DS APIはアプリDBを扱わない。

構成上の利点とStartの開発体験を分けて記録する。Startが合わない場合でも、DSクライアント、契約、モック、DBの所有方針を保ち、Next.jsで同じ責任分担を採れるようにする。

## 新規案件で必要になったときの追加検証

長時間のLLM処理や画面を閉じても続く処理を扱う場合に、実行ID、状態と結果の永続化、ジョブAPI、ワーカー、再試行と復旧を追加する。初期の候補提案デモの完了条件には含めない。

大量のBigQueryデータはDSが直接取得し、少量の業務データはStartから渡す方針を維持する。AWSでの専用Security Group、社内SSO、DSに適したGPUやメモリ、監視などは、実案件の配置と運用条件を決めた段階で設計する。

## 追加実装 作業レポートと待機状態（2026-10-18）

`/reports`に、保存済みTODOの件数・進捗と、DSによる振り返り・次の一歩を表示する。StartがTODOを集計し、必要最小限の件数と未完了TODO最大3件だけをDSへ渡す。PythonにDB接続を渡さず、集計の読み取りはDSを待つ前に終了する。レポート取得でDBは変更しない。

DSのJSON API `POST /v1/work-report` と `DsClient.createWorkReport` を追加し、mockとHTTPを同じ入出力・規則で扱う。通常、3秒待って成功、3秒待って失敗をURLのscenarioで選べる。実行中の永続ジョブやストリーミングは追加しない。

画面はloaderで取得を開始してawaitせず、見出しと操作を先に表示する。結果欄はSuspenseで初回待機を表示し、同じ条件の再取得ではQueryのisFetchingで前回の結果を残す。初回エラーは局所的なエラー境界と再試行、再取得エラーは前回結果に添える形で表示する。取得用useEffectやloading専用useStateを追加しない。TODO更新時はレポートキャッシュも無効化する。

検証では、Start→DSへ渡す入力とデータ最小化、実DBの集計・読み取り専用、mock/HTTP契約、実際の3秒待機、SSR先行配信、初回/再取得/失敗回復、モバイルを確認する。React・Query・Routerの取得状態管理とStartの型付きサーバー境界の役割を分けて説明し、コードの抜粋・画面・検証記録を更新する。

追加レポートの実装とmock/HTTP両モードの検証を完了した。コードと待機状態の説明は[pending.md](../pending.md)、実行結果は[検証記録](../verification.md)を参照する。
