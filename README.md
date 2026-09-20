# O2C Finance Command Center / F9 O2C Command Center

> **Enterprise O2C Receivables Intelligence Platform** — IFRS 9 ECL provisioning, bank reconciliation, customer risk analytics, Excel upload & reconciliation, and executive KPI dashboards.

---

## ✨ Features

### Core Finance Operations
- **1,250-row deterministic O2C finance dataset** with customer accounts, invoices, GL dates, bank references, and payment audit trails
- **Normal aging analysis** — Current, 1-30, 31-60, 61-90, 91-180, 181-360, 361+ aging buckets
- **IFRS 9 ECL provisioning** — Current, 1-30, 31-60, 61-90, 91-120, 121-180, 180+ buckets with 100% provision logic for 180+ day exposures
- **IFRS 7 disclosure cues** — BU/DSO analysis, CEO control index, and credit-risk concentration
- **Risk account flagging** — Customer-level risk scoring (Critical / High / Watch / Normal) based on overdue exposure, provision, and disputed invoice metrics

### Excel Upload & Reconciliation
- **Drag-and-drop `.xlsx` upload** — Auto-detects bank statement vs. invoice formats using column alias matching
- **Multi-criteria reconciliation engine** — Matches on invoice number, bank reference, amount tolerance, customer name, and customer number with weighted confidence scoring (0–100%)
- **Reconciliation categories** — Matched (≥80%), Suggested (50–79%), Exception (<50%), Unmatched
- **Export reconciliation results** to styled Excel workbooks

### Visual Analytics & KPIs
- **Power BI-style dashboard** — Sparkline KPI cards with animated count-up effects and trend indicators (↑ ↓ →)
- **Line Chart** — Collection trend visualization with SVG gradient rendering
- **Stacked Bar Chart** — Aging breakdown by business unit with color-coded buckets
- **Gauge Chart** — Collection efficiency with dynamic SVG arc fill
- **Heatmap Table** — Color-coded customer × aging bucket risk matrix (Top 10)
- **Donut Chart** — Bank match control breakdown with percentage display

### Operations
- **Morning bank reconciliation** with match confidence and exception tracking
- **SOA email draft generation** — Humanized statement-of-account email drafting with SLA/contract email ID lookup
- **SLA account lookup** — Customer account number search for payment terms, collector owner, escalation, and contract preferences
- **Oracle Fusion / SAP S/4HANA integration mapping** — AR invoice workbench, receipt matching, and provision posting handoff
- **Invoice PDF export/import queue** and payment-proof audit dataset
- **Cheque, trade license, and document resubmission reminders**
- **Management review** — Business unit control dashboard with open operational exception tracking

### Excel Export
- **14-sheet daily finance pack** — Total Data Matrix, Aging, Risk Accounts, Unapplied Amounts, IFRS 9 ECL, ECL Policy Matrix, Email Drafts, ECL Summary, SLA Directory, Invoice PDF Queue, Payment Proof Audit, Bank Reconciliation, Reminders, Management Review
- **Individual report downloads** — Each view exports its own styled `.xlsx` workbook
- **Upload reconciliation export** — Reconciliation results from customer-uploaded bank statements

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 19 + TypeScript 5 |
| **Build** | Vite 8 |
| **Icons** | Lucide React |
| **Excel** | Custom XLSX writer + `fflate` (ZIP compression/decompression) |
| **Styling** | Vanilla CSS with glassmorphism, gradients, and CSS animations |
| **Charts** | Custom SVG components (Line, Donut, Gauge, Heatmap, Sparkline, Stacked Bar) |
| **Data** | Deterministic local mock generator — no external API dependencies |

---

## 🚀 Local Setup

```powershell
npm install
npm run generate:data
npm run workflow:daily
npm run dev
```

Open `http://127.0.0.1:5174` in your browser.

**Demo credentials** (prefilled): `finance.controller@o2c.local` / `demo123`

---

## 📁 Project Structure

