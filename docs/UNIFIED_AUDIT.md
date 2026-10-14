# Unified project audit — 14 October 2026

## Scope and evidence boundary

This audit inspected current GitHub branches/PRs, local source, Vercel project,
deployment and environment metadata, and the new Neon database. Eleven supplied
Codex chat references remain unread: the required `read_thread` tool is absent
from this session. Their titles are not treated as evidence of completed work.
The full chat audit and any requirements visible only inside those chats remain
open. No private conversation contents are published here.

## Findings

| Priority | Finding | Evidence / implication | Resolution or remaining work |
| --- | --- | --- | --- |
| P0 | Two incompatible backend directions | Default `codex/light-finance-workspace` uses Supabase; latest previews use `codex/postgresql-migration` at `70f0bd4` | Owner selected standalone PostgreSQL/custom Auth; this candidate combines it with the light source assets |
| P0 | PostgreSQL preview lacked runtime configuration | Both Vercel projects initially lacked `DATABASE_URL` and `MFA_ENCRYPTION_KEY`; the latest accessible PostgreSQL preview returned a connection-unavailable screen | Dedicated Neon staging created; restricted runtime connection and MFA key configured for this candidate preview only; verify deployed behavior |
| P0 | No real onboarding | New Neon staging has zero users, tenants, entities and memberships | Obtain actual platform administrator and workspace/entity identity, provision explicitly, then verify real HTTPS login and MFA |
| P0 | Autonomous runtime is incomplete | Agent API enqueues and attempts synchronous deterministic database analysis; jobs have queued/completed states | Add durable leases, attempt/time/spend budgets, recovery, terminal quarantine, unknown outcomes and a hosted scheduler |
| P0 | No connected source or delivery workflow | Current app supports controlled CSV ingestion and drafts/candidates; ERP/bank/inbound-mail adapters and customer-message delivery are absent | First connect an authorized read-only source; qualify one controlled external effect at a time |
| P1 | Two Vercel projects | `o2c-finance-command-center-app` and `o2c-finance-command-center` both build the repository | Use `o2c-finance-command-center-app` for this candidate preview; retain the other until production/rollback target is qualified |
| P1 | Supabase state cannot be freshly qualified | Management metadata reports ACTIVE_HEALTHY but SQL/migration calls timed out | Preserve the old provider; do not infer data absence or perform destructive migration |
| P1 | Separate Treasury code cannot be concatenated safely | Northstar uses Supabase SDKs, tenant-only Actor contracts and a service-role helper; candidate uses custom sessions and tenant/entity SQL authorization | Port specific treasury capabilities into candidate contracts after schema/authority mapping; existing O2C cashflow/reconciliation remain shared |
| P1 | Custom Auth adds operational obligations | Invited activation, scrypt, opaque sessions and TOTP exist; social login, automatic recovery email and recovery codes do not | Qualify secure invitation delivery, administrator recovery, MFA-key backup and session revocation |
| P1 | Cloud development not provisioned | Codespaces API cannot enumerate with the available credential; it lacks `codespace` scope | Devcontainer is restored; account authorization is still needed to create a running Codespace |
| P1 | Designs exceed implemented features | Customer identification, documents, invoice issuance and full SOA screens are specifications | Preserve designs; implement scoped data/storage/workflows before claiming these features |
| P1 | Enterprise operations remain unproven | No measured workload, backup restore, immutable external audit archive or live source reconciliation evidence | Complete release qualification and disaster recovery exercises before production promotion |

## What already exists in the consolidated source

- Exact AED decimal strings and PostgreSQL numeric amounts.
- Tenant/entity financial RLS and authenticated scoped SQL operations.
- Independent maker/checker, stale evidence/version checks, idempotency and atomic posting.
- CSV validation/private original archival, independent import review and XLSX export.
- Customer/receivables views, governed 13-week cashflow and cash application.
- Deterministic AR/collections/treasury analysis records and review-required outputs.
- Invitation activation, password login, session revocation and replay-protected TOTP.

Passing tests qualify these source behaviors only within their tested boundary.
They do not establish real account login, provider delivery or autonomous operation.

## Database evidence observed in this session

Neon project `autonomous-ar-platform`, PostgreSQL 17, staging branch, dedicated
database `autonomous_ar`. Seven checksum-tracked migrations applied. All public
tables have RLS enabled. `o2c_runtime` has no superuser, BYPASSRLS, CREATEDB or
CREATEROLE privileges and was verified not to be a finance owner. No real or
synthetic business records were inserted. Hosted financial policy qualification
with real maker/checker identities remains pending.

## Ordered completion backlog

1. Read all eleven linked chats and reconcile requirements against this source.
2. Verify candidate CI and hosted PostgreSQL/Redis configuration; qualify TLS,
   non-owner role, session cookies and unavailable/denied responses.
3. Provision real administrator/workspace/entity and a separate checker. Prove
   login, MFA, revocation and cross-tenant/entity denial on the deployed service.
4. Validate one real source import against authoritative control totals. Prove
   independent review, retry/concurrency handling, posting and audit conservation.
5. Implement durable background analysis scheduling and source freshness checks.
6. Add evidence-backed promise tracking and matching in shadow/proposal mode.
7. Add approved communication delivery with idempotency and outcome reconciliation.
8. Port additional Treasury capabilities with one identity/approval model.
9. Qualify backup/restore, key recovery, monitoring, limits and deployment rollback.
10. Promote one production target, update the default branch and retire duplicate
    deployments only after their records/configuration are safely accounted for.

No claim of a complete eleven-chat audit, full Treasury port, autonomous provider
execution or production readiness is made by this consolidation.
