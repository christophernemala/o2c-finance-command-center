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
4. Configure the Vercel Next.js preset and public environment variables. Verify
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
