# Security controls

The runtime uses standalone PostgreSQL with app-managed identity. Database,
Redis and MFA credentials are server-only; there are no public project keys,
provider SDKs, JWT secrets or tokens in localStorage/sessionStorage.

## Identity and database access

Passwords use scrypt (`N=65536`, `r=8`, `p=1`, random 16-byte salt, 64-byte key).
Activation requires 12–256 characters. Existing imported bcrypt costs 4–14 can
be verified and upgraded on successful login when the password meets the new
minimum length. Account failures use a generic message and absent accounts still
perform a password derivation. No password or signing key is sent to the frontend.

Session cookies contain 256 random bits and explicitly use HttpOnly, SameSite=Lax
and Secure on hosted production, with a `__Host-` name. Only SHA-256 token hashes
are persisted. Login sessions last at most 12 hours; pre-MFA and invitation sessions
last 10 minutes. Disabling an account, logout or password activation immediately
invalidates the relevant sessions. Financial identity is resolved from live
sessions in PostgreSQL, not request-supplied claims.

TOTP uses 6 digits, a 30-second step and a ±1-step window. Factors are encrypted
with AES-256-GCM and user UUID associated data. Row locks and a stored counter
prevent concurrent/replayed code use. Enrollment requires a valid login and a
successful code; it revokes earlier sessions. Enrolled MFA is enforced by server
access checks and database membership resolution. MFA is optional for accounts
that have not enrolled; mandatory organization-wide enrollment is not implemented.
Account security provides manual-key enrollment. Recovery requires reviewed
administrator identity verification; automatic emails and recovery codes are absent.

`DATABASE_URL` must use a non-owner role without SUPERUSER/BYPASSRLS. The application
refuses privileged/owner connections. Every finance transaction switches locally
to `authenticated` and resolves an opaque session hash. RLS, tenant/entity FKs,
record ownership checks, independent maker/checker, versions and exact decimal
limits remain in PostgreSQL. UI checks are supplemental. Application identifiers
are fixed allowlists and all external values are SQL parameters.

## Requests, uploads and abuse controls

Every POST checks a strict same-origin browser Origin. SameSite cookies add
protection. CORS grants no cross-origin browser API access. Nonce CSP, React text
escaping, nosniff and frame denial reduce XSS risk. CSP connects only to this app;
inline CSS remains allowed. Production browser source maps are disabled.

Form parsers receive only bounded streamed bytes, regardless of Content-Length.
CSV uploads require a valid extension, strict UTF-8, supported headers/fields,
canonical dates, AED decimal strings, at most 1 MB and 2,000 rows. Originals live
in PostgreSQL with verified digests, scoped RLS and immutable rows. Original bytes
and staged payloads commit atomically. File names are metadata, never file paths.
There is no arbitrary binary upload or request-provided URL fetch endpoint.

Durable Redis uses atomic Lua and Redis time. Five failed/in-flight account slots
or 30 failed/in-flight IP attempts in 15 minutes block login/activation/MFA. Successful
membership-verified login removes only its own reservations. API budgets count all
requests independently per user and scope: 120 commands, 30 agent requests and 30
exports per minute. Redis errors/missing configuration fail closed; logout remains
available. Keys contain HMAC identifiers rather than raw email/IP/user IDs.
Production IP headers trust Vercel's overwritten `x-vercel-forwarded-for` only.
Another host requires a reviewed proxy adapter. The explicit local HTTP test mode
is limited to a loopback-bound server; never configure it on hosted deployments.

## Server-only configuration

- `DATABASE_URL`: restricted runtime connection; remote certificates are verified.
- `DATABASE_SSL_CA`: optional trusted CA PEM.
- `MFA_ENCRYPTION_KEY`: canonical base64 of 32 random bytes. Preserve and back it up
  securely; key rotation needs re-encryption of every factor.
- `UPSTASH_REDIS_REST_URL`: HTTPS Upstash origin, no paths or redirects.
- `UPSTASH_REDIS_REST_TOKEN`: write-enabled token for the dedicated Redis database.
- `AUTH_RATE_LIMIT_SECRET`: independent random secret of at least 32 characters.
- `AUTH_SITE_URL`: canonical HTTPS app origin, or explicit local development origin.

The schema-owner `DATABASE_MIGRATION_URL` belongs only in local/operator setup,
never the deployed application. Do not disclose credentials, activation URLs or
TOTP setup keys in logs. Operator invitations deliberately print a private link
for approved delivery; automated mail is not implemented. Review hosting access
logs so invitation query strings are not retained as plaintext credentials.

## Checklist and evidence limits

| Requested control | Status |
| --- | --- |
| SQL injection | Parameterized values and fixed finance routine identifiers. |
| XSS | Escaped React text, nonce CSP, same-origin connections. |
| CSRF | Origin checks on every POST and SameSite cookies. |
| Upload validation | Byte, format, schema, field, row and digest checks. |
| Object/server authorization | Scoped PostgreSQL RLS and governed finance routines. |
| Rate limiting | Shared durable login/MFA and per-user API budgets. |
| JWT secrets | JWTs removed; opaque server sessions replace them. |
| Frontend secrets | Database, Redis and MFA keys stay server-only. |
| Password hashing | App-managed scrypt; imported bcrypt verification. |
| MFA | In-app enrollment, challenges, counter replay protection and AAL2 enforcement. |
| CORS | No cross-origin API allowlist or permissive response headers. |
| Browser token storage | HttpOnly cookies; no localStorage/sessionStorage tokens. |
| RLS | Enabled and tested; runtime cannot bypass/own finance tables. |
| Webhooks | No receiver exists; any new receiver needs signature verification. |
| SSRF | No user URL fetch; Redis origin restrictions and verified database TLS. |
| Source maps | Production browser maps disabled. |
| Default credentials | No seeded administrators or deployment passwords. |
| Sensitive logs | Stable errors, no application console logs; hosting log review required. |
| Dependencies | Audit at release and regularly update supported frameworks. |

Local PostgreSQL and embedded database tests prove the exercised controls, not
Neon/Vercel connectivity, private mail delivery or hosted recovery. Migration
validation, real auth cookies, HTTPS, trusted headers, Redis behavior, representative
finance workflows, backup restoration and key retention need deployment checks.
See [POSTGRESQL_MIGRATION.md](POSTGRESQL_MIGRATION.md) for rollout and rollback.

The 2026-10-13 local validation passed 56 unit/embedded tests, eight real PostgreSQL
integration checks and five Next.js HTTP checks, plus TypeScript and the production
build. npm audit reported zero known vulnerabilities. Real managed-host auth,
Redis Lua, HTTPS deployment settings and existing-data transfer remain unverified.
