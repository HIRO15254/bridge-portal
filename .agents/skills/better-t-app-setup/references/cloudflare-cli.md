# Cloudflare CLI deployment setup

Use this reference only after inspecting the current repository. Prefer the checked-in scripts and workflow order whenever they differ from generic examples.

## Resource contract

Read the slug from the root `package.json`. For a slug named `<slug>`, the template uses:

- Worker: `<slug>-api`
- Pages project: `<slug>`
- D1 database: `<slug>-db`
- D1 binding: `DB`
- Wrangler configuration: `apps/server/wrangler.jsonc`
- D1 migrations: `packages/db/src/migrations`
- production branch: `master`

The root initializer updates these names but does not create resources or fill in the D1 UUID.

## Read-only preflight

Run from the repository root unless a command says otherwise:

```sh
bun --version
bunx wrangler --version
bunx wrangler whoami
gh auth status
git status --short
bun install --frozen-lockfile
```

Check that Wrangler is version 4, the correct Cloudflare account is selected, GitHub CLI targets the expected repository, `wrangler.jsonc` names match the slug, and the D1 UUID is not the all-zero placeholder before any remote migration or deploy.

Authentication may require the user to complete an interactive browser flow. Do not request, display, or store access tokens in repository files.

## Provision Cloudflare resources

Only perform this section when the user explicitly asks to create or configure the deployment environment. Resolve existing resources before creating new ones:

```sh
bunx wrangler d1 list
bunx wrangler pages project list
```

Create a missing production D1 database and Pages project:

```sh
bunx wrangler d1 create "<slug>-db"
bunx wrangler pages project create "<slug>" --production-branch master
```

Copy the D1 UUID returned by Wrangler into only `d1_databases[0].database_id` in `apps/server/wrangler.jsonc`. Preserve `binding`, `database_name`, `migrations_dir`, and the rest of the configuration. Run `bun run cf:typegen` after changing the file.

The Worker does not need a separate creation command; its first authorized `wrangler deploy` creates it. Do not create duplicate D1 or Pages resources when matching names already exist. Never delete or replace a remote resource without a separate explicit request.

## Configure GitHub Actions

The checked-in workflows require these repository variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `PRODUCTION_WEB_URL`, the exact browser origin allowed by CORS
- `PRODUCTION_API_URL`, the Worker base URL embedded into the web build

They also require the `CLOUDFLARE_API_TOKEN` Actions secret. The token must have the account permissions described in `docs/deploy.md` for Workers Scripts, Pages, and D1.

After resolving real values with the user, configure the current repository:

```sh
gh variable set CLOUDFLARE_ACCOUNT_ID --body "<account-id>"
gh variable set PRODUCTION_WEB_URL --body "<web-origin>"
gh variable set PRODUCTION_API_URL --body "<worker-base-url>"
gh secret set CLOUDFLARE_API_TOKEN
```

Use the interactive `gh secret set` prompt so the token is not placed in shell history or command output. Do not invent URLs, account IDs, or credentials. Verify names with `gh variable list` and `gh secret list`; these commands show metadata, not secret values.

## Local acceptance checks

Run the repository's complete preflight before an actual deployment:

```sh
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

An empty migration directory is a valid initial state. Stop and report any failed check instead of deploying around it.

## Command-line production deployment

Prefer the checked-in `master` workflow for normal production delivery. If the user explicitly asks for a direct CLI deploy, preserve the same order:

1. Complete all local acceptance checks.
2. Apply remote D1 migrations with `bun run db:migrate:remote`. This is a no-op when no SQL migrations exist.
3. Deploy the Worker from `apps/server`, passing the exact production web origin:

   ```sh
   cd apps/server
   bunx wrangler deploy --var "CORS_ORIGIN:<production-web-origin>"
   cd ../..
   ```

4. Build the web app with the deployed Worker URL. Read the current workspace scope from `apps/web/package.json`; after initialization it is `@<slug>/web`:

   ```sh
   VITE_SERVER_URL="<production-api-url>" bun run --filter "@<slug>/web" build
   ```

5. Deploy Pages:

   ```sh
   bunx wrangler pages deploy apps/web/dist --project-name "<slug>" --branch master
   ```

Record deployed URLs and resource names, but never credential values. Do not automatically roll back, clean up, or delete resources after a failure; report the exact completed stage and ask before destructive remediation.
