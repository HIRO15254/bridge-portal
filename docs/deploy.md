# Cloudflare deployment

## One-time setup

Create these resources in the Cloudflare account that will run the application:

1. A production D1 database named `bridge-portal-db`.
2. A Pages project named `bridge-portal`.
3. A private R2 bucket named `bridge-portal-raw-imports` and a local-preview bucket named `bridge-portal-raw-imports-preview`.
4. A Worker API named `bridge-portal-api` (the first production deploy can create it).

Copy the production D1 UUID into `apps/server/wrangler.jsonc`; never commit the all-zero placeholder for a deployable project. Configure these GitHub repository variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `PRODUCTION_WEB_URL` (the exact allowed CORS origin)
- `PRODUCTION_API_URL` (the Worker base URL embedded in the web build)

Configure `CLOUDFLARE_API_TOKEN`, `BETTER_AUTH_SECRET`, and `PREVIEW_DEVELOPER_EMAIL` as GitHub Actions secrets. Set `PREVIEW_DEVELOPER_EMAIL` to the production email address of the development user whose data should be copied to PR previews. The Cloudflare token needs the account permissions required to manage Workers Scripts, Pages, D1, and R2. Set the same `BETTER_AUTH_SECRET` on the production Worker with `wrangler secret put`; never place it in `wrangler.jsonc`.

After changing `wrangler.jsonc`, run `bun run cf:typegen` and commit the generated binding declarations.

## Production

A push to `master` runs CI, applies D1 migrations, deploys the Worker, then builds and deploys Pages. Deployment stops if the production D1 UUID is still the placeholder.

This repository contains versioned D1 migrations. The production workflow applies only pending migrations in order. After a schema change, generate and commit a new migration with `bun run db:generate`.

## One-time administrator bootstrap

After the production deploy and migrations succeed, an environment with no user shows a **New registration** action on the login screen. It accepts exactly the first personal account, then closes the UI and API registration path automatically. A D1 unique constraint also rejects a second user. OAuth remains disabled.

To create the first account from the CLI instead, put a temporary token on the production Worker:

```sh
bunx wrangler secret put BOOTSTRAP_TOKEN --name bridge-portal-api
```

Set `BRIDGE_PORTAL_API_URL`, `BRIDGE_PORTAL_BOOTSTRAP_TOKEN`, `BRIDGE_PORTAL_ADMIN_EMAIL`, `BRIDGE_PORTAL_ADMIN_NAME`, and `BRIDGE_PORTAL_ADMIN_PASSWORD` in the local shell. Optionally set `BRIDGE_PORTAL_FUNBRIDGE_ID`, then run the bootstrap once and remove the temporary secret:

```sh
bun run auth:bootstrap
bunx wrangler secret delete BOOTSTRAP_TOKEN --name bridge-portal-api
```

Without that secret the bootstrap endpoint returns 404. It also rejects additional registrations once D1 contains one user.

## Pull request previews

Pull requests from branches in this repository receive stable per-PR resources:

- Worker: `<slug>-api-pr-<number>`
- Pages deployment: branch `pr-<number>` in the `<slug>` project
- D1 database: `<slug>-db-pr-<number>`
- R2 bucket: `<slug>-raw-imports-pr-<number>`

Fork pull requests do not receive previews because repository secrets are unavailable and untrusted code must not receive production data.

When a PR database is first created, the workflow aligns its schema with production-applied migrations. A production D1 export exists only as a transient GitHub Actions runner file; the workflow extracts and imports only the development user named by `PREVIEW_DEVELOPER_EMAIL` and the user's systems, tournaments, imports, history indexes, boards, evaluations, and referenced deals. It does not import other users, authentication sessions, or verification records. It also copies only the corresponding import objects to the preview R2 bucket. Branch-only migrations are then applied.

The preview Worker enables `PREVIEW_AUTO_LOGIN`. Opening the Web URL creates a fresh short-lived session for the copied development user and signs the visitor in automatically. The production Worker does not expose this endpoint.

> **Access warning:** Anyone who can open a preview URL can act as the development user. Protect preview URLs with Cloudflare Access or an equivalent control when the development user's data is sensitive.

Empty schemas, no migrations, and empty development-user data are all valid. Later pushes reuse the same preview resources and apply only new migrations. Closing the PR deletes the Worker, Pages deployment, D1 database, and R2 bucket idempotently.

Export temporarily blocks other requests to the source D1 database, so schedule unusually large snapshots with care.

## Required local acceptance checks

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
