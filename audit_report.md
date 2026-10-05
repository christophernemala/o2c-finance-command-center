# Supabase infrastructure audit — 2026-10-05

Target: `vaxsnungigkeqxaolqvo`, `ap-northeast-1`, PostgreSQL 17.
Scope: infrastructure inspection and reusable skill, not a database migration.

## Live evidence

The authenticated Supabase `get_project` response reports **INACTIVE**.
Live SQL catalog access, advisors, query plans, index usage/history, extension/cron
configuration, Realtime and webhook delivery have not been verified. No database
DDL, extension activation, cron scheduling, publication changes, credential changes
or index removals were attempted. No 100ms latency or production-readiness claim
is supported. Project activation and authorized catalog access are prerequisites.

## Repository evidence

- `202610040001_workspaces.sql` creates `memberships`, not `tenant_memberships`;
  its primary key is `(tenant_id,user_id)`, referencing `tenants(id)`/`auth.users(id)`.
  RLS and `member_read` already permit authenticated SELECT of the user's membership.
  `workspace_access()` uses invoker permissions. An empty result needs valid identity
  and actual membership provisioning, not an assumed policy replacement.
- The two migrations enable RLS on all 15 public application tables. Application
  grants are SELECT only; scoped financial writes occur in role-checked RPCs with
  independent approval, immutable evidence, version checks and idempotency.
- `numeric(15,2)` is the existing record contract. There are no `payments`,
  `dunning_jobs`, `o2c_state_events`, `webhook_configs` or `langgraph_runs` tables.
  Invoice state uses `lifecycle`, `dispute`, `collection`; no `status`/`deleted_at`.
  The supplied sample indexes therefore cannot be applied to this schema.
- Existing indexes cover invoice/bank/approval/audit scope and allocation lookups.
  Source inspection cannot establish index redundancy or workload performance.
- GitHub CI and Vercel deployment producers exist. No tenant-facing workflow event
  consumer, LangGraph implementation, Realtime client or signed webhook handler
  exists in this checkout. These integrations require a real producer/consumer and
  scoped credential contract before adding database tables or deployment endpoints.
- Login already fails closed when Supabase/Redis configuration is absent. RLS
  changes would not resolve that configuration blocker.

## Corrected implementation

The repository skill preserves audit → evidenced RLS remediation → measured index
changes → authorized Realtime/webhook integration order. Its read-only SQL reports
catalog/grant/index/constraint/publication metadata without financial row contents,
including statistics resets and protected index characteristics. It emits no DROP
or CREATE statements and never treats zero scans as permission to remove an index.
No speculative migrations or integration stubs are added to the migration chain.

## Next live steps

1. Activate the confirmed project and review schema compatibility/backups; compare
   the actual deployed migration history to this checkout before making changes.
2. Run the packaged audit SQL read-only with bounded statement timeout. Keep raw
   metadata results in a protected audit location; update this report with redacted
   results, actual gaps, role/JWT tests and a concrete remediation plan.
3. Observe representative index use for at least 30 uninterrupted days, including
   reset/recreation history and rare finance workloads. Review exact definitions,
   dependencies and rollback before any approved removal.
4. Review top five actual read plans under ordinary tenant identities. Index changes
   need real column/plan evidence and before/after measurements against 100ms target.
5. For deployed integrations, establish tenant mapping, restricted ingestion identity,
   signature/replay contract, private channel authorization and real delivery tests.

## Local validation

Skill-creator validation passed for the repository package and installed Codex copy;
all three installed resources match the repository SHA-256 hashes. Strict TypeScript,
all **30 tests**, and the Next.js production build passed. The new embedded PostgreSQL
test executes the audit inside a READ ONLY transaction, confirms 15 protected tables,
recognizes primary/constraint and foreign-key prefix indexes, flags deliberately
unprotected/deny-all test tables, and confirms no index removal authorization.
These results do not substitute for live Supabase authentication or measured traffic.
