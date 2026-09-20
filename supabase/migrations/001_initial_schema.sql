-- Enable RLS on all tables
-- Tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Profiles (one per user, linked to tenant)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','ar_controller','credit_manager','customer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON public.profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "profiles_tenant" ON public.profiles FOR SELECT USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  credit_limit NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit_limit_currency TEXT NOT NULL DEFAULT 'AED',
  risk_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  hubspot_id TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  country TEXT NOT NULL DEFAULT 'AE',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_tenant" ON public.customers FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  amount_aed NUMERIC(18,2) NOT NULL,
  due_date DATE NOT NULL,
  issue_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','partial','paid','overdue','disputed','written_off')),
  days_past_due INTEGER NOT NULL DEFAULT 0,
  aging_bucket TEXT NOT NULL DEFAULT 'current' CHECK (aging_bucket IN ('current','1_30','31_60','61_90','91_120','over_120')),
  ecl_provision NUMERIC(18,2) NOT NULL DEFAULT 0,
  outstanding NUMERIC(18,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, invoice_number)
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_tenant" ON public.invoices FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id),
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  amount_aed NUMERIC(18,2) NOT NULL,
  payment_date DATE NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank_transfer',
  reference TEXT,
  matched BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_tenant" ON public.payments FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- Disputes
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  amount_disputed NUMERIC(18,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','under_review','resolved','escalated')),
  assigned_to UUID REFERENCES public.profiles(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disputes_tenant" ON public.disputes FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- FX Rates
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL DEFAULT 'AED',
  rate NUMERIC(18,6) NOT NULL,
  rate_date DATE NOT NULL,
  UNIQUE(from_currency, to_currency, rate_date)
);
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_rates_read" ON public.fx_rates FOR SELECT USING (true);

-- Agent Audit Trail
CREATE TABLE IF NOT EXISTS public.agent_audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high')),
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_tenant" ON public.agent_audit_trail FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
);

-- Realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_audit_trail;
