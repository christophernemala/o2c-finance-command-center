# O2C Finance Command Center

Authenticated finance operations using Next.js App Router, strict TypeScript,
Tailwind, Supabase SSR, PostgreSQL, and Decimal.js. The visual system follows the
user's Stripe reference: navy, violet, restrained gradients, and light/dark surfaces.

## Implemented

- Eight workspaces: overview, receivables, cash application, ECL review, approval
  inbox, agent activity, import review, and audit explorer.
- Invited-account password authentication validated by Supabase on the server.
  No arbitrary local login, generated balances, default accounts, or seeded business data.
- Tenant membership and entity context on every protected request. PostgreSQL RLS
  protects direct reads; scoped RPCs are the only application write path.
- AED `numeric(15,2)` records, exact decimal-string contracts, Decimal.js arithmetic,
  and currency formatting without converting amounts to JavaScript Number.
- Incoming receipt and cash-allocation proposals, independent approval, separate
  posting, row/version locks, revoked-approver checks, idempotent retries, and audit evidence.
- UTF-8 CSV imports with explicit column mapping, 1 MB / 2,000-row limits, rejected-row
  details, control totals, preserved payload digests, independent review, and atomic commits.
- XLSX export reuses the existing workbook writer. It explicitly exports the first
  50 invoice records, with scope metadata and full-entity totals in a separate sheet.
- Server-rendered scoped navigation, pagination, explicit empty/unavailable states,
  accessible tables, visible focus, reduced motion, and theme preferences only in local storage.

## Local setup

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local`. Set the project URL and **publishable** key
   from the intended active Supabase project. Never use a service-role key in this app.
3. Apply `supabase/migrations/202610040001_workspaces.sql` to a dedicated database
   after reviewing conflicts with any existing schema. It creates no business records.
4. Invite at least two real users through Supabase Auth. A trusted database
   administrator provisions the tenant, legal entity, and memberships. A maker
   and independent approver are required for imports and financial posting.
5. Disable public signup in Supabase; configure invited-user redirects, password
   policies, abuse protections, and recovery delivery for the actual deployment.
6. Run `npm run dev` and open http://127.0.0.1:5174.

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
- Agent workspaces display recorded runs. No model provider, worker runtime,
  customer-message sender, or ERP/bank adapter is connected by this change.
- The cash-control journal records equal debit/credit amounts per posting. It is
  not a full statutory GL: period locks, tax, FX, write-offs, refunds, credit-limit
  amendments, reversals, and ERP journal export remain outside supported commands.
- Invoice imports register source-system receivables; they do not recognize revenue.
- Audit records resist application updates/deletes. Database administrators can
  still alter the database; an external immutable archive and recovery controls
  are required before making a tamper-proof audit claim.
- Input is controlled CSV. The unsafe permissive XLSX upload parser and fabricated
  PDF/proof/SLA generators were removed. XLSX **export** remains available.
- MFA/SSO, billing, multi-currency, retention policies, performance qualification,
  and disaster recovery require deployment-specific implementation and evidence.

The deployment framework changes from Vite to Next.js. Vercel must use the Next.js
preset and the two public Supabase environment variables. Do not promote the branch
while the database connection, migration, onboarding, and live checks are incomplete.

## Maintainer

Christopher Nemala · Dubai, UAE
