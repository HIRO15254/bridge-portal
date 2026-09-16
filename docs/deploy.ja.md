# Cloudflareデプロイ

## 初回セットアップ

アプリケーションを稼働させるCloudflare accountに次のリソースを作成します。

1. `bridge-portal-db`という本番D1 database
2. `bridge-portal`というPages project
3. `bridge-portal-raw-imports`という非公開R2 bucketと、ローカルpreview用の`bridge-portal-raw-imports-preview`
4. `bridge-portal-api`というWorker API（最初の本番deployで作成しても構いません）

本番D1 UUIDを`apps/server/wrangler.jsonc`へ設定します。deploy可能な派生プロジェクトでは、全ゼロのplaceholderをcommitしないでください。GitHub repository variablesに次を設定します。

- `CLOUDFLARE_ACCOUNT_ID`
- `PRODUCTION_WEB_URL`（CORSで許可する完全一致のorigin）
- `PRODUCTION_API_URL`（Web buildへ埋め込むWorker base URL）

GitHub Actions secretとして`CLOUDFLARE_API_TOKEN`、`BETTER_AUTH_SECRET`、`PREVIEW_DEVELOPER_EMAIL`を設定します。`PREVIEW_DEVELOPER_EMAIL`には、PR previewへ複製する本番の開発ユーザーのメールアドレスを設定します。tokenにはWorkers Scripts、Pages、D1、R2を管理するために必要なaccount権限が必要です。同じ`BETTER_AUTH_SECRET`を`wrangler secret put`で本番Workerにも設定し、`wrangler.jsonc`には記録しません。

`wrangler.jsonc`を変更した後は`bun run cf:typegen`を実行し、生成されたbinding型をcommitします。

## 本番

`master`へのpushでCI、D1 migration、Worker deploy、Pages build/deployの順に実行します。本番D1 UUIDがplaceholderのままならdeployは停止します。

このリポジトリには版管理されたD1 migrationが含まれています。本番workflowは未適用分だけを順番に適用します。schema変更時は`bun run db:generate`で新しいmigrationを生成してcommitします。

## 初回管理者登録

本番deployとmigrationが成功しD1にユーザーが存在しない場合、ログイン画面の「新規登録」から最初の個人アカウントを作成できます。登録後は画面とAPIの新規登録口が自動的に閉じ、D1の一意制約でも追加ユーザーを拒否します。OAuthは無効です。

代わりにCLIで初回登録する場合は、一時的なtokenを本番Workerへ設定します。

```sh
bunx wrangler secret put BOOTSTRAP_TOKEN --name bridge-portal-api
```

ローカルシェルへ`BRIDGE_PORTAL_API_URL`、`BRIDGE_PORTAL_BOOTSTRAP_TOKEN`、`BRIDGE_PORTAL_ADMIN_EMAIL`、`BRIDGE_PORTAL_ADMIN_NAME`、`BRIDGE_PORTAL_ADMIN_PASSWORD`を設定し、必要なら`BRIDGE_PORTAL_FUNBRIDGE_ID`も設定して、次を一度だけ実行します。

```sh
bun run auth:bootstrap
bunx wrangler secret delete BOOTSTRAP_TOKEN --name bridge-portal-api
```

登録後にtokenを削除するとbootstrap endpointは404を返します。D1にユーザーが1人存在する場合も追加登録は拒否されます。

## Pull request preview

同一リポジトリ内のbranchから作成したPRには、PRごとに安定した次のリソースを作成します。

- Worker: `<slug>-api-pr-<number>`
- Pages deployment: `<slug>` project内の`pr-<number>` branch
- D1 database: `<slug>-db-pr-<number>`
- R2 bucket: `<slug>-raw-imports-pr-<number>`

fork PRではpreviewを作成しません。repository secretを利用できず、信頼していないcodeへ本番dataを渡さないためです。

PR databaseを初めて作成したとき、本番適用済みmigrationまでschemaを揃えます。本番D1のexportはGitHub Actions runner上の一時ファイルとしてだけ使用し、`PREVIEW_DEVELOPER_EMAIL`で指定した開発ユーザーと、そのユーザーのsystems、tournaments、imports、history index、boards、evaluations、関連するdealsだけを抽出してpreview D1へimportします。ほかのユーザー、認証session、verificationはpreview DBへ入れません。対象importのR2 objectだけをpreview bucketへ複製します。branch migrationはこのsnapshotの後に適用します。

認証sessionはpreview DBへ複製しないため、previewでは通常どおり開発ユーザーの認証情報でログインします。自動ログインは行いません。

> **アクセス制御の警告:** previewには開発ユーザーのデータが含まれます。閲覧・変更できる人を限定する必要がある場合は、Cloudflare Accessなどでpreview URLを保護してください。

空schema、migrationなし、対象ユーザーの空dataはいずれも正常系です。以後のpushでは同じpreview resourceを再利用し、未適用migrationだけを追加適用します。PR close時はWorker、Pages deployment、D1 database、R2 bucketを冪等に削除します。

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
