# O2C Finance Command Center

**[Start here: project index, cloud locations and remaining launch work](START_HERE.md).**

Authenticated finance operations using Next.js App Router, strict TypeScript,
Tailwind, Supabase SSR, PostgreSQL, and Decimal.js. The proposed light visual system uses pearl surfaces, ink and slate text,
purple accents, and teal status colors.

## Implemented

- Ten workspaces: overview, customers, receivables, 13-week cashflow, cash
  application, ECL review, approval inbox, agent activity, import review, and audit explorer.
- Stable product routes for `/dashboard`, `/customers`, `/invoices`, `/cashflow`,
  and `/reconciliation`; each route uses the same authenticated server snapshot.
- Six custom SVG charts show full-entity aging, settlement, disputes, collections,
  statement direction, and approval states, with exact values available as text.
- Thirteen-week direct-method cash forecasts calculate exact weekly opening,
  incoming, outgoing, operating/investing/financing net, and closing cash from
  preserved independently reviewed source records. Forecasts never post journals.
- Zod validates credentials and command envelopes on the server. Durable Redis
  protection allows at most five failed/in-flight account attempts in a sliding
  15-minute window and 30 failed/in-flight attempts per trusted Vercel IP. Successful
  membership verification releases that attempt's account and IP slots; outages fail closed.
- Invited-account password activation, PKCE Google/Microsoft authentication when
  providers are enabled, and verified TOTP challenges validated by Supabase.
  No arbitrary local login, generated balances, default accounts, or seeded business data.
- Tenant membership and entity context on every protected request. PostgreSQL RLS
  protects direct reads; scoped RPCs are the only application write path.
- AED `numeric(15,2)` records, exact decimal-string contracts, Decimal.js arithmetic,
  and currency formatting without converting amounts to JavaScript Number.
- Incoming receipt and cash-allocation proposals, independent approval, separate
  posting, row/version locks, revoked-approver checks, idempotent retries, and audit evidence.
- UTF-8 CSV imports with explicit column mapping, 1 MB / 2,000-row limits, rejected-row
  details, control totals, preserved payload digests, private original CSV storage,
  independent review, and atomic commits.
- XLSX export reuses the existing workbook writer. It explicitly exports the first
  50 invoice records, with scope metadata and full-entity totals in a separate sheet.
- Server-rendered scoped navigation, pagination, explicit empty/unavailable states,
  accessible tables, visible focus, reduced motion, and a consistent light theme.
- Durable scoped AR, collections and treasury analysis jobs use real source
  records; interrupted jobs can be resumed. Drafts and candidates require review.

## Cloud setup (default)

Use [the cloud workflow](docs/CLOUD_WORKFLOW.md) and the checked-in
`.devcontainer/devcontainer.json` to develop in GitHub Codespaces.
Source stays in GitHub, verification runs in cloud CI, hosting uses Vercel, and
financial records/original CSV files stay in private Supabase storage.
Private continuation archives belong in private Google Drive.

Configure required staging secrets in Codespaces and hosted secrets in Vercel.
Use only the intended Supabase publishable key in this app; never a service-role
key. Review existing migrations before applying missing forward changes to the
confirmed project. Never rerun foundation creation on an existing database.

A trusted administrator must invite real users and provision tenant, AED legal
entity and memberships. A maker and independent approver are required for
imports and posting. Configure invitation redirects, password policies, recovery,
Redis and the canonical `AUTH_SITE_URL` for the deployment. See
[production provisioning](docs/PRODUCTION_PROVISIONING.md) and
[security controls](docs/SECURITY.md).

Missing credentials produce a connection-unavailable screen with sign-in disabled.
An authenticated account without membership cannot enter any financial workspace.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run start
```

Tests use disposable fixtures exclusively in an embedded PostgreSQL runtime,
including RLS, direct-write denial, self-approval rejection, debit rejection,
idempotency, stale allocations, revoked authority, atomic imports, and append-only
records. They do not establish live Supabase, Vercel, email, or ERP connectivity.
The opt-in live Redis integration check uses isolated expiring keys:
`node --env-file=.env.local --import tsx tests/login-limiter.integration.ts`.
The recorded live check passed budgets, release and concurrency. This does not
establish real user authentication or financial workflow verification.

## Source files

Invoice CSV headers:
`number,account,customer,issued_at,due_date,amount,currency`

Bank CSV headers:
`reference,booked_at,direction,amount,currency`

Use exact positive decimals, ISO dates, and currency `AED`. Bank direction is
`credit` or `debit`; debits can never create incoming receipts. Import only
**entirely unpaid** source-system invoices. Partially paid opening balances,
credit notes, reversals, closed periods, and historical allocation migration
require a separately reviewed migration rather than fabricated settlement.

## Deployment and material limitations

This is a tested production foundation, not a claim that a live enterprise SaaS
deployment has been validated. See `docs/RELEASE.md` for concrete release gates.

- ECL workspaces display externally supplied preserved measurement runs. There is
  no calibrated ECL engine, automatic allowance posting, or default loss-rate matrix.
- DSO and CEI remain unavailable until governed sales and collection-period inputs
  are connected. Cashflow reads approved `cashflow_runs` supplied by a trusted source
  integration; see `docs/CASHFLOW_INPUTS.md`. Confidence is displayed only with an
  approved percentage and methodology, never inferred from a mixed-unit delay/score.
- Agent workspaces run durable source-based analysis and display external domain
  activity separately. No LLM service, external worker scheduler, customer-message
  sender, or ERP/bank adapter is connected.
- The cash-control journal records equal debit/credit amounts per posting. It is
  not a full statutory GL: period locks, tax, FX, write-offs, refunds, credit-limit
  amendments, reversals, and ERP journal export remain outside supported commands.
- Invoice imports register source-system receivables; they do not recognize revenue.
- Audit records resist application updates/deletes. Database administrators can
  still alter the database; an external immutable archive and recovery controls
  are required before making a tamper-proof audit claim.
- Input is controlled CSV. The unsafe permissive XLSX upload parser and fabricated
  PDF/proof/SLA generators were removed. XLSX **export** remains available.
- Live MFA/social-provider qualification, billing, multi-currency, retention, performance,
  and disaster recovery require deployment-specific implementation and evidence.

The deployment framework changes from Vite to Next.js. Vercel must use the Next.js
preset, the two public Supabase variables, and three server-only Redis/HMAC variables.
Inter, Sora, and JetBrains Mono are bundled through Next.js font handling.
Do not promote the branch
while the database connection, migration, onboarding, and live checks are incomplete.

## Supabase infrastructure audit

Use the repository skill at
`.agents/skills/supabase-principal-architect-infrastructure-optimization/SKILL.md`
for audit-first RLS/index/cron/Realtime/webhook work. Its packaged SQL reads catalog
metadata without financial records or DDL. See [audit_report.md](audit_report.md)
for current source findings and live-provider blockers; no index change or speculative
integration migration is included without actual deployed workload evidence.

## Maintainer

Christopher Nemala · Dubai, UAE

