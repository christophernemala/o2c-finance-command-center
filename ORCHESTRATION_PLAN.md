# F9 O2C Command Center — Orchestrated Implementation Plan

This file is the **single source of truth** for how to turn the existing `o2c-finance-command-center` repo into a real, governed, multi-tenant AR SaaS for hospitality and real estate in the UAE and GCC.

It covers:
- Architecture & semantics
- Governance & security configuration
- Step-by-step implementation phases
- Debugging and cleanup of the existing repo
- Deployment strategy

No new repository will be created. All work happens in this repo, on the `main` branch with a dedicated implementation branch.

---

## 1. Architecture Overview

### 1.1 Domain

Target industry: **Hospitality & Real Estate** (hotels, serviced apartments, property leases) with:
- Multi-currency AR (AED as base currency)
- Corporate, government, and retail customers
- Trade receivables, intercompany, and related-party exposures

### 1.2 Layers

1. **System of Record (SoR)**
   - Supabase/PostgreSQL
   - Tables: tenants, accounts, invoices, documents, disputes, fx_rates, agent_audit_trail, integration_events

2. **Deterministic Engine**
   - Aging buckets (Current, 1–30, 31–60, 61–90, 91–180, 181–360, 361+)
   - IFRS 9 ECL calculator using bucket matrix
   - Risk scoring and credit limit logic
   - FX conversion and AED base currency handling

3. **Governance Control Plane**
   - Zod-validated DTOs
   - Confidence scoring and risk levels (low/medium/high)
   - Auto-mode vs HITL (human-in-the-loop) execution rules
   - Audit logging and approvals

4. **Cognitive Agents**
   - Collections/Dunning Agent
   - AR Dashboard Agent
   - Cash Application Agent
   - Dispute Agent
   - Liquidity Forecasting Agent
   - Deferred Revenue Agent
   - Email Drafting Agent
   - Voice/RAG Agent

5. **Interfaces & Integrations**
   - AR controller workspace
   - Customer portal (disputes & amendments)
   - Excel import/export & PDF reports
   - ERP/PMS/CRM API integration
   - SharePoint/Teams integration

---

## 2. Governance & Security Configuration

### 2.1 Supabase & RLS

- **Tenants**
  - Each company using F9 is a tenant.
  - All core tables include `tenant_id`.

- **Row-Level Security (RLS)**
  - Policies enforce `tenant_id = auth.user().tenant_id`.
  - Controllers, managers, admins, and customers see only their own tenant’s data.

### 2.2 Auth & Roles

- Use Supabase Auth (email/password) with:
  - Email verification
  - Password reset

- JWT claims:
  - `role`: `AR_CONTROLLER`, `CREDIT_MANAGER`, `ADMIN`, `CUSTOMER`
  - `tenant_id`: UUID

### 2.3 Secrets & Integrations

- Store API keys and connection strings in:
  - Supabase Vault
  - Vercel Secrets

- No secrets in the frontend bundle.
- Integrations (ERP, PMS, CRM, SharePoint, Teams) are configured only server-side.

### 2.4 Agent Governance

- Agents operate only on typed DTOs from trusted tables.
- Actions are categorized:
  - **Low-risk**: reminders, statements, exact-match cash application
  - **Medium-risk**: fuzzy matches, small write-offs
  - **High-risk**: credit limit changes, large write-offs, legal holds

- High-risk actions always require approval from `CREDIT_MANAGER` or `ADMIN`.
- `agent_audit_trail` records:
  - Inputs
  - Outputs
  - Confidence scores
  - Decision (PROPOSED/APPROVED/EXECUTED/REJECTED)

### 2.5 No Hallucinations Policy

- Deterministic engine (aging, ECL, FX, credit limits) is pure TypeScript and never delegated to LLMs.
- LLMs only:
  - Generate explanations and email/notification text
  - Suggest actions, not execute them
- If data is incomplete or ambiguous, agents must route cases to humans rather than guessing.

---

## 3. Schema Design (Supabase/PostgreSQL)

### 3.1 Core Tables

- `tenants`
- `accounts`
  - `tenant_id`, `account_number`, `name`, `receivable_type` (EXTERNAL/INTERCOMPANY/RELATED_PARTY)
  - `credit_limit_aed`, `current_exposure_aed`, `risk_tier`

- `invoices`
  - `tenant_id`, `account_id`, `invoice_number`, `invoice_currency`, `amount_original`, `amount_in_aed`
  - `due_date`, `status`, `days_past_due`, `aging_bucket`

- `documents`
  - `tenant_id`, `account_id`, `document_type` (TAX_INVOICE/PROFORMA/CREDIT_NOTE/DEBIT_NOTE/JV/ACCRUAL)
  - Links to `invoices` when relevant

- `fx_rates`
  - `from_currency`, `to_currency` (AED), `rate`, `valid_from`, `valid_to`, `source`, `created_by`

- `agent_audit_trail`
  - `tenant_id`, `agent_id`, `action_type`, `confidence_score`, `payload`, `status`, `executed_at`

- `disputes`
  - `tenant_id`, `invoice_id`, `raised_by`, `reason`, `status`, `resolution_action`

- `integration_events`
  - `tenant_id`, `source_system`, `event_type`, `payload_summary`, `status`

### 3.2 Derived Views

- Aging summary by bucket, currency, receivable type
- ECL summary by bucket and business unit
- DSO/CEI metrics by period
- Credit exposure vs credit limits per account

---

## 4. Implementation Phases

### Phase 1 — Supabase Setup & Auth

