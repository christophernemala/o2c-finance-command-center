# O2C release audit — 2026-10-08

## Scope and verified baseline

Reviewed PR #1, its ten original findings, later review feedback, the approved
Next.js design, and related O2C authentication/profile conversations. The original
working checkout is preserved. The isolated PR checkout merges current master
while removing the conflicting Vite/Flask template from the release tree.

The confirmed Supabase project `vaxsnungigkeqxaolqvo` is ACTIVE_HEALTHY,
PostgreSQL 17.6 in ap-northeast-1. Read-only catalog inspection found 27 public
tables with RLS and policies, no PUBLIC table grants, and no anonymous EXECUTE
on the O2C privileged RPCs. Twelve existing Treasury tables are outside this
release and remain unchanged. There are zero Auth users, memberships, tenants,
and entities. The two O2C foundation migrations are already deployed; profiles,
agent jobs, and private source storage were absent at inspection.

Catalog/statistics checks used bounded read-only queries. The five highest
aggregate query timings concern an empty business database and do not prove
real-workload latency, index redundancy, or a reason to remove indexes.

## Remediation being released

- All original PR findings: independent ACL audit, effective role EXECUTE,
  checkout credential removal, canonical import dates, collection pagination,
  transactional insights migration, safe secret instructions, both login
  reservations released, and joined versioned approval evidence.
- Latest floating O2C login design, email/password first, real provider availability,
  invited-account activation, PKCE callbacks, and verified TOTP challenges.
- Server and PostgreSQL assurance checks prevent enrolled MFA accounts from
  bypassing the second factor through direct financial reads/RPCs.
- Profiles store identity attributes separately from financial memberships.
- Durable scoped analysis jobs calculate exact AR aging, prepare collection
  drafts, and identify treasury match candidates from real records. Analysis
  never sends messages or writes the ledger. Interrupted queued jobs are resumable.
- Original validated CSV bytes are archived in private tenant/entity/uploader
  paths. Members can read their scope; makers/admins can insert their originals.
  No application overwrite/delete policy is granted.
- Reviewed forward migrations update existing RPCs without recreating populated
  foundation tables. New schema changes are transactional.
- Browser localStorage has been removed. Theme choice lasts for the page session.
- The vulnerable transitive source-map-js dependency is patched to 1.2.2.

The live Redis integration check passed account/IP budgets, slot release, and
parallel reservations using isolated expiring test keys. Vercel's confirmed
two connected projects now use Next.js, Node 22, npm ci, and npm run build.
All six required variable names were verified in preview/production targets;
secrets were transferred into encrypted provider configuration without printing.
Hosted release runtime must be checked independently of source gates.

The four missing migrations applied successfully after this report's initial
catalog review. Follow-up inspection confirmed profiles/jobs, updated canonical
dates and joined approval evidence, authenticated-only privileged RPC EXECUTE,
the private 1 MB CSV bucket with scoped SELECT/INSERT policies, and all twelve
existing Treasury tables. No Auth users or financial records were generated.

## Required operational evidence

1. Apply only missing profile and forward release migrations after reviewing this
   report; verify deployed definitions, privileges, storage policies, and unchanged
   Treasury objects. Record the resulting provider state in docs/RELEASE.md.
2. Provision the first real company/legal entity and named admin, maker, and
   independent checker. A requested work email/company name is still pending.
   Profiles or email/provider metadata must never grant finance access.
   Live Auth settings currently enable public signup. The app exposes only invited
   password activation and grants no finance access to new identities; the shared
   provider's public-signup setting still needs an owner-reviewed change.
3. Verify real invitation delivery, password login/refresh/logout, TOTP,
   revocation, two-tenant isolation, private uploads, independent approval, and
   duplicate/retry behavior with ordinary Supabase JWTs.
4. Configure real Google/Microsoft provider credentials and exact callback
   allowlists before enabling those buttons. Disabled providers remain visible
   with their unavailable state; there are no simulated social logins.
5. Verify preview and production environment presence, authentication origins,
   protected deployment behavior, runtime responses, and monitoring.
6. Connect governed ERP/bank/forecast/ECL data and any model/message provider
   under concrete scoped contracts. Collection drafts are not two-way delivery.
   The analysis queue does not establish an external background scheduler,
   LLM reasoning runtime, ERP connector, or autonomous financial posting.
7. Qualify workload latency, retention, external immutable audit archive,
   backup/restore, recovery delivery, accessibility, and incident operations.

Archived bytes may remain when staging an import fails; retry uses the same
content-addressed path. The preserved import batch is the authoritative reviewed
payload. Existing local attachments have not been bulk migrated to Storage.

A passing build, merged PR, or Ready deployment does not establish the missing
identity, provider, and real financial workflow evidence.
