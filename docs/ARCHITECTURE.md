# Architecture

Browser → Next.js Server Components / same-origin route handlers → Supabase SSR
cookie client → PostgreSQL RLS reads and narrowly scoped command RPCs.

The public publishable key grants no financial-write capability by itself. Supabase
validates the user; database membership determines tenant role. Financial records
and related entities use composite tenant/entity foreign keys.

`workspace_snapshot` constructs every workspace list and full-entity aggregate in
one SQL statement. Numeric amounts are explicitly converted to text before JSON
serialization. Each list is capped at 50 records; no paginated list becomes a KPI total.
The date is an aging date against current balances, not a historical-balance claim.

Application mutations use same-origin POST handlers, validated UUID/decimal inputs,
server user validation, and PostgreSQL role checks. RLS exposes no direct insert,
update or delete policy. The database owns proposal immutability, independent
approval, row locks, version conflicts, balance conservation, and idempotency.
Posting updates records, cash-control journals and audit evidence in one transaction.

Import review preserves validated source rows in the database. The database hashes
the canonical payload plus kind, preventing a reviewer from committing a changed
mapping. A different authorized user commits the exact batch. Conflicting references
roll back every row. Uploaded bank lines do not automatically become receipts.

Tables: tenants, memberships, entities, customers, invoices, bank_lines, receipts,
approvals, allocations, journals, import_batches, ecl_runs, agent_runs, audit_events.
Trusted administrators provision memberships; the product cannot self-promote a user.

All protected responses are dynamic/no-store. Client components own theme preference,
file preview and pending submission state only. Tenant/entity changes remount forms.
CSP uses per-request script nonces; other headers deny framing and content sniffing.

No synthetic financial records are included. External ECL/agent inputs are read-only
review capabilities pending integration. Journals cover receipt/allocation controls,
not every required GL operation. Audit immutability is application/database-trigger
protection, not protection from privileged database administrators.
