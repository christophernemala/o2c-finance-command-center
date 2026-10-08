# Deployment qualification — 2026-10-08

## Release scope

PR #1 replaces the conflicting Vite/Flask template with the approved Next.js
App Router application. It preserves exact AED decimal amounts, tenant/entity
scope, independent maker/checker decisions, versioned evidence, idempotent
posting, and the existing Treasury database.

Authentication includes invited password setup, password login, real enabled
Google/Microsoft providers, PKCE callbacks, and verified TOTP challenges.
Enrolled MFA is enforced both by server routes and financial database access.
Identity profiles never grant workspace membership.

Agent analysis jobs durably queue and complete exact source-based AR analysis,
collection drafts, and treasury candidates. Jobs can be resumed after an
interrupted request. They never send customer messages or post financial journals.
Original validated CSV bytes are archived in private immutable application paths.

## Validation record

The 2026-10-05 revision passed 30 tests. The 2026-10-07 review repair passed 39.
These are historical counts, not the current suite count.

The current release gates are `npm run verify` and `npm audit`.
The 2026-10-08 source gates passed strict TypeScript, all 49 tests and a
production build; the dependency audit reported zero vulnerabilities.
Tests execute sequentially to avoid exhausting local embedded PostgreSQL memory.
The opt-in real Redis check is:
`node --env-file=.env.local --import tsx tests/login-limiter.integration.ts`.
It uses isolated expiring keys and passed live account/IP budgets, successful slot
release, and concurrent reservations on 2026-10-08.

The source-map-js transitive dependency is patched to 1.2.2; npm reported zero
vulnerabilities after installation. Local test fixtures never create hosted
financial records. Hosted JWT, MFA, email and financial workflow tests require
real users and source records.

## Database rollout

For a fresh dedicated staging project, apply files in filename order:
1. `202610040001_workspaces.sql`
2. `202610050001_insights.sql`
3. `20261006115901_user_profiles.sql`
4. `202610080001_release_hardening.sql`
5. `202610080002_agent_jobs.sql`
6. `202610080003_source_storage.sql`

For the confirmed live project `vaxsnungigkeqxaolqvo`, the first two already
exist. Apply only the missing profile and forward migrations. Do not rerun
foundation table creation on an existing database. Review `audit_report.md`
before DDL and verify policies/functions/ACLs after migration.
All four missing migrations applied successfully on 2026-10-08. Catalog checks
confirmed the updated source evidence/date definitions, authenticated-only RPC
EXECUTE, the private 1 MB CSV bucket with scoped SELECT/INSERT policies, and all
12 existing Treasury tables. The project still has zero Auth users.

## Hosting and operational gates

Vercel must build the repository root using Next.js, Node 22, npm ci and npm run
build. Both public Supabase variables and the server-only Redis/HMAC variables
must be configured. Production AUTH_SITE_URL must be the canonical HTTPS origin.
Preview callbacks use Vercel's injected VERCEL_URL; allow those precise deployment
origins in Supabase, never arbitrary request headers.

The confirmed Supabase project is ACTIVE_HEALTHY, with no real Auth users,
tenants, legal entities or memberships at audit time. A named real administrator,
company and legal entity are required for onboarding. Independently verify:
The live Auth settings currently enable email/password and public signup, while
Google and Microsoft are disabled. Disable public signup for the invitation-only
deployment after checking the shared project's other Auth consumers.

- Invitation delivery, password setup, login, refresh, logout, recovery and TOTP.
- Google/Microsoft credentials, callback allowlists and actual provider login.
- Ordinary JWT tenant/entity isolation and MFA bypass denial.
- Real private upload/read boundaries, approval evidence, independent decisions,
  double submit, concurrency, connection loss and duplicate retries.
- Governed source balances, forecast inputs and ECL runs.
- Workload latency, mobile/accessibility, monitoring, immutable archive,
  retention and tested backup/restore.

## Supported limits

Controlled CSV imports cover entirely unpaid invoices and bank lines. Historical
settlements, credits, FX, refunds, write-offs, period locks and full statutory GL
exports require separately governed implementations.

Collection drafts are not delivered. No LLM service, external worker scheduler,
two-way dunning inbox, ERP/bank connector, or automated allowance posting is
connected. DSO/CEI and credit limits require governed source inputs. Forecasts
use approved direct-method source runs rather than invented predictions.

A Ready deployment and passing source checks are independent of these live
operational gates. See `docs/REVIEW_AND_NEXT_STEPS.md` for the complete audit.

## Cloud development continuation — 2026-10-08

Source changes are published directly to GitHub. The repository now includes a
Node 22 Codespaces configuration and makes cloud setup the default documented
workflow. Existing Actions gates verify pushes and PRs remotely. This change does
not create a running Codespace: enumeration requires unavailable codespace API
scope. See `docs/CLOUD_WORKFLOW.md` for destinations and verification boundaries.
Live read-only checks confirmed the private CSV bucket, zero objects and zero
Auth users/memberships. The private Drive continuation ZIP exists and returned
owner-only permission metadata. No local copies were deleted.
