# Complete review and next steps — 2026-10-08

## Architecture decision

The approved application is Next.js App Router, strict TypeScript, Tailwind,
Supabase SSR/PostgreSQL and Decimal.js. The newer floating O2C wordmark,
navy/violet/teal surfaces, light/dark treatment and email-first authentication
replace the old generic Vite/Flask runtime. The old files are removed from the
release tree; Git history and the original dirty working checkout are preserved.

Authentication establishes identity and second-factor assurance. Memberships
and entities authorize finance operations. Profiles are non-authorizing.
Server pages reuse the scoped snapshot; PostgreSQL RLS and governed RPCs defend
direct API access. Exact decimal strings remain exact through calculation and
display. Browser localStorage holds no application state.

The agent queue records requested scope, identity, source observation time and
immutable completed results. AR analysis calculates real aging; collections
prepare unsent drafts; treasury presents source match candidates. Human decisions
and separate posting remain required. This deterministic analysis is useful
without inventing a model provider or customer communication channel.

## Review findings and disposition

| Finding | Release disposition |
| --- | --- |
| Reader-dependent grants audit | Table ACL expansion includes PUBLIC and default ACL semantics |
| Definer RPC access | Effective EXECUTE for named application roles retained with public_execute |
| Checkout token persistence | Disabled; checkout/setup-node actions pinned |
| Release counts/migration order | Historical counts labeled; complete ordered chain documented |
| Secrets in example file | Real values belong in ignored .env.local or encrypted hosted configuration |
| Partial insights migration | Transaction wraps all schema changes |
| Successful login exhausts NAT budget | Both account/IP reservations released; signed continuation through OAuth/MFA |
| Unrelated collection Next link | Per-collection page state and active-view pager |
| Relative/ambiguous import dates | Exact PostgreSQL format and canonical round-trip |
| Opaque approval evidence | Joined source details and captured/current versions; stale controls disabled |
| Profile role escalation | Profiles cannot grant or mutate memberships |
| MFA bypass through direct RPC | Verified-factor assurance enforced in financial membership resolution |
| Old/new architecture collision | Merge keeps the approved Next.js runtime and removes old Vite/Flask files |
| Transitive dependency advisory | source-map-js patched; audit gate required |
| Raw source custody | Private scoped originals with no application overwrite/delete policy |
| Missing agent execution | Durable real source analysis and resumable requests; no fabricated outcomes |

## Operational sequence

1. Merge reviewed source after strict typecheck, all tests, production build and
   dependency audit. Verify the matching GitHub commit and hosted deployment.
2. Apply only missing live migrations; inspect catalog state after each.
3. Provision a real named company/legal entity and at least one maker and an
   independent checker through trusted administration. Invite the supplied work
   emails; never generate demo users or infer roles from profile/provider claims.
4. Verify password invitation/login, refresh, logout, recovery, TOTP and real
   social providers. Provider credentials and redirect settings are prerequisites.
5. Import authorized source records, verify control totals, inspect source
   evidence as checker, approve and separately post. Exercise retry and revocation.
6. Run scoped analysis jobs; review outputs against source records. Supply governed
   cashflow and ECL inputs before expecting those results.
7. Define ERP/bank adapter contracts, real two-way collections delivery, model
   access and background worker scheduling. Require signatures, scoped credentials,
   retry/replay defenses, audit trails and human approval for financial effects.
8. Qualify monitoring, backup restoration, immutable external archive, retention,
   performance and accessibility with real representative workloads.

## Remaining evidence boundaries

The empty hosted project cannot prove real user MFA, cross-tenant JWT isolation,
financial posting, invitation delivery or governed source integrations. Embedded
PostgreSQL tests prove the tested rules, not production identity/provider behavior.
Redis checks prove the exercised limiter behavior on the actual configured Redis.
Local browser checks prove the inspected UI; protected hosted deployments require
their own runtime validation.

Private originals can persist if subsequent staging fails. Import batches remain
the authoritative reviewed payload; existing attachments were not bulk migrated.
Theme is session-only. Full-dataset exports, SaaS billing, FX and statutory GL
features remain outside the supported finance commands.
