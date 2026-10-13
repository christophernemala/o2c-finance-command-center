# O2C Finance Command Center

Authenticated finance operations using Next.js App Router, strict TypeScript,
Tailwind, direct PostgreSQL, app-managed sessions, and Decimal.js. The visual system follows the
user's Stripe reference: navy, violet, restrained gradients, and light/dark surfaces.

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
- Invited-account activation, scrypt password hashing, opaque HttpOnly sessions,
  encrypted TOTP enrollment and replay-protected second-factor challenges.
  No arbitrary local login, generated balances, default accounts, or seeded business data.
- Tenant membership and entity context on every protected request. PostgreSQL RLS
  protects reads; governed routines authorize financial writes, and private CSV archival uses scoped RLS.
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
  accessible tables, visible focus, reduced motion, and session-only theme selection.
- Durable scoped AR, collections and treasury analysis jobs use real source
  records; interrupted jobs can be resumed. Drafts and candidates require review.

## Local setup

1. Run `npm ci` and copy `.env.example` to `.env.local`.
2. Choose a standalone PostgreSQL database. Neon is recommended for Vercel.
3. Set the schema-owner `DATABASE_MIGRATION_URL`, then run `npm run db:migrate`.
   Migrations create no users or business records.
4. Create the restricted runtime login and set server-only `DATABASE_URL` and
   `MFA_ENCRYPTION_KEY`; see [PostgreSQL setup](docs/POSTGRESQL_MIGRATION.md).
5. Configure the Redis URL, token and separate HMAC secret, plus `AUTH_SITE_URL`.
6. A trusted administrator provisions the real tenant/entity and issues invitations:
   `npm run auth:invite -- '<WORK EMAIL>' '<TENANT UUID>' maker`.
   A separate approver is required for imports/posting; see
   [provisioning](docs/PRODUCTION_PROVISIONING.md). No default administrator exists.
7. Run `npm run dev` and open http://127.0.0.1:5174.

For local production previews only, set `AUTH_LOGIN_IP_SOURCE=loopback` and bind
to 127.0.0.1. Hosted production requires HTTPS and trusted Vercel edge headers.
Database, MFA and Redis credentials never use `NEXT_PUBLIC_` variables.

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
records. They do not establish live managed PostgreSQL, Vercel, email, or ERP connectivity.
The explicit `npm run test:postgres` suite additionally exercises real local
PostgreSQL sessions, pooled identity isolation, atomic source archival and MFA.
After building, `npm run test:postgres:http` tests Next.js auth over HTTP with
a test-only Redis transport. See the migration guide for disposable database setup.
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
- Hosted MFA qualification, billing, multi-currency, retention, performance,
  and disaster recovery require deployment-specific implementation and evidence.

Vercel uses the Next.js preset and the server-only variables in `.env.example`.
Never deploy the migration-owner connection. Inter, Sora and JetBrains Mono are
bundled through Next.js font handling. Google/Microsoft provider callbacks are
retired; this deployment supports invited email/password and TOTP. New OIDC login
requires a separate implementation. No hosted data was migrated by this source change.

See [migration and rollback](docs/POSTGRESQL_MIGRATION.md) before moving existing
users, financial records or private CSV originals. Preserve user UUIDs, exact
balances, approvals, digests and MFA; do not replay settled invoices as fresh imports.

## Maintainer

Christopher Nemala · Dubai, UAE
