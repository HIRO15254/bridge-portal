# Bridge Portal

Funbridgeの実戦と、2026年5月1日施行のJCBL「リストA」を結ぶ単一ユーザー向け学習ポータルです。

## MVPの学習ループ

1. `Rules`でリストAの全22大項目を学ぶ
2. `My Systems`でRule・Variant・Natural call設定を選び、不変のSystem Versionを公開する
3. 外部取得済みのFunbridge JSONを取り込む
4. 本人のCall／Lead／Signalについて全22評価器を実行する
5. Board Detailと`Statistics`からルールと実戦を往復する

元のFunbridge JSONはPrivate R2へSHA-256で冪等保存し、D1にはTournament、Revision、Deal、Auction、Play、Score、評価Runを正規化します。同じTournament IDの更新は新しいRevisionとして保持します。不完全なAuction／Playも受け付け、客観的に判断できない評価は理由付き`INDETERMINATE`になります。

DDSはブラウザーのWeb Workerでオンデマンド実行します。Board Detailから、Deal、Auction、Play、Result、System、Double Dummy結果を含むPBN 2.1をエクスポートできます。

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

取込ファイルは`format: "FUNBRIDGE_EXPORT"`、`formatVersion: 1`とし、Tournament、Board、Auction、Playを含むBridge Portal標準の交換プロファイルです。正式なFamilyは`BP_CIRCUIT`、`DAILY`、`SERIES`のみです。それぞれBP、地域、Series期間・昇降格の固有メタデータを検証します。

完全な例は[`packages/domain/src/__tests__/fixtures`](./packages/domain/src/__tests__/fixtures)にあります。各手13枚・52枚一意性、action index、trick番号、Playカードの所有席と合法な順序を取込前に検証します。PBN、LIN、USEBIOからのインポートはMVP対象外です。

このプロファイルはFunbridge社が公開する公式エクスポート仕様ではありません。外部取得処理が取得データをこの形へ変換して出力する前提です。テストでは合成fixtureに加え、Web版の読取専用リプレイから取得後に識別情報を除去した3 Familyのfixtureも検証します。

## デプロイ

Cloudflare Worker、D1、Private R2、PagesとGitHub Actionsを使用します。初期設定、本番deploy、初回管理者登録、PR previewの詳細は[デプロイガイド](./docs/deploy.ja.md)を参照してください。テンプレート由来の初期化とpreflightには同梱の[`better-t-app-setup`](./.agents/skills/better-t-app-setup/SKILL.md)を使用します。
