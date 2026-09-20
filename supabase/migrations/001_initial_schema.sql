-- ============================================================
-- O2C Finance Command Center — Supabase Schema v2
-- Run this in the Supabase SQL editor or via `supabase db push`
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- TENANTS
-- =====================
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'starter',  -- starter | pro | enterprise
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- PROFILES (maps Supabase Auth users → tenant + role)
-- =====================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'viewer',  -- admin | ar_manager | collector | viewer
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- CUSTOMERS
-- =====================
CREATE TABLE IF NOT EXISTS customers (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code                 TEXT NOT NULL,
  name                 TEXT NOT NULL,
  country              CHAR(2),
  contact_email        TEXT,
  credit_limit         NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit_limit_currency TEXT NOT NULL DEFAULT 'AED',
  risk_score           INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  hubspot_contact_id   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

-- =====================
-- INVOICES
-- =====================
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,
  amount          NUMERIC(18,2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'AED',
  amount_aed      NUMERIC(18,2),
  outstanding     NUMERIC(18,2),
  issue_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft|issued|overdue|paid|written_off
  days_past_due   INTEGER NOT NULL DEFAULT 0,
  aging_bucket    TEXT,  -- current|1-30|31-60|61-90|91-120|120+
  ecl_provision   NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, invoice_number)
);

-- =====================
-- PAYMENTS
-- =====================
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  invoice_id      UUID REFERENCES invoices(id),
  amount          NUMERIC(18,2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'AED',
  payment_date    DATE NOT NULL,
  reference       TEXT,
  method          TEXT,  -- wire|card|check|ach
  status          TEXT NOT NULL DEFAULT 'unmatched',  -- matched|unmatched|partial
  matched_by      TEXT,  -- manual|agent
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- DISPUTES
-- =====================
CREATE TABLE IF NOT EXISTS disputes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  reason          TEXT NOT NULL,
  amount          NUMERIC(18,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',  -- open|under_review|resolved|rejected
  priority        TEXT NOT NULL DEFAULT 'medium',  -- low|medium|high|critical
  resolution_note TEXT,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- COLLECTION ACTIONS
-- =====================
CREATE TABLE IF NOT EXISTS collection_actions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  invoice_id      UUID REFERENCES invoices(id),
  action_type     TEXT NOT NULL,  -- email_reminder|phone_call|escalation|legal
  priority_score  INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|completed|skipped
  due_date        DATE,
  notes           TEXT,
  hubspot_task_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- AGENT AUDIT TRAIL (immutable — no UPDATE/DELETE)
-- =====================
CREATE TABLE IF NOT EXISTS agent_audit_trail (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  payload         JSONB,
  confidence      NUMERIC(4,3),
  risk_level      TEXT,  -- low|medium|high|critical
  requires_human  BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by     UUID REFERENCES profiles(id),
  status          TEXT NOT NULL DEFAULT 'executed',  -- pending_approval|executed|rejected
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- ROW LEVEL SECURITY — tenant isolation on every table
-- =====================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit_trail ENABLE ROW LEVEL SECURITY;

-- Helper: get tenant_id from the authenticated user's profile
CREATE OR REPLACE FUNCTION auth_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;

-- Profiles: user can only see their own row
CREATE POLICY profiles_select ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (id = auth.uid());

-- All other tables: restrict to the user's tenant
CREATE POLICY customers_tenant ON customers FOR ALL USING (tenant_id = auth_tenant_id());
CREATE POLICY invoices_tenant  ON invoices  FOR ALL USING (tenant_id = auth_tenant_id());
CREATE POLICY payments_tenant  ON payments  FOR ALL USING (tenant_id = auth_tenant_id());
CREATE POLICY disputes_tenant  ON disputes  FOR ALL USING (tenant_id = auth_tenant_id());
CREATE POLICY collection_actions_tenant ON collection_actions FOR ALL USING (tenant_id = auth_tenant_id());
CREATE POLICY audit_tenant     ON agent_audit_trail FOR ALL USING (tenant_id = auth_tenant_id());

-- Audit trail: block row edits (append-only)
CREATE RULE no_update_audit AS ON UPDATE TO agent_audit_trail DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO agent_audit_trail DO INSTEAD NOTHING;

-- =====================
-- REALTIME — enable for key tables
-- =====================
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE disputes;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_audit_trail;

-- =====================
-- INDEXES for performance
-- =====================
CREATE INDEX idx_invoices_tenant_status ON invoices(tenant_id, status);
CREATE INDEX idx_invoices_tenant_due    ON invoices(tenant_id, due_date);
CREATE INDEX idx_invoices_customer      ON invoices(customer_id);
CREATE INDEX idx_payments_tenant        ON payments(tenant_id);
CREATE INDEX idx_disputes_tenant_status ON disputes(tenant_id, status);
CREATE INDEX idx_audit_tenant_created   ON agent_audit_trail(tenant_id, created_at DESC);
