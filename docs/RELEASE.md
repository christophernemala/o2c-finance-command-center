## Dashboard statistics — 2026-10-15

Added an explicit server refresh that preserves tenant, entity, workspace and page.
The overview distinguishes an entity with no invoice records from a populated
ledger and links to import review. DSO and CEI cards now state that their
reporting-period calculations are not connected; importing open invoices alone
does not implement these KPIs. No financial records or database migrations changed.

# Deployment qualification — 2026-10-13

## PR #4 CodeRabbit repair — 2026-10-14

The ready PR received eight actionable review comments. Fixes use a forward
source-file policy migration with transaction-local entity selection, retain
migration error causes/rollback uncertainty, validate agent input before budget
reservation, map source-staging conflicts, validate import UUIDs, check MFA-key
configuration and make invitation GET read-only with same-origin POST activation.
The external-review guide now targets the consolidated candidate archive.

Existing applied migrations are unchanged. Apply
`202610140001_source_scope.sql` on the dedicated PostgreSQL target before
claiming the new hosted source-file policy is active. Existing tenant membership
authorizes its entities; this hardening scopes each source-file operation to the
selected authorized entity and does not introduce separate per-entity grants.
Regression coverage includes repeated link scans, CSRF activation denial,
malformed import IDs, same-tenant entity separation and pooled scope cleanup.
Local TypeScript, 56 control tests and build passed after the repair. Hosted
real-user and production finance qualification remain separate release gates.

## Consolidation update — 2026-10-14

The owner selected standalone PostgreSQL/custom Auth. Candidate
`codex/unified-cloud-audit` combines this implementation with the light workspace,
cloud devcontainer and customer design sources. See [unified audit](UNIFIED_AUDIT.md).
A dedicated Neon staging project has seven applied migrations and a verified
non-owner runtime role; all public tables have RLS. It contains no users, tenants,
entities, memberships or business records. Candidate preview DB/MFA settings are
branch-scoped. Original provider records and production configuration are preserved.
Hosted real-user login, maker/checker finance workflows, autonomous scheduling,
provider execution and a running Codespace remain unqualified.

Candidate local checks passed strict TypeScript, 56 tests and a production build.
Dependency installation audit reported zero vulnerabilities. The read-only
`npm run audit:cloud` verified the dedicated hosted runtime connection, non-owner
role, RLS on all 18 public tables, empty anonymous workspace access and denial of
anonymous identity-table reads. These checks inserted no hosted test fixtures.

## Current scope

Next.js now connects directly to standalone PostgreSQL through a restricted pg
pool. Supabase SDKs, public project variables and hosted Auth/Storage calls are
removed. Finance tables retain exact decimal contracts, RLS, tenant/entity scope,
independent maker/checker, versions, idempotency and transactional posting.

Authentication uses app-managed scrypt hashes and opaque HttpOnly sessions stored
as token hashes. Imported bcrypt credentials are supported. Invitations and TOTP
enrollment/challenges run in the application; encrypted secrets and consumed counters
protect factors. Enrolled MFA is enforced by server access and database RLS.
Google/Microsoft provider callbacks are retired; new OIDC login is not implemented.
Public signup, automatic recovery email and MFA recovery codes are not implemented.

Validated private CSV bytes and staged rows now commit atomically in PostgreSQL.
Streamed-byte limits, CSRF, nonce CSP, durable login/API rate limits, private response
caching and disabled production browser source maps remain in effect.

## Rollout

Follow docs/POSTGRESQL_MIGRATION.md and docs/PRODUCTION_PROVISIONING.md.
Use a fresh dedicated PostgreSQL target; do not run the new baseline in place over
the old provider schema. Preserve UUIDs, exact financial records, source bytes and
MFA during any existing-data transfer. Current migrations provision no business
records or default accounts. No hosted data, credentials or deployment settings
have been changed by this implementation.

Vercel needs a restricted pooled DATABASE_URL, MFA_ENCRYPTION_KEY, Redis URL/token,
AUTH_RATE_LIMIT_SECRET and AUTH_SITE_URL. DATABASE_MIGRATION_URL is operator-only
and must not be deployed. Remote TLS certificates are verified. PostgreSQL 17 is
the local integration target; Neon is recommended for serverless deployment.

## Verification

The final source gates are npm run verify and npm audit. Local integration uses
npm run test:postgres on a dedicated disposable loopback database. The validation
record for this revision is recorded after final checks below.

Hosted connection, actual user invitations, HTTPS/session cookies, Redis behavior,
source restoration, MFA recovery and real finance workflows remain live rollout
gates. Previous provider evidence is archived in docs/archive/RELEASE_20261008.md;
it does not qualify the new deployment.

## Supported limits

Controlled CSV imports cover unpaid invoices and bank lines; historical settlements,
FX, credits, refunds, write-offs, period locks and statutory GL exports need governed
implementations. Analysis jobs do not deliver customer messages or post journals.
Forecast/ECL runs require actual approved source inputs. Full-dataset export,
billing, external worker scheduling, ERP/bank connectors, retention and tested
backup/restore remain outside this source migration.

### Local validation record

The final revision passed strict TypeScript, all 56 unit/embedded-database tests,
a production build, eight real PostgreSQL integration checks and five Next.js HTTP
checks. PostgreSQL 17 migrations applied successfully and a second migration run
skipped every unchanged file. Integration was exercised with both loopback trust
and password-authenticated PostgreSQL connections; runtime calls used a restricted
non-owner role. npm audit reported zero known vulnerabilities. Production static
assets contained no browser source maps. The HTTP suite mocks Redis transport;
it does not prove live Lua execution or Neon/Vercel connectivity. Disposable local
containers and test datasets were removed after verification.
