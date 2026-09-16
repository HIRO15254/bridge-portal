# Bridge Portal

Funbridge tournament and board history browser for one user.

## History browsing

The portal accepts the skill-defined tournament-detail and history-index JSON files. Original JSON is immutable in private R2; D1 stores tournament revisions, deals, auction and play actions, scores, and history-index entries. Partial boards remain visible. DDS runs on demand in a browser worker, and board detail can export PBN 2.1 with deal, auction, play, result, and double-dummy data.

## Development

```sh
bun install --frozen-lockfile
bun run cf:typegen
bun run db:migrate:local
bun run dev
```

検証コマンド:

```sh
bun run check-types
bun run check
bun run test
bun run check:test-discovery
bun run build
```

## First account registration

ユーザーがまだ存在しない環境では、ログイン画面の「新規登録」から最初の個人アカウントを作成できます。登録後は画面とAPIの新規登録口が自動的に閉じ、D1の一意制約でも2人目の作成を拒否します。OAuthは無効です。

CLIから初回登録する場合は、Workerへ`BETTER_AUTH_SECRET`と一時的な`BOOTSTRAP_TOKEN`をSecretとして設定し、次の環境変数をローカルシェルへ設定して一度だけ実行します。

```sh
bun run auth:bootstrap
```

必要な環境変数は`BRIDGE_PORTAL_API_URL`、`BRIDGE_PORTAL_BOOTSTRAP_TOKEN`、`BRIDGE_PORTAL_ADMIN_EMAIL`、`BRIDGE_PORTAL_ADMIN_NAME`、`BRIDGE_PORTAL_ADMIN_PASSWORD`です。任意で`BRIDGE_PORTAL_FUNBRIDGE_ID`も指定できます。作成後はCloudflareから`BOOTSTRAP_TOKEN`を削除してください。

## Funbridge JSON profile

The supported files are `FUNBRIDGE_EXPORT` v1 tournament details and `FUNBRIDGE_HISTORY_INDEX` v1 history indexes. Their authoritative structure is the [Funbridge export-format documentation](./docs/funbridge-export-format.md) and the JSON Schema shipped with the skill. `BP_CIRCUIT`, `DAILY`, and `SERIES` are supported. Import validates 13 cards per hand, 52 unique cards, action indices, trick numbers, and card ownership. PBN, LIN, and USEBIO imports are out of scope.

## Deployment

Cloudflare Worker、D1、Private R2、PagesとGitHub Actionsを使用します。詳しい運用手順は[deployment guide](./docs/deploy.md)を参照してください。テンプレート由来の初期化・preflightには同梱の[`better-t-app-setup`](./.agents/skills/better-t-app-setup/SKILL.md)を使用します。
