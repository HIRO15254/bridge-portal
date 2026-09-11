# Bridge Portal

Funbridgeの実戦と2026年5月1日施行のJCBL「リストA」を結ぶ、単一ユーザー向け学習ポータルです。

## MVP workflow

1. `Rules`でリストAの全22大項目を学ぶ
2. `My Systems`でRule・Variant・Natural call設定を選び、不変のSystem Versionを公開する
3. 外部取得済みのFunbridge JSONを取り込む
4. 本人のCall／Lead／Signalについて全22評価器を実行する
5. Board Detailと`Statistics`からルールと実戦を往復する

元のFunbridge JSONはPrivate R2へSHA-256で冪等保存し、D1にはTournament、Revision、Deal、Auction、Play、Score、評価Runを正規化します。同一Tournament IDの更新は新しいRevisionになります。不完全なAuction／Playも受け付け、客観的に判断できない評価は理由付き`INDETERMINATE`になります。DDSはブラウザーのWeb Workerでオンデマンド実行します。Board DetailからDeal、Auction、Play、Result、System、Double Dummy結果を含むPBN 2.1をエクスポートできます。

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

## One-time admin bootstrap

公開登録とOAuthは無効です。Workerへ`BETTER_AUTH_SECRET`と一時的な`BOOTSTRAP_TOKEN`をSecretとして設定し、次の環境変数をローカルシェルへ設定して一度だけ実行します。

```sh
bun run auth:bootstrap
```

必要な環境変数は`BRIDGE_PORTAL_API_URL`、`BRIDGE_PORTAL_BOOTSTRAP_TOKEN`、`BRIDGE_PORTAL_ADMIN_EMAIL`、`BRIDGE_PORTAL_ADMIN_NAME`、`BRIDGE_PORTAL_ADMIN_PASSWORD`です。任意で`BRIDGE_PORTAL_FUNBRIDGE_ID`も指定できます。作成後はCloudflareから`BOOTSTRAP_TOKEN`を削除してください。2人目以降の作成はサーバー側でも拒否されます。

## Funbridge JSON profile

取込ファイルは`format: "FUNBRIDGE_EXPORT"`、`formatVersion: 1`とし、Tournament、Board、Auction、Playを含む正規化前の交換プロファイルです。正式なFamilyは`BP_CIRCUIT`、`DAILY`、`SERIES`のみで、それぞれBP、地域、Series期間・昇降格の固有メタデータが必須です。完全な例は[`packages/domain/src/__tests__/fixtures`](./packages/domain/src/__tests__/fixtures)にあります。各手13枚・52枚一意性、action index、trick番号、Playカードの所有席を取込前に検証します。PBN、LIN、USEBIOからのインポートはMVP対象外です。

## Deployment

Cloudflare Worker、D1、Private R2、PagesとGitHub Actionsを使用します。詳しい運用手順は[deployment guide](./docs/deploy.md)を参照してください。テンプレート由来の初期化・preflightには同梱の[`better-t-app-setup`](./.agents/skills/better-t-app-setup/SKILL.md)を使用します。
