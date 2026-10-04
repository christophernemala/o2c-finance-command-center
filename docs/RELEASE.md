# Deployment qualification

## Verified locally

TypeScript strict check, Next.js production build, decimal/parser tests and embedded
PostgreSQL migration/control tests. The browser can verify the sign-in theme and
connection-unavailable behavior without creating fake data.

## Required before live promotion

1. Select the correct active Supabase project; review schema compatibility and backup.
2. Apply the migration in an isolated staging database, then verify it with real
   Supabase JWTs and at least two tenants. Embedded auth stubs are not live auth proof.
3. Invite real maker/checker users and provision their tenant/entity memberships.
   Verify sign-in, refresh, recovery, logout and role revocation end-to-end.
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
Vercel projects reported failed previews. The Vercel connector returned 403 for
`christophers-projects-896fb086`, and the browser required sign-in, so the build
errors could not be inspected. The repository now declares Next.js build settings
explicitly; this is not evidence that those preview failures are resolved. Inspect
the latest deployment logs and verify a ready preview before promotion.
