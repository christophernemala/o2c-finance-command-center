# CLAUDE.md

Rules live in `AGENTS.md`; follow it first. This file adds only what a coding session needs on top.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` (127.0.0.1:5174) |
| Full local check | `npm run verify` (typecheck, lint, test, build) |
| One test file | `npx tsx --test tests/<name>.test.ts` |
| Migrations | `DATABASE_MIGRATION_URL=<owner url> npm run db:migrate` |
| Real-PostgreSQL suites | `npm run test:postgres`, `npm run test:postgres:http` (need `POSTGRES_TEST_ADMIN_URL`) |
| Schema doc | `npm run docs:schema` regenerates `docs/SCHEMA.md`; `tests/schema-doc.test.ts` fails if it drifts |

Check each command's exit code (`cmd; echo $?`). Do not infer success from grepping output.
Lint has 5 pre-existing warnings and must have 0 errors.

CI (`.github/workflows`) runs, in order: `npm audit --audit-level=high`, typecheck, lint, test, build,
`db:migrate` twice (the second run must skip every file), and both PostgreSQL suites on postgres:17.

## Layout

- `src/app`: App Router pages and `api/` route handlers. Every POST checks Origin and bounds the body.
- `src/lib/postgres`: the only database access path (`financeClient`, allow-listed routines).
- `src/lib/ai`: Claude agents, tools, loop, runner and copilot (see `docs/ARCHITECTURE.md`).
- `src/lib/auth`, `src/lib/auth-flow.ts`: app-managed sessions, TOTP, email codes, OIDC.
  `authSiteOrigin()` is the stable origin, used for OAuth redirects. `authRequestOrigin()` also
  accepts the per-deployment Vercel preview host, for form posts.
- `src/lib/money.ts`, `src/lib/currency.ts`, `src/lib/time.ts`: money is decimal strings via
  decimal.js; never use Number.
- `src/components/ui`: design system (`ds.tsx`, `overlay.tsx`, `controls.tsx`, exported from `index.tsx`).
  Reuse these before adding components.
- `postgres/migrations`: timestamp-named SQL. The runner records checksums, so **never edit an
  applied migration**; add a new file.
- `tests`: node:test via tsx. `pg-helper.ts` gives an embedded PGlite with all migrations applied.
  happy-dom is used for interaction tests. `*.integration.ts` files need a real PostgreSQL.

## Working rules for sessions

- Never merge a PR without the owner's explicit "yes, merge".
- Never change production env vars, or run anything that alters or deletes existing data. Stop and ask first.
- Never disable or skip lint rules or tests, and never hardcode keys or secrets.
- Third-party UI code needs an entry in `docs/THIRD_PARTY_NOTICES.md`.
- Update `docs/TRACKER.md` and `docs/RELEASE.md` when scope changes. Record what was verified
  locally separately from what was verified live.
