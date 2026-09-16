# Bridge Portal agent guide

This file is the source of truth for every coding agent working in this repository.

## Stack

- Bun workspace with TypeScript
- React, Vite, TanStack Router and Query, tRPC, Tailwind CSS, shadcn/ui, and PWA support
- Hono Worker with tRPC
- Cloudflare D1 through Drizzle ORM
- Vitest for all automated tests

## Commands

- `bun install --frozen-lockfile`: install the pinned workspace
- `bun run dev`: run all development servers
- `bun run check-types`: type-check every workspace
- `bun run check`: run formatting and lint checks
- `bun run test`: run every Vitest project
- `bun run test:coverage`: run the coverage suite
- `bun run check:test-discovery`: verify each test belongs to exactly one project
- `bun run build`: build all applications
- `bun run cf:typegen`: regenerate Cloudflare binding types after changing `wrangler.jsonc`
- `bun run db:generate`: generate a D1 migration after changing the schema
- `bun run db:migrate:local`: apply migrations to the local D1 database
- `$better-t-app-setup`: use the bundled repository skill for template renaming and command-line Cloudflare deployment setup

## Package boundaries

- `apps/web` owns browser UI and browser-only integration.
- `apps/server` owns the Hono Worker, HTTP concerns, CORS, and tRPC transport.
- `packages/api` owns tRPC procedures and context types. It may depend on `packages/db`.
- `packages/db` owns the D1 `Database` type, schema, and migrations.
- `packages/env` owns public web environment validation.
- `packages/config` owns shared TypeScript configuration.
- Shared behavior belongs in a package only when at least two consumers need it.

## Tests

- Keep tests beside the source in `__tests__` directories.
- Use `.test.tsx` for DOM tests and `.test.ts` for non-DOM web tests.
- Server, API, DB, env, and script tests must remain in their corresponding Vitest projects.
- A new test directory or suffix must also be reflected in `vitest.config.ts` and the discovery check.

## Linear work tracking

After the Linear MCP connection is configured, Linear is the system of record for
actionable follow-up work discovered during development.

- Before creating an issue, search Linear for an existing issue that covers the
  same problem. Update or link the existing issue instead of creating a duplicate.
- Create an issue when the follow-up is concrete, independently actionable, and
  not completed as part of the current request. Do not create issues for vague
  ideas, optional polish, or observations without a clear next action.
- Include the problem, affected code or behavior, the discovery context, and
  acceptance criteria. Include relevant test or verification expectations.
- Keep the issue in the configured engineering team and use the workspace's
  agreed labels, priority, and project when those are known. Ask when the target
  team or project is ambiguous rather than guessing.
- Treat creating or updating Linear issues as a remote write: use the connected
  Linear MCP tools and honor their approval requirements. Never put secrets,
  tokens, or private customer data into an issue.
- At handoff, link any created or updated Linear issues and update the current
  issue's status only after the requested work and its verification are complete.

## Template boundary

This repository intentionally contains only a health-check application and reusable development, test, D1, and Cloudflare delivery infrastructure. Do not add product-specific features, identity systems, external intelligence integrations, vendor project-management automation, or multi-branch release conventions unless a derived project explicitly requires them.

Keep upstream borrowing manual and review every change against this boundary. Do not add a pinned upstream revision or automatic synchronization.