```text
o2c-finance-command-center/
├── src/
│   ├── App.tsx                    # Main application (16 routes, all components)
│   ├── main.tsx                   # React entry point
│   ├── styles.css                 # Full design system (glassmorphism, charts, upload zone)
│   ├── data/
│   │   └── financeModel.ts        # Central model builder
│   ├── shared/
│   │   └── types.ts               # TypeScript interfaces and type aliases
│   └── modules/
│       ├── AgingAnalytics/        # Normal AR aging analysis
│       ├── ARModule/              # Oracle-style invoice status transitions
│       ├── BankReconciliation/    # Bank statement matching engine
│       ├── DashboardRenderer/     # Excel workbook export (browser + Node)
│       ├── DataIngestion/         # Deterministic mock data generator
│       ├── ECLProvision/          # IFRS 9 ECL bucket provisioning
│       ├── EmailDrafting/         # SOA email draft generation
│       ├── ExcelUpload/           # Excel upload parser + reconciliation
│       │   ├── excelParser.ts     # .xlsx binary parser with column alias matching
│       │   └── reconciliationEngine.ts  # Multi-criteria matching with confidence scoring
│       ├── IFRSReporting/         # IFRS 7 disclosure cues
│       ├── InvoiceDocuments/      # Invoice PDF queue and payment proof audit
│       ├── Reminders/             # Cheque, trade license, document reminders
│       └── SlaDirectory/          # SLA account lookup
├── scripts/
│   ├── generate-data.ts           # Data generation script
│   └── run-daily-workflow.ts      # Daily workflow automation
├── docs/
│   └── ARCHITECTURE.md            # Architecture and module documentation
├── reports/                       # Generated Excel packs (gitignored)
├── AGENTS.md                      # AI agent configuration
├── SKILLS.md                      # Platform capabilities documentation
├── README.md                      # This file
└── package.json
```

---

## 📊 Navigation Routes

| # | Route | View | Description |
|---|---|---|---|
| 1 | `powerbi` | Power BI Dashboard | Executive KPIs, charts, heatmap, gauge |
| 2 | `upload` | Upload & Reconcile | Drag-and-drop Excel upload + reconciliation |
| 3 | `matrix` | Total Data Matrix | Full transaction matrix (all fields) |
| 4 | `aging` | Aging Analysis | Standard aging register with customer details |
| 5 | `risk` | Risk Accounts | Customer risk flagging with scoring |
| 6 | `unapplied` | Unapplied Amounts | Unallocated invoice and receipt balances |
| 7 | `ecl` | IFRS 9 ECL | ECL provision dashboard with policy matrix |
| 8 | `email` | Email Center | SOA email drafting by customer account |
| 9 | `export` | Export Center | Download individual Excel reports |
| 10 | `sla` | SLA Lookup | Customer SLA and contract profile lookup |
| 11 | `integrations` | Oracle / SAP Center | ERP integration mapping and audit controls |
| 12 | `invoices` | Invoice & Proof Audit | Dummy invoice PDF queue and payment proof |
| 13 | `audit` | Payment Audit | Payment proof audit register |
| 14 | `recon` | Bank Reconciliation | Morning bank statement reconciliation |
| 15 | `reminders` | Reminders | Security cheque and trade license reminders |
| 16 | `review` | Management Review | Executive review with operational exceptions |

---

## 📤 Excel Upload & Reconciliation Flow

1. Navigate to **Upload & Reconcile**
2. **Drag and drop** `.xlsx` bank statement and invoice files into the upload zone
3. The parser auto-detects whether each sheet contains bank statements or invoices using flexible column alias matching
4. Click **Run Reconciliation** to match bank lines against invoices (uploaded + in-memory)
5. View KPI summary (Match Rate, Matched, Suggested, Exceptions)
6. Review the reconciliation detail table with confidence percentages and exception reasons
7. **Export** the reconciliation results to a styled `.xlsx` workbook

### Supported Column Aliases

The parser recognises common column header variations:

- **Bank Statements**: Date, Bank Account, Bank Reference, Invoice Number, Customer Name, Amount, Description, Narration, Narrative, Particulars
- **Invoices**: Invoice Number, Customer Name, Customer Account, Invoice Date, Due Date, Amount, Paid Amount, Outstanding, Balance, Status

---

## 🏗 Deployment

The dashboard shell can deploy to **Vercel** as a static preview:

```powershell
npm run build
```

Excel generation and daily workflows are **local/offline Node processes** by design.

---

## 🎯 Branding & Product Identity

**F9 O2C Finance Command Center** is an enterprise-grade Order-to-Cash (O2C) automation and liquidity management platform engineered for CFOs, AR managers, and finance operations teams.

It combines a deterministic financial engine (IFRS 9 Expected Credit Loss, multi-tier aging buckets, and automated bank reconciliation) with a governed multi-agent cognitive fleet for dunning, risk scoring, dispute management, and cash forecasting — without sacrificing ledger integrity or audit compliance.

### Design Philosophy & UI Standards

- **Premium white SaaS UI** — clean, high-legibility light-mode aesthetic built on structured typography, whitespace, and WCAG-compliant color contrast.
- **Accountable AI workspace** — agent decisions, confidence metrics, and reasoning paths are explicitly exposed in dedicated panels with human-in-the-loop (HITL) approval gates.
- **Excel-first interoperability** — multi-sheet `.xlsx` imports and exports align with existing FP&A workflows and Power BI semantic models.

---

## 🧱 How It Works (Architecture Overview)

F9 enforces a strict separation between data persistence, deterministic financial calculation, cognitive reasoning, and external ledger execution.

