# Bridge Portal

A deliberately small full-stack starter for Cloudflare: React on Pages, a Hono/tRPC Worker, and an initially empty D1 database.

[日本語](./README.ja.md)

## Create a project

Clone this repository, then initialize its names before adding application code:

```sh
bun install --frozen-lockfile
bun run template:init -- my-app --display-name "My App"
```

The slug must be kebab-case. Initialization updates the workspace scope, imports, PWA metadata, Worker, Pages and D1 resource names, and these README files. It does not create Cloudflare resources, assign a D1 UUID, or change Git remotes. Use `--dry-run` to preview changes. Initialization refuses a second run.

## What is included

- React 19, Vite, TanStack Router and Query, tRPC, Tailwind CSS, shadcn/ui, and PWA support
- Hono on Cloudflare Workers
- Drizzle ORM with an empty D1 schema and migration directory
- Runtime contracts limited to `DB`, `CORS_ORIGIN`, and `VITE_SERVER_URL`
- Split Vitest projects, coverage, and test-discovery validation
- CI for pull requests to `master`, production deployment from `master`, and same-repository PR previews

The browser route `/` reports whether the tRPC API is reachable. The Worker route `/` and tRPC `healthCheck` both return `OK`.

## Development

```sh
cp apps/web/.env.example apps/web/.env.local
bun run cf:typegen
bun run db:migrate:local
bun run dev
```

Common checks:

```sh
bun run check-types
bun run check
bun run test
bun run test:coverage
bun run check:test-discovery
bun run build
```

See [the deployment guide](./docs/deploy.md) for Cloudflare setup, production delivery, and preview database behavior.

## Bundled setup skill

Repository-aware Codex installations can use the bundled `$better-t-app-setup` skill in [`.agents/skills`](./.agents/skills/better-t-app-setup/SKILL.md). Ask it to initialize the project name, prepare or verify the Cloudflare D1/Worker/Pages environment, configure the required GitHub settings with the CLI, or run deployment preflight checks. It treats remote resource creation, repository setting changes, migrations, and deployment as explicit operations rather than side effects of inspection.

## Template policy

This template is derived manually from the development, testing, and Cloudflare operating foundations of [Sapphire2](https://github.com/HIRO15254/sapphire2). Product behavior and identity are intentionally excluded: authentication, MCP and AI integrations, poker and other domain features, product branding, Linear automation, and dev/release branch conventions are not part of this repository.

Upstream improvements are evaluated and ported manually. This repository does not pin a Sapphire2 commit and does not automatically synchronize with it.
