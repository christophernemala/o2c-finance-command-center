# Deployment qualification

## Verified locally

TypeScript strict check, Next.js production build, decimal/parser tests and embedded
PostgreSQL migration/control tests. The browser can verify the sign-in theme and
connection-unavailable behavior without creating fake data.
The new insights migration and direct-method forecast are covered by embedded
PostgreSQL and decimal tests, including full-entity totals beyond the first page,
tenant isolation, immutable inputs, week boundaries, invalid dates and negative cash.
Redis transport tests use an HTTP double; live Lua/concurrency/expiry remain unverified.
The 2026-10-05 local revision passed strict TypeScript, all 29 tests, and a production
build. Browser checks confirmed light/dark switching, bundled Inter/Sora styles,
desktop and 390-pixel mobile layouts without horizontal overflow, unauthenticated
dashboard redirection, and no captured browser errors. HTTP checks confirmed
private/no-store responses, CSP nonces in rendered scripts, and cross-origin
sign-in rejection. The local preview intentionally disables sign-in until both
the finance backend and durable limiter are configured.

## Required before live promotion

1. Select the correct active Supabase project; review schema compatibility and backup.
2. Apply the migration in an isolated staging database, then verify it with real
   Supabase JWTs and at least two tenants. Embedded auth stubs are not live auth proof.
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
