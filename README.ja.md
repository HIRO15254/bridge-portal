# Bridge Portal

Cloudflare向けの最小構成フルスタックスターターです。Pages上のReact、Hono/tRPC Worker、初期状態では空のD1データベースで構成されます。

[English](./README.md)

## プロジェクトの作成

このリポジトリをcloneし、アプリケーションコードを追加する前に名前を初期化します。

```sh
bun install --frozen-lockfile
bun run template:init -- my-app --display-name "My App"
```

slugはkebab-case必須です。初期化はworkspace scope、import、PWA metadata、Worker・Pages・D1のリソース名、このREADMEを一括更新します。Cloudflareリソースの作成、D1 UUIDの設定、Git remoteの変更は行いません。変更予定は`--dry-run`で確認できます。二重実行は拒否されます。

## 含まれるもの

- React 19、Vite、TanStack Router/Query、tRPC、Tailwind CSS、shadcn/ui、PWA基盤
- Cloudflare Workers上のHono
- 空のD1 schemaとmigrationディレクトリを持つDrizzle ORM
- `DB`、`CORS_ORIGIN`、`VITE_SERVER_URL`だけの初期環境契約
- 分割したVitest project、coverage、test discovery検証
- `master`向けPRのCI、`master`からの本番deploy、同一リポジトリPRのpreview

Webの`/`はtRPC APIへの接続状態を表示します。Workerの`/`とtRPCの`healthCheck`はどちらも`OK`を返します。

## 開発

```sh
cp apps/web/.env.example apps/web/.env.local
bun run cf:typegen
bun run db:migrate:local
bun run dev
```

主要な検査コマンド:

```sh
bun run check-types
bun run check
bun run test
bun run test:coverage
bun run check:test-discovery
bun run build
```

Cloudflareの初期設定、本番deploy、preview DBの動作は[デプロイガイド](./docs/deploy.ja.md)を参照してください。

## 同梱セットアップSkill

リポジトリSkillに対応したCodexでは、[`.agents/skills`](./.agents/skills/better-t-app-setup/SKILL.md)に同梱した`$better-t-app-setup`を利用できます。プロジェクト名の初期化、Cloudflare D1／Worker／Pages環境の準備・検証、CLIによるGitHub設定、deploy前検査を依頼できます。remote resourceの作成、repository設定の変更、migration、deployは、調査の副作用として実行せず、明示された場合だけ実行します。

## テンプレート方針

このテンプレートは[Sapphire2](https://github.com/HIRO15254/sapphire2)の開発・テスト・Cloudflare運用基盤を手動で参照して派生しています。認証、MCP/AI連携、ポーカーを含むドメイン機能、製品ブランド、Linear自動化、dev/releaseブランチ運用は意図的に含めません。

上流の改善は都度評価して手動で取り込みます。Sapphire2の参照commitは固定せず、自動同期も行いません。
