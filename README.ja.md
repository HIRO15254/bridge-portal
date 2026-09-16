# Bridge Portal

Funbridgeの大会・ボード履歴を閲覧する単一ユーザー向けポータルです。

## 履歴閲覧

スキル出力の大会詳細・履歴索引 JSON をPrivate R2へSHA-256で不変保存し、D1には大会、配札、Auction、Play、Score と履歴索引を正規化します。大会詳細は同じ大会IDごとにRevisionとして保持し、`partialBoards` もボード一覧から確認できます。DDSはブラウザーのWeb Workerでオンデマンド実行し、Board DetailからDeal、Auction、Play、Result、Double Dummy結果を含むPBN 2.1をエクスポートできます。

## 技術構成

- React 19、Vite、TanStack Router／Query、Tailwind CSS、shadcn/ui、PWA
- Cloudflare Workers、Hono、tRPC
- Drizzle ORM、Cloudflare D1、Private R2
- Better Authによる単一ユーザー認証
- Bun workspace、Vitest、Playwright

詳しいpackage境界とコマンドは[`AGENTS.md`](./AGENTS.md)を参照してください。

## 開発

```sh
bun install --frozen-lockfile
bun run cf:typegen
bun run db:migrate:local
bun run dev
```

主要な検証コマンド:

```sh
bun run check-types
bun run check
bun run test
bun run test:e2e
bun run check:test-discovery
bun run build
```

## 初回管理者登録

ユーザーがまだ存在しない環境では、ログイン画面の「新規登録」から最初の個人アカウントを作成できます。登録後は画面とAPIの新規登録口が自動的に閉じ、D1の一意制約でも2人目の作成を拒否します。OAuthは無効です。

CLIから初回登録する場合は、Workerへ`BETTER_AUTH_SECRET`と一時的な`BOOTSTRAP_TOKEN`をSecretとして設定し、次の環境変数をローカルシェルへ設定して一度だけ実行します。

```sh
bun run auth:bootstrap
```

必要な環境変数は`BRIDGE_PORTAL_API_URL`、`BRIDGE_PORTAL_BOOTSTRAP_TOKEN`、`BRIDGE_PORTAL_ADMIN_EMAIL`、`BRIDGE_PORTAL_ADMIN_NAME`、`BRIDGE_PORTAL_ADMIN_PASSWORD`です。任意で`BRIDGE_PORTAL_FUNBRIDGE_ID`も指定できます。作成後はCloudflareから`BOOTSTRAP_TOKEN`を削除してください。

## Funbridge JSONプロファイル

取込対象はスキルで定義された`FUNBRIDGE_EXPORT` v1（大会詳細）と`FUNBRIDGE_HISTORY_INDEX` v1（履歴一覧）です。構造の正本は[Funbridge履歴エクスポート形式](./docs/funbridge-export-format.md)とスキル同梱のJSON Schemaです。`BP_CIRCUIT`、`DAILY`、`SERIES`の3 Familyに対応し、各手13枚・52枚一意性、action index、trick番号、Playカードの所有席を取り込み時に検証します。PBN、LIN、USEBIOからのインポートは対象外です。

## デプロイ

Cloudflare Worker、D1、Private R2、PagesとGitHub Actionsを使用します。初期設定、本番deploy、初回管理者登録、PR previewの詳細は[デプロイガイド](./docs/deploy.ja.md)を参照してください。テンプレート由来の初期化とpreflightには同梱の[`better-t-app-setup`](./.agents/skills/better-t-app-setup/SKILL.md)を使用します。
