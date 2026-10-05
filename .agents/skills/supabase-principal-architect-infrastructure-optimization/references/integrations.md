# Index and integration execution boundaries

## Index changes

Preserve the exact `pg_get_indexdef` result and dependencies in the change report.
Do not execute an automatically generated DROP statement. After the required
observation window and exact-target removal approval, use schema-qualified
`DROP INDEX CONCURRENTLY` where PostgreSQL supports it, never CASCADE.
Run concurrent index creation/removal separately from transaction-wrapped migrations;
partitioned/constraint-backed indexes require a different reviewed procedure.
Check for failed invalid indexes, observe disk/lock impact, and compare normal-role
plans before/after. `IF NOT EXISTS` does not prove that an existing index has the
desired definition. Sources: [CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html),
[DROP INDEX](https://www.postgresql.org/docs/17/sql-dropindex.html),
[statistics and resets](https://www.postgresql.org/docs/17/monitoring-stats.html).

## Realtime

Discover existing tables/publications and actual clients first. Publishing a table
with Postgres Changes is different from sending Broadcast messages. Prefer minimal
event identifiers/status/version over raw agent state, invoices or webhook payloads.
Every event needs tenant and, where applicable, entity scope; foreign keys reference
`tenants(id)` / `entities(tenant_id,id)`, not a non-unique membership tenant column.
Reuse `agent_runs`/`audit_events` if they satisfy the actual event contract.

For database Broadcast, use private tenant/entity topics, authenticated receive
policies on `realtime.messages`, a server-authorized trigger and `private: true` on
the subscriber. Do not alter ownership or re-enable RLS on Supabase-managed tables.
Inspect existing permissive policies: adding a restrictive-looking policy does not
override another policy that already grants broad access. Never grant client INSERT
of forged operational events. Configure private-only channels if required after
reviewing existing integrations. Verify two tenants, revocation, reconnect/deduplication,
and actual delivered notifications; a SELECT query is not a Realtime test.
Sources: [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization),
[database subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes).

## Signed webhooks

Before building `o2c-webhooks`, identify the real sender, allowed repository/workflow
or graph, destination tenant/entity, credential issuer and event schema. Keep an
administrator-managed registry out of public client reads/writes. It may store
secret references, never secrets; do not expose Vault decrypted values through
anon-accessible RPCs. Never accept a tenant identifier from an unverified body.

Verify HMAC over bounded raw request bytes before JSON parsing. GitHub's
`x-hub-signature-256` uses `sha256=` plus a hex digest; use constant-time verification,
event allowlists, repository identity checks and unique delivery IDs for idempotency.
A purported `x-langgraph-signature` is not a universal documented provider contract:
obtain the deployed sender's signing format, timestamp/replay policy and test vector.
Do not invent it or reuse GitHub's verifier without proof.

An anon/publishable key alone is not an authenticated RLS identity. A handler without
service-role bypass requires a real narrowly authorized ingestion identity/JWT or
other reviewed restricted database transport, tenant mapping, revocation and a scoped
ingestion RPC. Keep event ingestion separate from financial posting. Do not grant
anon arbitrary INSERT or forge `auth.uid()` to make the integration appear to work.
If no restricted transport is available, leave deployment blocked rather than
silently substituting a service-role key.

External senders generally cannot supply Supabase JWTs; any change to function JWT
verification must be paired with the complete verified signature/authorization path
and reviewed as a security-sensitive deployment. Add timeout/body limits, stable
errors, no payload/secret logging, replay protection and transactional deduplication.
For an outbound dynamic registry, allow only reviewed HTTPS destinations, reject
private/loopback/link-local endpoints, validate DNS at connection time and do not
follow redirects; prevent SSRF before enabling dispatch. Test tampered bytes, invalid
signature, replay, wrong tenant/repository, disabled configuration and outages.
Sources: [GitHub signature validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries),
[Supabase function authorization](https://supabase.com/docs/guides/functions/authorization).
