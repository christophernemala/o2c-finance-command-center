# O2C Finance Command Center

An agentic accounts-receivable (order-to-cash) platform for UAE finance teams. AI
agents read the ledger, propose cash application, draft collections, screen credit
risk and write management reports. Every step they take is recorded and visible.
Every money movement still goes through PostgreSQL-enforced maker/checker
controls. The one exception is policy auto-posting: two humans can approve a
policy that lets the agent post exact matches within AED limits.

Stack: Next.js 16 App Router, strict TypeScript, Tailwind 4, direct PostgreSQL
(RLS + `SECURITY DEFINER` routines), app-managed sessions with TOTP, Decimal.js,
Anthropic Claude API (server-side tool use), Vercel.
Default currency is AED. Time zone is Asia/Dubai.

> **What this is:** a working, tested product foundation that you can deploy and pilot.
> **What it is not yet:** a certified enterprise SaaS. See [What is not built](#what-is-not-built)
> and [docs/ROADMAP.md](docs/ROADMAP.md).

## What works

| Area | Capability |
|---|---|
| **AI agents** (`/?view=agents`) | Four agents run on demand or daily via Vercel Cron: **Cash application**, **Collections**, **Credit risk** and **Reporting**. Each runs a Claude tool-use loop under its own non-human database identity. Reasoning summaries, tool calls, results, proposals and posting decisions stream live into the Agent Console, which also shows token cost per run. |
| **Autonomy policy** | Off by default. An admin proposes per-item and daily AED limits and a *different* approver activates them. Within those limits, the cash application agent may auto-post **exact** matches (bank reference = invoice number and amount = open balance). Everything else waits in the Approval inbox. |
| **Copilot** (`/?view=copilot`) | Chat over live ledger data, streamed. The copilot calls the same scoped tools as the agents, under *your* role. Attach a **CSV or Excel (.xlsx)** file and ask questions about it. Conversations are stored per user in PostgreSQL, never in browser storage. |
| **Reports** (`/?view=reports`) | AR pack computed in SQL: aging (Current / 1-30 / 31-60 / 61-90 / 91-180 / 180+), **countback DSO**, **30-day CEI** (with its inputs shown), top debtors, disputed and unapplied cash. Downloads as a multi-sheet .xlsx. |
| Cash application | Bank credit → receipt → allocation proposals with independent approval, separate posting, version locks, idempotency and an append-only journal and audit trail. |
| Imports | UTF-8 CSV for invoices and bank lines: validation, rejected-row detail, control totals, SHA-256 digest, original bytes archived, independent checker commit (atomic). |
| Workspaces | Overview (KPIs and 6 charts), Customers, Receivables, Cash application, Approval inbox, 13-week cashflow (approved inputs), ECL review (supplied runs), Import review, Audit explorer. |
| Security | Invite-only accounts, scrypt, opaque HttpOnly sessions, TOTP MFA enforced in RLS, Redis rate limits (fail closed), CSP nonces, Origin checks, bounded bodies. The runtime DB role is non-owner and cannot bypass RLS. |

## Architecture in one picture

```
Browser ──► Next.js server components / route handlers ──► pg pool (non-owner role)
               │                                              │
               ├─ /api/copilot (SSE) ─┐                       ▼
               ├─ /api/agents ── after() ─► Agent runner ──► PostgreSQL
               ├─ /api/cron/agents ───┘     │                 RLS + allow-listed routines
               │                            ▼                 maker/checker, policy limits,
               │                    Claude API (tool use)     idempotency, append-only audit
               └─ /api/agents/runs/:id (SSE tail of agent_steps)
```

The model never writes SQL. Each tool maps to one allow-listed PostgreSQL routine,
and that routine re-checks tenant/entity scope, role, versions, limits and
idempotency. A prompt injection hidden in a customer name or bank reference
therefore can do no more than the agent role permits: read, propose, and
auto-post an exact match under policy. Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Setup

1. `npm ci`, then copy `.env.example` to `.env.local`.
2. Use a standalone PostgreSQL 16 or 17 database (Neon works well with Vercel). Set
   `DATABASE_MIGRATION_URL` (schema owner) and run `npm run db:migrate`. Migrations
   create no users or business data.
3. Create the restricted runtime login (granted `o2c_app`). Set `DATABASE_URL`,
   `MFA_ENCRYPTION_KEY`, the Upstash Redis variables, `AUTH_RATE_LIMIT_SECRET` and
   `AUTH_SITE_URL`. See [docs/POSTGRESQL_MIGRATION.md](docs/POSTGRESQL_MIGRATION.md).
4. **AI:** set `ANTHROPIC_API_KEY`. Optional settings:
   - `AI_MODEL` (default `claude-opus-5-5`)
   - `AI_AGENT_EFFORT` (default `medium`)
   - `AI_COPILOT_EFFORT` (default `low`)

   Without a key, the agents and copilot show "not configured", and requested runs
   are recorded as failed with that reason. Nothing is simulated.
5. **Scheduler:** set `CRON_SECRET` (32 or more random characters). `vercel.json`
   calls `/api/cron/agents` daily at 04:00 UTC (08:00 GST). An admin chooses which
   agents run daily in the Agent Console.
6. Provision a real tenant and entity, then invite users:
   `npm run auth:invite -- '<WORK EMAIL>' '<TENANT UUID>' maker`.
   You need at least one maker and a separate approver. See [docs/PRODUCTION_PROVISIONING.md](docs/PRODUCTION_PROVISIONING.md).
7. `npm run dev`, then open http://127.0.0.1:5174.

## Checks

```bash
npm run typecheck && npm test && npm run build      # local, embedded PostgreSQL (PGlite)
npm run test:postgres && npm run test:postgres:http  # real PostgreSQL; see migration guide
```

The test suite covers the following.
- **Database controls:** RLS tenant isolation; the agent cannot approve, execute or
  stage; policy auto-post refused when off, over the per-item limit, over the daily
  limit or inexact; independent policy activation; countback DSO and CEI against
  hand-computed fixtures; copilot privacy.
- **Agent runtime:** an end-to-end agent run on embedded PostgreSQL with a scripted
  model, checking claim-once, tool calls through RLS, policy posting, the recorded
  step sequence, cost and session revocation.
- **Supporting code:** the tool loop (input validation, refusals, turn cap), the
  .xlsx reader round trip, and the existing auth, import and finance suites.

Tests never call the live Claude API.

## Source files

| File | Headers |
|---|---|
| Invoice CSV | `number,account,customer,issued_at,due_date,amount,currency` |
| Bank CSV | `reference,booked_at,direction,amount,currency` |

- Amounts must be exact positive decimals.
- Dates must be ISO `YYYY-MM-DD`.
- `currency` must be `AED`.
- Bank `direction` is `credit` or `debit`. Debits never become receipts.
- Import only entirely unpaid invoices. Opening balances that are partially paid need a reviewed migration.

## What is not built

These limits are deliberate. Read them before you sell or demo the product.

- **No outbound email or SMS.** Collections messages are drafts only.
- **No ERP or bank connectors.** Oracle, SAP, Zoho and Odoo, and MT940/CAMT.053
  statements, are not built. Data enters through CSV, plus .xlsx for copilot analysis.
- **No UAE e-invoicing / FTA (Peppol PINT-AE).** There is also no VAT return logic
  and no TRN capture in the ledger yet.
- **No credit limits or order holds.** The credit risk agent recommends holds for a
  human decision.
- **No statutory general ledger.** The cash-control journal only (bank → unapplied
  cash → AR). No period locks, FX, write-offs or refunds.
- **ECL is display-only for supplied runs.** There is no calibrated model.
- **Not yet available:** SSO/OIDC, tenant self-signup, billing, Arabic UI.
- **No external certifications or audits:** no SOC 2, ISO 27001 or penetration test
  has been performed.
- **Live verification pending:** the hosted deployment has not been tested with real
  users. See [docs/RELEASE.md](docs/RELEASE.md) for what was verified locally versus live.

## Docs

| Document | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, agent runtime, data flow, control model |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Commercial roadmap for the UAE market, slices 2-4 |
| [docs/RELEASE.md](docs/RELEASE.md) | Release log: tested locally vs verified live |
| [docs/REPO_CONSOLIDATION.md](docs/REPO_CONSOLIDATION.md) | What was ported from the retired AR repos and what to delete |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and controls |
| [AGENTS.md](AGENTS.md), [DESIGN.md](DESIGN.md), [STYLEGUIDE.md](STYLEGUIDE.md) | Engineering rules, product contract, visual system |

Historical documents are in `docs/archive/`.

## Maintainer

Christopher Nemala · Dubai, UAE
