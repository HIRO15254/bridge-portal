---
name: better-t-app-setup
description: Rename a project derived from Bridge Portal and prepare or verify its command-line Cloudflare deployment environment. Use when initializing the template, changing its slug or display name, configuring D1, Workers, Pages, or GitHub Actions with Bun, Wrangler, and GitHub CLI, or running deployment preflight checks. Do not use for product feature development or perform remote changes unless the user explicitly requests them.
---

# Better T App Setup

Use the repository's own scripts and deployment contract instead of duplicating their logic.

## Inspect the repository

1. Read `package.json`, `apps/server/wrangler.jsonc`, and the matching language in `docs/deploy.md` or `docs/deploy.ja.md`.
2. Check `git status --short` and preserve unrelated user changes.
3. Determine whether the request is to rename, prepare, verify, or actually deploy. Treat inspection, planning, and preflight requests as read-only for remote services.

## Rename the template

1. Require a kebab-case slug. Obtain a display name when the requested one cannot be inferred safely.
2. Preview the repository-wide replacement:

   ```sh
   bun run template:init -- <project-slug> --display-name "<Display Name>" --dry-run
   ```

3. Review the changed-path list. If the user asked to rename the project, run the same command without `--dry-run`.
4. Do not manually repeat the replacements. The initializer updates workspace scopes, imports, PWA metadata, Worker, Pages, D1, documentation, and this bundled skill. It intentionally does not create Cloudflare resources, assign a D1 UUID, or change Git remotes.
5. The initializer refuses a second run. If the repository is already initialized, inspect the current state and ask before attempting a manual rename because that is a different operation.
6. Run `bun install --frozen-lockfile`, `bun run cf:typegen`, and `bun run check-types` after a real rename. Include broader acceptance checks when the request includes deployment readiness.

## Prepare or verify deployment

Read [references/cloudflare-cli.md](references/cloudflare-cli.md) before running Cloudflare or GitHub CLI commands. Follow its preflight, provisioning, repository configuration, validation, and deployment order.

Remote resource creation, repository settings changes, migrations against remote D1, and deployments are external mutations. Execute them only when the user explicitly requests the corresponding setup or deployment. Never print, read back, or commit secret values.

## Report completion

State:

- the final slug, display name, workspace scope, and Cloudflare resource names;
- files changed and checks run;
- remote resources or GitHub settings changed, without secret values;
- remaining manual steps or blockers.
