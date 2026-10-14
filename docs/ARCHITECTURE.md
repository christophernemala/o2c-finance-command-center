# Architecture

Browser → Next.js Server Components / same-origin route handlers → server-only
`pg` connection pool → PostgreSQL RLS and narrowly scoped finance routines.

The app has no Supabase dependency. `DATABASE_URL` is server-only and must use a
non-owner login without SUPERUSER/BYPASSRLS. Finance calls enter a transaction,
set a local opaque session hash, and switch to `authenticated`. PostgreSQL resolves
the user and assurance from the live session table. Commit/rollback clears the
role and session context before a pooled connection is reused; failed rollback
discards the connection. Browser-supplied tenant IDs, roles or JWTs grant no access.

Invited accounts use scrypt password hashes, with support for imported bcrypt.
The browser receives a random 256-bit HttpOnly session cookie; only its SHA-256
hash is stored in the private auth schema. Sessions expire and are revoked on
logout, activation/password reset, or disabling the account. There is no JWT secret
or browser refresh token. TOTP factors use AES-256-GCM with per-user associated data;
verification is serialized and records the consumed counter to reject replay.
Enrollment revokes previous sessions and creates an AAL2 session. Financial RLS
also checks enrolled-factor assurance, independently of route/UI checks.

`workspace_snapshot` constructs workspace lists and full-entity aggregates in one
SQL statement. Numeric amounts are explicitly converted to decimal strings; each
list is capped at 50 records. An aging date uses current balances and is not a
historical ledger. Cash forecasts use independently reviewed source movements and
lineage; invoice due dates never substitute for forecast data.

Finance commands retain composite tenant/entity foreign keys, independent
maker/checker decisions, row/version locks, balance conservation, idempotency and
transactional journal/audit posting. Application SQL identifiers come from a fixed
allowlist; all request values use query parameters. No general SQL endpoint exists.

Original CSV bytes live in private `source_files` rows with a 1 MB limit, scoped
RLS, validated SHA-256 content digest and immutable records. Archival and staging
commit together; failed stages leave neither source files nor batches. The checker
commits the exact preserved import payload; conflicts roll back every imported row.

Identity/profile display attributes never grant memberships. Trusted operators
provision real tenants, legal entities and invitations. There are no default users
or fabricated finance records. OAuth callbacks are retired; invited email/password
and TOTP are the supported login methods.

All protected responses are dynamic/no-store. The browser owns only file previews,
pending submissions and theme selection. CSP uses per-request script nonces and
same-origin connections. All POST routes enforce Origin checks; form bodies are
bounded before parsing. Durable Redis protects login and API budgets across app
instances; outages fail closed. No financial records or tokens go into browser storage.

External ECL/forecast records remain governed inputs; deterministic agent analyses
never send customer messages or post journals. The cash-control journal is not a
complete statutory GL. Privileged database administrators can alter the database;
external archives and backup/restore evidence remain deployment requirements.
