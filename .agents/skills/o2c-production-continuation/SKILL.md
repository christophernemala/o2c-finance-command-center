---
name: o2c-production-continuation
description: Continue the light governed O2C application from verified source and recorded design requirements.
---

# O2C production continuation
Read README.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/RELEASE.md, docs/CUSTOMER_WORKSPACE_DESIGN.md and docs/design/README.md before editing.
Inspect actual branch/HEAD/migrations/callers and current provider configuration. Do not resurrect dark/demo flows or restore the retired Supabase identity adapter.
Follow repository AGENTS.md. Reuse existing UI/PostgreSQL/types/customer identity. No new dependencies without a demonstrated requirement.
Use Next.js server components by default and exact decimal arithmetic; never convert financial calculations to IEEE-754 Number.
Scope every read/write to tenant/entity and preserve RLS, governed RPC, independent maker/checker, version locks, idempotency and audit.
Never fabricate accounts, invoices, balances, forecasts, successful integrations or production readiness.
Implement the next slice in docs/ROADMAP.md, using the editable SVGs as design references. docs/archive/ holds historical audits. Design existence does not mean runtime feature completion.
Require source-complete invoice issuance and SOA, separately private document storage, distinct aging/reconciliation, reporting dates and evidence-linked recommendations.
Do not change ledger values when exploring forecast scenarios. Human approval precedes sensitive financial actions.
Keep source in cloud GitHub/development; secrets belong in configured secret stores, private customer documents in scoped private storage.
Validate relevant tests/typecheck/build and live boundaries separately. Update README.md, docs/RELEASE.md and docs/ROADMAP.md after each material delivery.
Commit format: type(scope): lowercase description under 72 characters.
