# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

The product is **Closewise** (formerly O2C Finance Command Center): agentic accounts receivable for UAE finance
teams. Rules live in `AGENTS.md`; follow it first. This file adds only what a coding session needs on top.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` (127.0.0.1:5174) |
| Full local check | `npm run verify` (typecheck, lint, test, build) |
| One test file | `npx tsx --test tests/<name>.test.ts` |
| Migrations | `DATABASE_MIGRATION_URL=<owner url> npm run db:migrate` |
| Real-PostgreSQL suites | `npm run test:postgres`, then `npm run test:postgres:http` (see below) |
| Schema doc | `npm run docs:schema` regenerates `docs/SCHEMA.md`; `tests/schema-doc.test.ts` fails if it drifts |

Real-PostgreSQL prerequisites: a disposable PostgreSQL 17 cluster used for nothing else, since the suites
create the `o2c_test_runtime` role (resetting its password if it exists) and leave test records behind. Point
`DATABASE_MIGRATION_URL` and `POSTGRES_TEST_ADMIN_URL` at it as a superuser, run `npm run db:migrate`, then
`npm run test:postgres` (creates the runtime role). The HTTP suite starts `next start`, so run `npm run build` first.
CI does exactly this against a throwaway service container.

Check each command's exit code: run `cmd; echo $?` to read it by hand. In a script, keep the status (`cmd; status=$?; echo "$status"; exit "$status"`) or chain with `&&`, because a trailing `echo` exits 0. Do not infer success from grepping output.
Lint has 5 pre-existing warnings and must have 0 errors.

CI (`.github/workflows`) runs, in order: `npm audit --audit-level=high`, typecheck, lint, test, build,
`db:migrate` twice (the second run must skip every file), and both PostgreSQL suites on postgres:17.

## Architecture

PostgreSQL is the enforcement point; the app and the UI are not. Read `docs/ARCHITECTURE.md` before changing a write path.

- **Every query goes through one allow-list.** `src/lib/postgres/client.ts` maps routine names to their parameter
  names; anything else throws. `transaction.ts` sets `o2c.session_hash` and `SET LOCAL ROLE authenticated` per
  pooled transaction, and `auth.uid()` resolves the user from the live session table. It refuses superuser,
  BYPASSRLS and owner roles. Writes are `SECURITY DEFINER` routines that re-check tenant/entity scope, role,
  record versions, limits and idempotency, and append to `audit_events`.
- **Maker/checker lives in SQL.** Proposals, approvals and posting are separate routines; the approver must be a
  different person. Roles are stored as `viewer`/`maker`/`approver`/`admin` (shown as Viewer, AR Clerk,
  AR Manager, Admin by `src/lib/roles.ts`). UI role checks only hide controls.
- **One workspace page.** `src/app/page.tsx` renders every view from `?view=` (the list is `workspaces` in
  `src/types/workspace.ts`), loading a scoped snapshot over RPC and passing it to `FinanceWorkspace`
  (`src/components/workspace.tsx`) or a view component. Mutations are form POSTs to `src/app/api/*/route.ts`,
  which check session, MFA and Origin, call a routine, then 303-redirect back with `?message=…&nonce=…`;
  the page shows the result in a `Toast`.
- **Agents.** `src/lib/ai`: each tool in `tools.ts` is a zod schema mapped to exactly one routine. `runner.ts`
  claims a queued run (from `/api/agents` via `after()`, or Vercel Cron at `/api/cron/agents`) under a non-human
  agent identity bound to that run, drives the tool loop in `loop.ts`, and records every step in append-only
  `agent_steps`, which the console streams over SSE. Agents propose; only `agent_auto_post` under an active,
  independently approved `agent_policies` row posts without a human checker. Guardrails (`guardrails.ts`) are
  checked before each tool call.
- **Auth** is app-managed (no Supabase): opaque HttpOnly session cookie, hashed in `auth.sessions`, TOTP MFA
  enforced in RLS, Upstash Redis rate limits that fail closed. Sessions have a `purpose` of `login` or `invitation`.

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