### Architectural Layers

1. **System of Record (SoR)** — multi-tenant Postgres/Supabase database backed by Row-Level Security (RLS). Single source of truth for tenants, accounts, invoices, payments, and agent audit trails.
2. **Deterministic Engine** — pure, typed calculations for IFRS 9 ECL provisioning, aging bucket categorizations (Current, 1–30, 31–60, 61–90, 90+ days), DSO/CEI metrics, and bank statement matching.
3. **Control Plane & Governance** — policy enforcement layer that evaluates agent action requests against thresholds, tenant permissions, and approval requirements before any writeback.
4. **Cognitive Agent Fleet** — specialized agents executing task-specific semantic reasoning using structured DTOs (Data Transfer Objects). Agents operate within strict confidence boundaries and cannot bypass control-plane policies.
5. **Systems of Engagement** — AR dashboard, credit control workqueues, email center, vibe chat box, voice agent endpoints, Excel/Power BI exports, and Slack/HubSpot/Fireflies integrations.

---

## 🔐 Architecture & Security

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS | High-density SPA with multi-pane AR dashboard |
| Backend / DB | Supabase (PostgreSQL), Edge Functions | Multi-tenant DB with RLS and serverless APIs |
| Hosting | Vercel | Global CDN deployment with serverless routes |
| Auth | Supabase Auth | Tenant-isolated JWT auth with RBAC |
| Agent Control | Custom governance middleware | Schema validation, confidence rating, HITL authorization |
| Integrations | Webhooks & REST APIs | Slack, HubSpot, Fireflies, Power BI datasets |

### Security Model

- **Row-Level Security (RLS)** — tables enforce strict `tenant_id` policies; queries automatically isolate data at the Postgres level.
- **Least-privilege scopes** — agents execute tool calls under scoped service roles without direct unrestricted DB writes.
- **Cryptographic audit logs** — every automated decision, agent proposal, and human override is immutably logged in `agent_audit_trail` with timestamps and actor IDs.
- **CI/CD & secret management** — staging and production environments separated; secrets stored in Vercel Secrets / Supabase Vault with GitHub secret scanning.

---

## 🤖 Agents & Auto-Mode Governance

F9 deploys specialized agents for each stage of the O2C lifecycle. Agents work on typed DTOs, not raw text, and all actions are routed through the control plane.

### Agent Fleet

| Agent | Responsibilities | Key Inputs | Outputs |
|---|---|---|---|
| **Credit Risk Agent** | Evaluates liquidity, calculates credit scores, recommends credit limit changes | Payment history, ECL metrics, risk tiers | Credit score updates, credit limit proposals |
| **Collections / Dunning Agent** | Monitors overdue invoices, selects collection strategy, queues follow-ups | Aging buckets, account flags, interaction logs | Dunning stage escalation, email dispatch queue |
| **AR Dashboard Agent** | Compiles daily KPIs and workqueues for AR controllers | Aging buckets, unapplied cash, dispute counts, DSO/CEI | AR dashboard cards, prioritized worklists |
| **Cash Application Agent** | Matches bank remittances to open invoices with fuzzy matching | Unapplied bank credits, outstanding invoices | Reconciled matches, exceptions |
| **Dispute Agent** | Classifies short-pays and disputes, gathers documentation | Short-paid invoices, notes, POD files | Dispute reason classification, write-off proposals |
| **Liquidity Forecasting Agent** | Generates 13-week cash flow forecasts | Historical payment velocity, pipeline orders | Weekly cash inflows, liquidity risk flags |
| **Deferred Revenue Agent** | Tracks revenue recognition vs billing | Contract schedules, invoice dates | Deferred revenue schedule views |
| **Email Drafting Agent** | Generates professional dunning and SOA emails | Invoice details, customer profile, tone policy | Email drafts with payment links |
| **Voice Agent / RAG Agent** | Answers spoken or chat questions via RAG | Tenant data, AR events, documentation | Safe, grounded responses and actions |

### Auto-Mode Policy

- **Low-risk (auto execution)** — send standard reminders for invoices under configured thresholds, apply exact-match cash application, refresh scores without limit changes.
- **Medium-risk (HITL required)** — fuzzy remittance matches below high confidence, mid-sized write-offs, schedule changes.
- **High-risk (mandatory approval)** — credit limit changes above thresholds, large write-offs, legal holds, cross-account moves.

Agents never write directly to ERP ledgers; they propose actions that are executed through governed workflows.

---

## 📈 KPIs, Aging Buckets & AR Dashboard

The AR dashboard surfaces:

