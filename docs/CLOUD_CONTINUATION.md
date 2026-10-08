# O2C cloud continuation

## Maintained source and evidence

Continue from this repository's `master`, rather than combining old login forks
or restoring the retired Vite/Flask application. On 8 October 2026 the reviewed
source `f826b9f` was merged as `ab9b4e1`. This handoff adds documentation only.

The canonical deployment is
[O2C Finance Command Center](https://o2c-finance-command-center-app.vercel.app/login).
The public login page returned HTTP 200 during the consolidation check. That
check proves page availability, not successful account login or financial
workflow completion. The latest release audit reported zero real Auth users,
tenants, legal entities and memberships; refresh those counts before onboarding.

`docs/RELEASE.md` records the 49 passing source tests, strict TypeScript,
production build, dependency audit, database rollout and remaining live gates.
Those are historical release results, not checks rerun by this documentation PR.
`docs/REVIEW_AND_NEXT_STEPS.md` contains the detailed qualification record.
See [AR/O2C architecture](AR_O2C_ARCHITECTURE.md) for the current cloud ownership,
visible analysis queue, source-to-approval boundaries and lifecycle roadmap.

## Production contracts to preserve

- Next.js App Router, strict TypeScript, Tailwind and Supabase SSR are the active
  stack. Reuse the existing UI, Supabase utilities and workspace types.
- Transport monetary values as decimal strings and calculate through
  `src/lib/money.ts` using Decimal.js. Do not convert financial values to Number.
- `public.memberships` authorizes tenant access; legal entities provide further
  scope. `workspace_access()` exposes the authenticated access context. Supported
  roles are `viewer`, `maker`, `approver` and `admin`.
- Profiles contain identity/display attributes and never grant finance access.
  Do not introduce an `owner` role or replace memberships with profile metadata.
- Keep tenant/entity RLS, independent maker/checker decisions, version checks,
  transaction boundaries, idempotent posting and private source evidence.
- Use real Auth and governed source rows. No default accounts, generated
  invoices, balances, company records or simulated successful authentication.

The reviewed release includes these forward migrations, reported applied to the
live project on 8 October: `20261006115901_user_profiles.sql`,
`202610080001_release_hardening.sql`, `202610080002_agent_jobs.sql` and
`202610080003_source_storage.sql`. Inspect remote migration history and catalogs
before applying anything. Do not replay foundation migrations on an existing
shared database. The existing Treasury tables must remain intact.

## Figma light redesign and legacy design reference

The current direction is a premium light workspace with an iOS-like visual
language, using the user's [Stripe reference](https://stripe.com/en-nl).
Use light surfaces throughout; do not introduce dark or black surface themes.
The editable draft is
[O2C Finance — Premium Light Workspace](https://www.figma.com/design/ObzRP2ESHCtlyzjFqAOhCT).
Its screens are still being built. The draft has not been integrated into the
application or deployed. Treat the draft as work in progress, not a completed
visual or accessibility review. Mobbin references were not reviewed because
the reference tool request failed.

The inspected legacy Lovable reference is
[Finance Control Hub (20)](https://lovable.dev/projects/d72b65b2-acf1-400d-928a-b8872454eb8d).
Its Vite frontend includes simulated login and generated finance records in
`src/lib/mockData.ts`. It is a design reference, not proof of a prepared
production backend. Its design has not yet been ported into this repository.
The Figma light redesign now guides visual integration. Preserve useful legacy
layout observations without importing simulated behavior or generated records.

The next implementation should:

1. Complete and audit the Figma light screens at desktop/mobile sizes, keyboard
   focus, contrast, form errors, tables, motion and empty/error/loading states.
   Update `DESIGN.md` and `STYLEGUIDE.md` with the approved light visual system.
2. Port layout, spacing, typography and navigation into existing Next components.
   Remove simulated login, generated data and unsupported certification claims
   from the active application. Keep Supabase SSR login and membership checks.
3. Bind screens to existing scoped server snapshots and governed write paths.
   Show unavailable metrics when their approved inputs are absent. DSO/CEI,
   forecasts and ECL must not be invented to fill a design.
4. Run source gates, inspect a hosted preview, then test real invited-user login,
   MFA and ordinary-JWT tenant/entity isolation with independent users. Obtain
   governed records for approval/posting tests before qualifying production.

## Run and continue in cloud

Clone the GitHub repository into the cloud workspace, use Node 22, run `npm ci`,
and configure the variable names documented in `.env.example` through the
cloud platform's secret store. Never commit `.env.local`, credentials, database
dumps or private chat transcripts. No Windows source path is required at runtime.
The current development/start scripts bind to loopback; use a supported cloud
preview proxy or intentionally configure the preview binding for that host.

Run `npm run verify` and `npm audit`. Record source checks separately from live
Supabase Auth/RLS, Redis, uploaded evidence and hosted workflow checks. Existing
Google/Microsoft providers were disabled in the latest audit; real provider
login remains pending. Public signup and shared-project Auth consumers need
review before changing invitation-only settings.

Keep the private consolidation archive as historical context. Do not copy its
old source variants over this checkout. Source archival, a Ready deployment and
an HTTP 200 login page do not establish complete operational readiness.
