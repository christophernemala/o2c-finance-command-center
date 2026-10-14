# O2C Finance Command Center — code changes

Date: 2026-10-13. Stack: Next.js App Router, TypeScript, PostgreSQL and Vercel.
This document summarizes the PostgreSQL migration for an independent code review.
It is not a substitute for reviewing the source or proof of a live deployment.

## Main change

Replaced Supabase database, authentication and private-storage clients with direct
PostgreSQL access and app-managed authentication. Removed `@supabase/ssr` and
`@supabase/supabase-js`; added `pg`, `otpauth`, `bcryptjs` and development `@types/pg`.
Neon is the recommended managed host, but no live Neon connection is configured.

## Changed areas

| Area | Implementation | Review files |
| --- | --- | --- |
| Database access | Server-only connection pool, verified remote TLS, refusal of owner/SUPERUSER/BYPASSRLS connections, transaction-local role and session context | `src/lib/postgres/config.ts`, `pool.ts`, `transaction.ts`, `server.ts` |
| Finance queries | Fixed routine allowlist and parameterized values; scoped import and agent reads | `src/lib/postgres/client.ts`, `src/lib/workspace.ts` |
| Passwords | Scrypt with random salts; imported bcrypt verification | `src/lib/auth/crypto.ts`, `service.ts` |
| Sessions | Random opaque HttpOnly cookies; database stores SHA-256 token hashes; expiry and revocation | `src/lib/auth/service.ts`, `cookie-options.ts`, `src/lib/postgres/server.ts` |
| Invitations | Operator-issued single-use activation links and restricted activation sessions | `scripts/invite.ts`, `src/app/auth/confirm/route.ts`, `src/app/api/auth/signup/route.ts` |
| MFA | Manual-key TOTP enrollment, AES-GCM factor encryption, consumed-counter replay protection and session rotation | `src/lib/auth/crypto.ts`, `service.ts`, `src/app/api/auth/enroll/route.ts`, `src/app/api/auth/mfa/route.ts`, `src/app/auth/security/page.tsx` |
| Authorization | Retained tenant/entity RLS, record checks, independent maker/checker, versions and transactional posting | `postgres/migrations/`, `src/lib/auth-flow.ts` |
| Private CSV originals | Bounded immutable PostgreSQL byte storage with digest checks; archival and staging share one transaction | `postgres/migrations/202610130001_source_files.sql`, `src/lib/postgres/client.ts`, `src/app/api/commands/route.ts` |
| CSRF and request limits | Strict Origin checks; actual streamed bytes bounded before form parsing | `src/lib/request-security.ts`, `src/app/api/` |
| Rate limiting | Durable Redis login/MFA protection plus per-user command, agent and export budgets | `src/lib/login-limiter.ts`, `src/lib/api-limiter.ts` |
| Browser protections | Nonce CSP, same-origin connections, private/no-store responses and disabled production browser source maps | `src/proxy.ts`, `next.config.ts` |
| Setup and CI | Ordered checksummed migrations, explicit invitations and disposable PostgreSQL integration checks | `scripts/migrate.ts`, `package.json`, `.github/workflows/verify.yml` |

Financial amounts remain exact decimal strings backed by PostgreSQL numeric fields.
Migrations create no default administrators or business records. Existing financial
tables and relationships are retained; private source storage uses a new table.

## Behavior changes and limits

- Google/Microsoft login and legacy provider callbacks are retired. New OIDC login
  requires a separate implementation.
- Invited email/password and TOTP are supported. MFA is enforced for enrolled
  accounts; mandatory enrollment for every account is not implemented.
- Automatic invitation/recovery email delivery and MFA recovery codes are absent.
- The baseline targets a fresh standalone database. Existing user UUIDs, financial
  records, private source bytes and MFA need a controlled transfer before cutover.
- No hosted database, production credentials or deployment settings were changed.

## Recorded local validation

The migration work passed TypeScript, the production build, 56 unit/embedded
database tests, eight real PostgreSQL integration checks and five Next.js HTTP
checks. Migration reruns skipped unchanged files. Dependency audit reported zero
known vulnerabilities. These are the recorded results from the implementation;
tests were not rerun merely to create this summary.

PostgreSQL 17 checks covered pooled tenant isolation, owner-role refusal, forged
claims, exact amounts, atomic source archival, MFA replay, invitation activation,
session expiry and revocation. HTTP checks used a test-only Redis transport;
they do not establish live Redis Lua, Neon/Vercel connectivity or hosted recovery.

## Independent review request

Review the actual changed source and SQL for concrete bugs in authentication,
session isolation, RLS, MFA replay/concurrency, password-reset races, database
privileges, upload validation and migration/rollback. Cite file locations and
explain exploit conditions. Separate verified findings from assumptions.

Share this document with the changed source and
`docs/POSTGRESQL_MIGRATION.md`. Do not share `.env` files, real credentials,
activation links, TOTP setup keys or customer financial data.

Setup and rollback: [PostgreSQL migration](docs/POSTGRESQL_MIGRATION.md).
Security details: [Security controls](docs/SECURITY.md).
Release evidence: [Release qualification](docs/RELEASE.md).