- **Aging buckets KPIs** — live counts and amounts for Current, 1–30, 31–60, 61–90, 91–180, 181–360, 361+.
- **DSO & CEI metrics** — Days Sales Outstanding and Collection Effectiveness Index, computed daily using deterministic formulas.
- **Daily sales & invoice issuance** — charts and tables of invoices issued per day, per BU, with status and exceptions.
- **Credit control bots activity** — cards showing open promises, disputes, high-risk accounts, and follow-up queues.

Work is organized into AR workqueues (e.g., “High-Risk Over 90 Days”, “New Disputes”, “Unapplied Cash”), updated daily by agents and consumable via keyboard-first workflows.

---

## 💼 Daily Follow-Ups, Email Center & Vibe Chat Box

- **Daily follow-ups** — the Collections Agent populates follow-up lists with due/overdue invoices, applying dunning strategies and recording outcomes.
- **Email Center** — the Email Drafting Agent renders editable dunning and SOA emails with prefilled metrics, links, and tone; humans approve before sending.
- **Vibe chat box** — in-app semantic chat interface where users can ask questions like “Show me customers with CEI < 70 this month” or “Draft a reminder for all invoices over 60 days in BU A”. The chat uses RAG against tenant data and specs and routes actions through agents, not free-form execution.
- **Voice agent** — optional voice endpoint calling the same RAG and agent flows for spoken queries, constrained by RBAC and approval policies.

---

## 💰 Cashflow Forecasting, Deferred Revenue & DSO/CEI

- **Cashflow forecasting** — Liquidity Agent generates rolling 13-week forecasts, using probability-weighted expected receipts and scenario views.
- **Deferred revenue** — Dedicated views show billed vs recognized revenue per BU, customer, and product, using deterministic schedules.
- **DSO/CEI** — daily recalculation using O2C best-practice formulas, exposed as KPIs, trends, and per-customer metrics.

All metrics are calculated in the deterministic engine layer and consumed by agents and dashboards.

---

## 🧮 SaaS Usage & Financial Semantics (Schema Overview)

Illustrative core schema (PostgreSQL):

```sql
-- Tenants
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  name TEXT NOT NULL,
  credit_limit NUMERIC(15, 2) NOT NULL,
  risk_tier TEXT CHECK (risk_tier IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  invoice_number TEXT NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  balance NUMERIC(15, 2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT CHECK (status IN ('CURRENT', 'OVERDUE', 'DISPUTED', 'PAID', 'WRITTEN_OFF')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Audit Trail
CREATE TABLE agent_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  confidence_score NUMERIC(5, 4) NOT NULL,
  payload JSONB NOT NULL,
  status TEXT CHECK (status IN ('PROPOSED', 'APPROVED', 'EXECUTED', 'REJECTED')),
  executed_at TIMESTAMPTZ DEFAULT now()
);
```

Deterministic aging buckets, DSO/CEI, deferred revenue, and cashflow views are derived from these base tables.

---

## 🧩 Advanced Architecture & Resiliency Patterns

- **Finite State Machines (FSM)** — invoice and dispute lifecycles modeled using strict state machines (e.g., XState) to prevent invalid combinations (like PAID + DISPUTED).
- **Transactional Outbox** — agent actions and external side effects written to an outbox table within the same transaction as entity state changes; background workers process the outbox asynchronously for at-least-once execution.
- **Agent circuit breaker & fallback** — agent tool calls wrapped in circuit breakers with exponential backoff and automatic degradation to deterministic wizards if confidence drops or APIs fail.

---

## 🎹 High-Density UI/UX & Defensive Patterns

- **Multi-pane workspace** — left rail navigation with AR aging summaries and workqueues; center pane high-density tables; right inspector drawer for customer credit scores, disputes, and live agent trails.
- **Keyboard-first workflows** — command palette (`Cmd+K` / `Ctrl+K`) with shortcuts (`G`+`A` for Aging, `G`+`D` for Disputes, `G`+`C` for Cash App). Bulk actions via selection and agent approvals.
- **Optimistic UI** — instant row updates with pending markers and graceful rollback on write failure.
- **Defensive guardrails** — two-phase destructive confirmation for write-offs/limit changes, agent confidence badges (green/amber/grey) driving auto vs HITL, and live ledger sync banners when ERP sync is delayed.

Color tokens are aligned with the Tailwind `finance` palette defined in `tailwind.config.js`.

---

## 🧪 Implementation Checklist

- [ ] Wrap all agent inputs/outputs in strict Zod runtime schemas before rendering or persisting.
- [ ] Implement XState FSMs for invoice and dispute lifecycles.
- [ ] Configure Supabase RLS and multi-tenant schemas for production.
- [ ] Add PostHog and Sentry telemetry for AR funnel and agent governance.
- [ ] Implement command palette and keyboard shortcuts for AR controllers.
- [ ] Wire up Slack/HubSpot/Fireflies/Power BI integrations as governed tools.

---

## 📜 License

MIT
