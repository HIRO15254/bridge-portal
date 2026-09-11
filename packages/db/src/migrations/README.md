# Database migrations

The template intentionally starts with an empty application schema. Add tables
under `packages/db/src/schema.ts`, then run `bun run db:generate` to create the
first migration in this directory.
