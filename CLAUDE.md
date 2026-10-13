# BugBoard

Next.js App Router (`app/`) in front of a legacy Express API (`legacy/api/`, raw SQL via `pg`). `app/api/[...path]/route.ts` forwards every `/api` request to Express in-process; server components call it through `lib/api.ts`. Postgres 17, schema and migrations in `db/` (Drizzle).

- Commands: `npm run lint`, `npm run typecheck`, `npm test` (needs `DATABASE_URL`), `npm run e2e`.
- Local DB: `docker compose up -d --wait db`, then `npm run db:migrate && npm run db:seed`.
- Tests hit a real Postgres. Don't mock the database.
- New column or table: edit `db/schema.ts`, run `npm run db:generate`, commit the migration.
- Never edit `.github/`, `factory/`, `factory.config.yml` or `.claude/` from a ticket.
