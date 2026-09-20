# F9 O2C Command Center — Architecture

This document describes the **frontend, backend, and data architecture** for `o2c-finance-command-center`. It serves as the high-level reference for engineers and AI coding agents.

---

## 1. Frontend Architecture

### 1.1 Tech Stack

- **Framework**: React (TypeScript)
- **Bundler**: Vite or CRA (existing configuration in `package.json`)
- **UI Layer**:
  - Component-based layout (AR controller workspace, customer portal)
  - Charts and tables driven by deterministic data

### 1.2 Structure

- `src/App.tsx`
  - Entry point and router
  - Will be gradually refactored into smaller feature components

- `src/modules/`
  - Each module encapsulates a domain:
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

### 1.3 UI/UX Principles

- Premium **white** SaaS interface
- Multi-pane layout for AR controllers:
  - Left: navigation and counts
  - Center: tables and charts
  - Right: inspector and agent trail

- Customer portal:
  - Simple invoice list, aging info, dispute submission

- Accessibility:
  - Keyboard shortcuts (Command Palette)
  - Clear color coding for risk and aging buckets

---

## 2. Backend Architecture

### 2.1 Supabase Backend

- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth (email/password, JWT)
- **APIs**:
  - Supabase client in frontend for reads/writes
  - Edge functions or Vercel server routes for complex logic

### 2.2 Layers

1. **API Layer**
   - Functions for:
     - Fetching tenants, accounts, invoices
     - Writing disputes, audit trail entries
     - Importing staged Excel data

2. **Domain Layer**
   - Pure TypeScript functions for:
     - Aging calculations
     - IFRS 9 ECL buckets
     - FX conversion to AED
     - Credit limits and risk scores

3. **Governance Layer**
   - Zod schemas for inputs/outputs
   - Confidence scoring
   - HITL (human-in-the-loop) rules
   - Agent audit logging

---

## 3. Data & Database Handling

### 3.1 Multi-Tenancy

- All core tables include `tenant_id`
- Row-Level Security (RLS) policies enforce per-tenant visibility

### 3.2 Core Entities

- **Tenants**
- **Accounts**
- **Invoices**
- **Documents**
- **FX Rates**
- **Agent Audit Trail**
- **Disputes**
- **Integration Events**

### 3.3 Data Flows

1. **Ingestion**
   - Excel import → staging tables → validation → promotion
   - ERP/PMS/CRM APIs → staging → validation → promotion

2. **Processing**
   - Deterministic engine computes aging buckets and ECL
   - Agents consume processed views and propose actions

3. **Output**
   - Dashboards and tables in UI
   - Excel and PDF exports for AR packs

---

## 4. Harnesses & Testing

### 4.1 Test Harnesses

- Unit test harnesses for:
  - Aging functions
  - ECL calculator
  - FX conversion
  - Credit limit checks

- Integration test harnesses for:
  - Excel import pipeline
  - Agent workflows (proposals, approvals, logging)

### 4.2 Development Workflow

- Local development:
  - `npm install`
  - `npm run generate:data`
  - `npm run workflow:daily`
  - `npm run dev`

- CI:
  - Linting, type-checking, and tests on each PR

---

## 5. Frontend–Backend Boundary

### 5.1 DTOs

- Frontend sends and receives **typed DTOs**:
  - Account, invoice, dispute, agent action DTOs

- Backend enforces:
  - Validation via Zod
  - Role and tenant checks

### 5.2 No Direct DB Access in UI

- UI never manipulates SQL directly
- All data changes go through validated API calls

---

## 6. Governance Summary

- Supabase RLS for tenant isolation
- Role-based access control via JWT claims
- Agents governed by control plane and audit trail
- No LLM-generated financial numbers or ledger entries

This `ARCHITECTURE.md` is the reference for building the frontend and backend safely on top of the existing repo.
