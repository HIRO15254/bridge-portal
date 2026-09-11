# Cloudflareデプロイ

## 初回セットアップ

アプリケーションを稼働させるCloudflare accountに次のリソースを作成します。

1. `better-t-app-template-db`という本番D1 database
2. `better-t-app-template`というPages project
3. `better-t-app-template-api`というWorker API（最初の本番deployで作成しても構いません）

本番D1 UUIDを`apps/server/wrangler.jsonc`へ設定します。deploy可能な派生プロジェクトでは、全ゼロのplaceholderをcommitしないでください。GitHub repository variablesに次を設定します。

- `CLOUDFLARE_ACCOUNT_ID`
- `PRODUCTION_WEB_URL`（CORSで許可する完全一致のorigin）
- `PRODUCTION_API_URL`（Web buildへ埋め込むWorker base URL）

GitHub Actions secretとして`CLOUDFLARE_API_TOKEN`を設定します。tokenにはWorkers Scripts、Pages、D1を管理するために必要なaccount権限が必要です。

`wrangler.jsonc`を変更した後は`bun run cf:typegen`を実行し、生成されたbinding型をcommitします。

## 本番

`master`へのpushでCI、D1 migration、Worker deploy、Pages build/deployの順に実行します。本番D1 UUIDがplaceholderのままならdeployは停止します。

初期テンプレートにはSQL migrationがありません。この状態ではmigrationコマンドはD1へ接続せず正常終了します。最初の派生機能でtableを追加するとき、その機能が最初の実migrationを生成してcommitします。

## Pull request preview

同一リポジトリ内のbranchから作成したPRには、PRごとに安定した次のリソースを作成します。

- Worker: `<slug>-api-pr-<number>`
- Pages deployment: `<slug>` project内の`pr-<number>` branch
- D1 database: `<slug>-db-pr-<number>`

fork PRではpreviewを作成しません。repository secretを利用できず、信頼していないcodeへ本番dataを渡さないためです。

PR databaseを初めて作成したとき、本番適用済みmigrationまでschemaを揃え、本番D1の全dataをexportし、triggerを一時的に外してからimportし、必ずtriggerを復元した後にPR branchだけの新しいmigrationを適用します。空schema、migrationなし、空dumpはいずれも正常系です。以後のpushでは同じpreview databaseを再利用し、未適用migrationだけを追加適用します。PR close時はWorker、Pages deployment、D1 databaseを冪等に削除します。

> **データ公開範囲の警告:** 最初のpreview snapshotは、匿名化していない本番D1の完全な複製です。このリポジトリへbranchを作成できる全員を、本番dataへアクセス可能な信頼済み利用者として扱うことになります。この前提が合わない場合は、preview deployを有効にする前にsnapshot手順を無効化するか、匿名化したfixture生成へ置き換えてください。

export中はsource D1への他のrequestが一時的にblockされるため、大規模snapshotの実行時刻には注意してください。

## ローカル受け入れ検査

```sh
bun install --frozen-lockfile
bun run cf:typegen:check
bun run check-types
bun run check
bun run test:ci
bun run test:coverage
bun run check:test-discovery
bun run build
bunx wrangler deploy --dry-run -c apps/server/wrangler.jsonc
bun run db:migrate:local
```
