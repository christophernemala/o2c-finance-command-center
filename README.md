# O2C Finance Command Center

A production-grade, agentic **Order-to-Cash SaaS** built on:
- **Vercel** (hosting, CI/CD)
- **Supabase** (Postgres + Auth + Realtime + RLS)
- **HubSpot** (CRM sync, collection tasks)
- **Hugging Face** (email classification, AR narratives)
- **Firecrawl** (web context for agents)
- **Resend** (transactional emails)
- **Cloudflare** (DNS, WAF, CDN)
- **React + TypeScript + Vite + Tailwind + Framer Motion**

---

## Features

| Module | Description |
|---|---|
| Dashboard | Live KPIs, aging chart, agent activity, risk table |
| AR Aging | Full aging breakdown with IFRS 9 ECL provisions |
| Cash Application | Matched vs unmatched payments |
| Disputes | Dispute intake and resolution workflow |
| Collections | Priority-scored collection queue |
| Customers | Credit limits, risk scores, HubSpot links |
| Liquidity | 30-day cash inflow forecast |
| Agent Audit | Immutable log of all agent actions |

---

## Quick Start

### 1. Clone and install
```bash
git clone https://github.com/christophernemala/o2c-finance-command-center
cd o2c-finance-command-center
npm install
```

### 2. Configure environment
```bash
cp .env.example .env.local
# Fill in: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_RESEND_API_KEY,
# VITE_HUBSPOT_ACCESS_TOKEN, VITE_HUGGINGFACE_API_KEY, VITE_FIRECRAWL_API_KEY
```

### 3. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration: `supabase db push` or paste `supabase/migrations/001_initial_schema.sql` in the SQL editor
3. Enable Realtime for tables: `invoices`, `disputes`, `payments`, `agent_audit_trail`

### 4. Seed development data
```bash
VITE_SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/seed.ts
```

### 5. Run locally
```bash
npm run dev
```

### 6. Deploy to Vercel
- Connect repo to Vercel
- Add all environment variables in Vercel dashboard
- Install the [Supabase Vercel Integration](https://vercel.com/marketplace/supabase)
- Every push to `main` auto-deploys

---

## Architecture

```
Browser (React/Framer)
  ↓
Vercel Edge (security headers, CSP, rewrites)
  ↓
Supabase (Postgres + RLS + Realtime)
  ↓ (agents call)
Resend | HubSpot | HuggingFace | Firecrawl
```

## Security
- RLS on every table — tenant isolation enforced at DB level
- No service_role key in browser bundles
- CSP headers via vercel.json
- GitHub Actions secret scanning on every PR
- Agent audit trail for all agentic actions
- Human approval gate for high-risk operations (DPD > 90)

## Agent System
The `AgentOrchestrator` (Fable-5 pattern) logs every intended action **before** execution, enforces confidence scores, risk levels, and human approval gates for high-risk O2C actions.
