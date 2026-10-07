# Deployment qualification

## Verified locally

The receivables workbook now includes full-entity aging totals, the source customer
directory, and first-page invoice details with aging/status and separate page control
totals. Detail remains limited to 50 invoices. No customer balances, source invoices
or invoice PDFs were generated. See `docs/SOURCE_DATA.md` for source requirements.

TypeScript strict check, Next.js production build, decimal/parser tests and embedded
PostgreSQL migration/control tests. The browser can verify the sign-in theme and
connection-unavailable behavior without creating fake data.
The new insights migration and direct-method forecast are covered by embedded
PostgreSQL and decimal tests, including full-entity totals beyond the first page,
tenant isolation, immutable inputs, week boundaries, invalid dates and negative cash.
Redis transport tests use an HTTP double; live Lua/concurrency/expiry remain unverified.
The 2026-10-05 local revision passed strict TypeScript, all 30 tests, and a production
build. Browser checks confirmed light/dark switching, bundled Inter/Sora styles,
desktop and 390-pixel mobile layouts without horizontal overflow, unauthenticated
dashboard redirection, and no captured browser errors. HTTP checks confirmed
private/no-store responses, CSP nonces in rendered scripts, and cross-origin
sign-in rejection. The local preview intentionally disables sign-in until both
the finance backend and durable limiter are configured.

The 2026-10-07 PR review repair passed strict TypeScript, all 39 tests with
`npx tsx --test --test-concurrency=1 tests/*.test.ts`, and the production build.
Regression coverage includes reader-independent table ACLs and effective RPC
EXECUTE access, successful sign-in release of both limiter reservations,
per-workspace pagination, canonical import dates, insights migration rollback,
and joined approval evidence with captured/current versions and stale controls.
An overlapping build/test run exceeded local memory; the sequential suite passed.
Redis tests still use a transport double; live Lua/concurrency remain unverified.
`npm audit --omit=dev` reports one existing high-severity `source-map-js` advisory;
dependency files are unchanged by this review repair.

## Required before live promotion

The infrastructure audit package additionally passed skill validation, read-only
catalog tests, strict TypeScript, all 30 tests and the production build. The named
Supabase project still reports INACTIVE; live RLS/cron/index/Realtime/webhook evidence
is unavailable. See `audit_report.md`; no optimization DDL or integration deployment
has been applied.

1. Select the correct active Supabase project; review schema compatibility and backup.
2. Apply `202610040001_workspaces.sql` followed by `202610050001_insights.sql`
   from `supabase/migrations/` in an isolated staging database, then verify with real
   Supabase JWTs and at least two tenants. Embedded auth stubs are not live auth proof.
   If staging already applied these files, deploy the revised `workspace_snapshot`
   and `stage_import` definitions through a reviewed forward migration before this
   application revision. Do not rerun table-creation migrations on populated schemas.
3. Invite real maker/checker users and provision their tenant/entity memberships.
   Verify sign-in, refresh, recovery, logout and role revocation end-to-end.
   Configure the three server-only Redis/HMAC variables from `.env.example` and
   exercise the actual five-attempt policy across instances and during outages.
4. Confirm Vercel builds from the repository root with `vercel.json` (Next.js,
   `npm ci`, `npm run build`, framework-default output), Node.js 22, and the public
   environment variables. Verify
   actual deployment headers, redirects, CSRF rejection, cookie persistence and no caching.
5. Exercise receipt/import/approval/allocation workflows with authorized source data.
   Verify browser double-submit, parallel clients, connection loss and duplicate retries.
6. Confirm source data opening balances. This importer supports unpaid invoices;
   migrate credits, prior allocations and reversals through a reviewed separate process.
7. Supply governed ECL runs and agent integrations if those workspaces are enabled.
   Add external audit archiving, monitoring, recovery tests and retention policies.
   Supply approved cashflow source runs following `docs/CASHFLOW_INPUTS.md` and
   reconcile opening/closing cash with the reviewed source model.
8. Verify keyboard/screen-reader access, contrast, mobile tables, real workload latency
   and pagination using the authenticated staging deployment.

## Unsupported until explicitly implemented

Calibrated ECL calculation/posting, customer dunning delivery, ERP/bank connectors,
credit-limit changes, settlements/write-offs, refunds, reversals, general-ledger
period locking, FX/multi-currency, SSO/MFA enforcement, SaaS billing, document storage,
full-dataset exports, and compliance certification.

Do not substitute demo data for any missing integration. Do not promote merely
because the local build passes. Verify the matching Lovable project before sending
editing instructions; a similarly named finance project is not sufficient evidence.

## Current provider verification

The initial branch commit passed both GitHub verification runs, but both connected
Vercel projects reported failed previews. After explicit Next.js build settings
were added in commit `59e40f0`, both projects reported Ready and both GitHub
verification runs passed. The original build errors were not accessible: the
connector returned 403 for `christophers-projects-896fb086`.

The `o2c-finance-command-center-app` branch preview is
https://o2c-finance-command-c-git-82dad6-christophers-projects-896fb086.vercel.app.
The initial browser check reached deployment protection and two-factor sign-in.
On 2026-10-05, commit `0e387d3` passed both GitHub verification runs and both Vercel
previews reported Ready. The existing browser session opened the hosted application:
login light/dark switching, Inter/Sora styles, 390-pixel mobile layout without
horizontal overflow, and unauthenticated dashboard redirection passed with no
captured browser errors. Sign-in remains disabled because required provider
configuration is absent. Requests without that browser session still reach Vercel
deployment protection, so unauthenticated HTTP probes did not verify application
headers. Live Supabase/Redis and authenticated finance workflows remain unverified.
Complete those gates before promotion; a Ready deployment status is insufficient.
