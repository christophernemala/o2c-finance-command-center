---
name: supabase-principal-architect-infrastructure-optimization
description: Audit and harden O2C Supabase infrastructure before release or when investigating RLS, query performance, or signed integration delivery. Inspect existing schema and live evidence before changing policies, indexes, cron, Realtime, or webhooks; do not build unrelated product features.
---

# Supabase infrastructure optimization

Default target: Christopher Nemala's O2C repository and Supabase reference
`vaxsnungigkeqxaolqvo` in `ap-northeast-1`. Verify project identity, status and schema
each run. An inactive project is a connectivity blocker, not evidence of an RLS bug.
Keep the existing Next.js/Supabase SSR architecture and exact AED amounts.

## Audit before mutation

1. Inspect repository instructions, migrations, Supabase clients, RPC callers and
   deployment configuration. Do not output secrets or source financial records.
2. Read project metadata. If inactive or access is denied, record the blocker in
   `audit_report.md`; continue local schema validation without claiming live results.
3. For an active authorized project, run [scripts/audit.sql](scripts/audit.sql) in
   a read-only transaction or a read-only SQL tool. Save timestamped catalog results
   securely, then summarize findings and proposed changes in `audit_report.md`.
   It inventories extensions without enabling them, RLS/policies/grants, definer
   RPCs, constraints, statistics and publication membership without financial rows.
4. Review the report before any DDL. Enabling extensions, scheduling jobs, changing
   grants or publications are writes, not part of read-only discovery. Reuse existing
   cron jobs only after inspecting their names, owners, commands and schedules with
   secrets redacted. Audit jobs may collect metadata; never let cron auto-drop indexes
   or auto-rewrite access policies.
   If `pg_cron` is installed and access permits, read `cron.job` job ID/name/schedule/
   active/owner metadata and aggregate `cron.job_run_details` success/failure counts
   and duration. Do not export command or return-message contents that may contain
   secrets. If `pg_stat_statements` is installed, discover its schema and inspect
   query IDs, calls and execution timings first; review redacted normalized statements
   privately to identify actual slow reads. Missing extensions are recorded gaps,
   never automatically enabled during this phase.

## Remediation order and invariants

- **RLS:** derive changes from actual callers, role grants and schema. In this repo,
  `public.memberships(tenant_id,user_id,role)` references `public.tenants(id)`;
  `member_read` permits authenticated SELECT where `user_id=auth.uid()`.
  `workspace_access()` is invoker-scoped. Verify JWT identity and membership before
  diagnosing an empty login result. A table with no policies can intentionally deny
  all application access. Do not create `tenant_memberships` or a blanket `FOR ALL`
  financial policy. Preserve RPC authorization, tenant/entity foreign keys,
  independent maker/checker approval and no direct application financial writes.
- **Indexes:** low `idx_scan` and high `seq_scan` are investigation signals only.
  Before proposing removal, collect at least 30 continuous days of representative
  observations with no relevant statistics reset/recreation, verify zero scans and
  size over 10 MiB, and inspect uniqueness, constraints, foreign-key support,
  replica identity, dependencies and rare operational queries. Never drop a protected
  index. Prepare exact definition/rollback and seek explicit approval for removal.
  Generate target index DDL from verified columns and real query plans, not guessed
  `status`, `payments` or `deleted_at` fields. Follow
  [references/integrations.md](references/integrations.md) for execution boundaries.
- **Realtime and webhooks:** first verify deployed producers and consumers. GitHub
  deployment workflows do not prove a tenant-facing webhook integration exists;
  `agent_runs` does not prove LangGraph exists. Read the integration reference before
  adding tables, publication members, channel policies or an Edge Function. Keep all
  financial writes behind existing human approval. No service-role bypass in handlers.
- **Precision:** preserve `numeric(15,2)` and decimal strings. Changing to
  `numeric(19,4)` is a separate reviewed data/validation migration, not optimization.

## Verification and delivery

Exercise SQL with existing embedded PostgreSQL tests, then real staging JWTs from
two tenants before live deployment. Use `supabase db lint --linked` only after
verifying the linked project and installed CLI; record unavailable CLI/database
checks accurately. Validate representative read-only query plans with bounded
timeouts, actual tenant/entity parameters and normal roles. `EXPLAIN ANALYZE`
executes its statement: never use it on financial mutations in production.
Report p95 and repeated timings for the five highest-cost real reads against the
100ms target; an empty local database is not a production latency result.

Run `npm run typecheck`, `npm test`, and `npm run build` after repository edits.
Commit with the repository's conventional format, such as
`chore(db): add supabase infrastructure audit`. Report source changes, local checks,
live provider checks and outstanding integration prerequisites separately. Never
seed demo records, weaken login controls, or claim production readiness from a build.
