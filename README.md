<!-- Current model handoff: docs/AI_HANDOFF.md -->
# O2C Finance Command Center

An agentic accounts-receivable (order-to-cash) platform for UAE finance teams. AI
agents read the ledger, propose cash application, propose collections emails, place
credit holds and write management reports. Every step they take is recorded and visible.
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
| **Agent operations** (`/?view=operations`) | Health score with its formula and inputs, run success and latency, pending approvals, AED auto-posted today, an agent-to-tool handoff map, a context comparison for failed handoffs (the tool's schema against what the agent sent), open incidents and model cost per agent. Every figure comes from recorded runs and steps; with no runs the screens show empty states. |
| **Guardrails and incidents** (`/?view=guardrails`, `/?view=incidents`) | Rules checked before every agent tool call: deny a tool, cap a proposal amount, require a field, limit identical calls. Simulate a rule on the last 30 days of recorded calls, create it in Monitor, then Warn or Block with an independent approver. Block-stage amount and deny rules are also enforced in PostgreSQL. Detectors open incidents for loops, tool error spikes, stuck and failed runs, and guardrail blocks. |
| **Credit and debit notes** (`/?view=notes`) | Record credit and debit notes issued in your ERP (the source document number is required). A maker or the cash application agent proposes, a different human approver decides, and posting is a separate step. A posted credit note reduces one invoice (checked against its open amount and version at approval and posting); a posted debit note becomes a new receivable. Short payments of AED 50.00 or less are listed for one-click proposals. These are ledger adjustments: the app does not issue VAT credit notes or e-invoices. |
| **Customers and segments** (`/?view=customers`) | Outstanding AR by customer category, region or customer, with current / 1–30 / 31–60 / 61–90 / 90+ buckets, disputed amounts and share of total; click a category or region to drill into its customers. Makers set categories and regions one at a time or from an `account,category,region` CSV (all-or-nothing, audited). Customers without one show as "Unassigned". |
| **Collections workbench** (`/?view=collections`) | A daily call list ranked by a disclosed formula (overdue AED weighted by age and broken promises), follow-ups due, structured remarks (outcome, channel, note, next follow-up; a "promised" remark records the promise), UAE trade-licence expiry alerts, and a daily collections pack in Excel. Remarks are a permanent record and cannot be edited. |
| **Collections and credit** (`/?view=collections`) | Overdue worklist, customer contacts, payment promises (kept from the ledger or marked by a person; broken ones flagged), maker/checker credit limits, and credit holds that an agent may place but only a different human approver may release. Collections emails, proposed by a person or the collections agent, are sent through Resend **only after an independent approver approves them**, optionally with a PDF statement of the approved invoices. The invoices are re-checked against the ledger at approval and at sending, so a paid or disputed invoice is never dunned. |
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
   agents run daily in the Agent Console. The same call sweeps for incidents and
   retries approved collections emails.
6. **Collections email:** set `RESEND_API_KEY` and `COLLECTIONS_FROM` (for example
   `Accounts Receivable <ar@your-domain.example>` on a domain verified in Resend).
   Without both, approved messages stay queued and the Collections screen says so.
7. Provision a real tenant and entity, then invite users:
   `npm run auth:invite -- '<WORK EMAIL>' '<TENANT UUID>' maker`.
   You need at least one maker and a separate approver. See [docs/PRODUCTION_PROVISIONING.md](docs/PRODUCTION_PROVISIONING.md).
8. `npm run dev`, then open http://127.0.0.1:5174.

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

- **Live messaging verification pending.** Resend email and Twilio SMS/WhatsApp
  paths exist with approval controls and provider tests; real delivery is not yet verified.
- **No ERP or bank connectors.** Oracle, SAP, Zoho and Odoo, and MT940/CAMT.053
  statements, are not built. Data enters through CSV, plus .xlsx for copilot analysis.
- **No UAE e-invoicing / FTA (Peppol PINT-AE).** There is also no VAT return logic
  and no TRN capture in the ledger yet.
- **Credit holds do not block orders.** Holds and limits are recorded and enforced in this
  platform, but there is no ERP connector to stop orders or deliveries.
- **No statutory general ledger.** The cash-control journal only (bank → unapplied
  cash → AR). No period locks, FX, write-offs or refunds.
- **ECL is display-only for supplied runs.** There is no calibrated model.
- **Provider configuration required:** Google/Microsoft OIDC and administrator-reviewed
  registration exist in source; live provider sign-in is not yet verified.
- **Not yet available:** self-service tenant provisioning, billing, Arabic UI.
- **No external certifications or audits:** no SOC 2, ISO 27001 or penetration test
  has been performed.
- **Live verification pending:** the hosted deployment has not been tested with real
  users. See [docs/RELEASE.md](docs/RELEASE.md) for what was verified locally versus live.

## Docs

| Document | Purpose |
|---|---|
| [docs/PRD.md](docs/PRD.md) | Product requirements: goal, users, features, success metrics |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical spec: system design, agent runtime, control model |
| [docs/APP_FLOW.md](docs/APP_FLOW.md) | Screen map and user journeys |
| [DESIGN.md](DESIGN.md), [STYLEGUIDE.md](STYLEGUIDE.md) | Product screen contract and visual system |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Database schema, generated from the migrations (`npm run docs:schema`) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Implementation plan: slices 2-4 |
| [docs/TRACKER.md](docs/TRACKER.md) | Done / in progress / blocked |
| [AGENTS.md](AGENTS.md) | Coding rules for people and AI agents |
| [docs/RELEASE.md](docs/RELEASE.md) | Release log: tested locally vs verified live |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model and controls |
| [docs/REPO_CONSOLIDATION.md](docs/REPO_CONSOLIDATION.md) | What was ported from the retired AR repos |

Historical documents are in `docs/archive/`.

## Maintainer

Christopher Nemala · Dubai, UAE