1. Create Supabase project(s): staging and production.
2. Implement core tables as defined above.
3. Enable RLS and write policies for `tenants`, `accounts`, `invoices`, `disputes`, `agent_audit_trail`.
4. Configure Supabase Auth:
   - Email/password signup and login
   - JWT claims for `role` and `tenant_id`
5. Link frontend login and tenant/role resolution.

### Phase 2 — Deterministic Engine (Aging, ECL, FX, Limits)

1. Implement aging calculation functions:
   - `daysPastDue(dueDate, today)` → number
   - `bucketFromDays(daysPastDue)` → one of (CURRENT, 1_30, 31_60, 61_90, 91_180, 181_360, 361_PLUS)

2. Implement ECL bucket matrix using SKILLS.md:
   - Map `aging_bucket` → `provision_rate`
   - Function: `eclAmount(balanceAED, provisionRate)` → amount

3. Implement risk scoring:
   - Use factors defined in SKILLS.md to compute risk score and flag.

4. Implement FX conversion:
   - Function: `toAED(amountOriginal, currency, fxRates)` → amountInAED

5. Implement credit limit checks:
   - Compute `current_exposure_aed` per account.
   - Flag accounts where exposure exceeds limit.

### Phase 3 — Agents & Control Plane

1. Build governance middleware:
   - Zod schemas for agent inputs/outputs
   - Confidence scoring
   - Risk tier assignment
   - Auto vs HITL decision logic

2. Implement agents:
   - Collections/Dunning Agent
   - AR Dashboard Agent
   - Cash Application Agent (using BankReconciliation + ExcelUpload modules)
   - Dispute Agent
   - Liquidity & Deferred Revenue Agents
   - Email Drafting Agent
   - Voice/RAG Agent (read-only + proposal only)

3. Wire agents to Supabase data:
   - Use server-side functions to read/write
   - Log all actions in `agent_audit_trail`

### Phase 4 — Integrations & Imports

1. Excel import:
   - Upload to staging tables
   - Validate columns, totals, and data types
   - Promote valid data to `accounts`, `invoices`, and `documents`

2. ERP/PMS/CRM API integration:
   - Build backend connectors
   - Stage and validate inbound data
   - Never bypass staging layer

3. SharePoint/Teams:
   - Export Excel/PDF packs
   - Upload to SharePoint folders
   - Send Teams notifications for disputes and escalations

### Phase 5 — UI/UX & Dashboards

1. AR controller workspace:
   - Multi-pane layout
   - KPIs, aging buckets, DSO/CEI, ECL summary
   - Workqueues for collections, disputes, unapplied cash

2. Customer portal:
   - Invoice list, aging, dispute submission
   - Statement downloads (Excel/PDF)

3. AR closing views:
   - Quarter-end AR reconciliation status
   - Provision movement analysis

### Phase 6 — Testing, Monitoring, and Audit

1. Automated tests:
   - Unit tests for aging, ECL, FX, limits
   - Integration tests for imports and agents

2. Monitoring:
   - PostHog and Sentry for UI errors and backend exceptions

3. Quarterly audit pack:
   - Auto-generate Excel/PDF with aging, ECL, FX, related-party, reconciliation
   - Agents run data quality checks
   - Human sign-off logged in `agent_audit_trail`

---

## 5. Debugging & Cleaning the Existing Repo

Before building new features, we must clean and debug the current codebase.

### 5.1 No New Repo, No Duplicates

- `christophernemala/o2c-finance-command-center` is the **only repo**.
- Work on `main` with a dedicated implementation branch (e.g. `f9-implementation`).
- Delete or archive any other O2C-related repositories after migration is stable.

### 5.2 Current Monolith & Modules

- `src/App.tsx` currently holds all routes and components.
- Modules under `src/modules/`:
  - AgingAnalytics
  - ARModule
  - BankReconciliation
  - DashboardRenderer
  - DataIngestion
  - ECLProvision
  - EmailDrafting
  - ExcelUpload
  - IFRSReporting
  - InvoiceDocuments
  - Reminders
  - SlaDirectory

### 5.3 Debug Steps

1. Run local setup:
   - `npm install`
   - `npm run generate:data`
   - `npm run workflow:daily`
   - `npm run dev`

2. Identify and fix:
   - TypeScript errors (run `npx tsc --noEmit`)
   - Broken routes or components
   - Any data generation issues

3. Gradually refactor:
   - Extract large chunks from `App.tsx` into separate components while preserving behaviour.
   - Ensure charts and exports are working with deterministic data.

4. Remove junk:
   - Delete unused components and CSS not referenced anywhere.
   - Remove experimental files and dead code paths.
   - Keep only code that is used by current features or by planned implementation.

5. Document changes in this file and README.md.

---

## 6. Deployment Plan

### 6.1 Vercel

- Use Vercel for frontend and serverless backend.
- Connect `main` branch as production.
- Use `f9-implementation` branch for staging.

### 6.2 Supabase

- Link staging and production projects via environment variables.
- Ensure RLS and roles are identical across environments.

### 6.3 Domains

- `app.f9-o2c.com` (or similar) for the application.
- Separate marketing site for SEO (configured later) with robots.txt and sitemap.

---

## 7. Working Rules Going Forward

- No new repos for F9 O2C; only branches in this repo.
- No demo users or test credentials hard-coded in the codebase.
- No secrets in client-side code.
- No LLMs generating financial numbers or ledger entries.
- All agents operate under governance and audit.
- All changes to credit limits, FX rates, and high-risk actions require human approval.
