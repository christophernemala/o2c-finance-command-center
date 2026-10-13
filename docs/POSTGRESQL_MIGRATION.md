# Standalone PostgreSQL migration

The application now uses PostgreSQL directly. There are no Supabase SDKs, public
project keys, browser database clients, provider JWTs or hosted storage calls.
Neon is the recommended managed host for Vercel; PostgreSQL 17 is the locally
verified version. Standard PostgreSQL hosting works with a verified TLS connection.

## New database setup

Create a dedicated database/Neon project and take a backup before importing data.
Use the schema owner's **direct** connection for migration; use the restricted
runtime login's **pooled** connection in Vercel. PostgreSQL roles are cluster-wide;
the baseline rejects conflicting existing roles/schemas instead of silently
accepting different ownership. Do not apply this baseline to an existing provider
project or over an existing finance schema.

1. Install dependencies with `npm ci` and copy `.env.example` to `.env.local`.
2. Set `DATABASE_MIGRATION_URL` to the new database's schema-owner connection.
   Use `sslmode=verify-full` for a remote host. All TLS certificates are verified;
   `DATABASE_SSL_CA` can provide a trusted CA PEM when needed. Local PostgreSQL on
   loopback can use `sslmode=disable`.
3. Run `npm run db:migrate`. The ordered SQL in `postgres/migrations` creates
   identity/session tables and the existing finance schema without business data.
   Advisory locking, checksums and one transaction per file make successful
   migrations skippable and failed files retryable. Never edit an applied migration.
4. Create a separate runtime login using your database administrator. Set its
   password privately with your database client's password prompt:

   ```sql
   create role o2c_runtime login nosuperuser nobypassrls nocreatedb nocreaterole;
   grant o2c_app to o2c_runtime;
   ```

   In psql, use `\password o2c_runtime`. Do not put a password in source, chat or
   shell history. Do not grant it the schema owner's role or a Neon owner role.
5. Set `DATABASE_URL` to that runtime login's connection. The app refuses
   superuser, BYPASSRLS and finance-owner connections. Each finance transaction
   uses `SET LOCAL ROLE authenticated`; live sessions resolve identity and AAL.
6. Generate the MFA key and Redis identifier secret privately:

   ```sh
   node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Generate a different value for each of `MFA_ENCRYPTION_KEY` and
   `AUTH_RATE_LIMIT_SECRET`. Store them only in ignored local configuration or
   encrypted hosting variables. MFA encryption keys require canonical base64
   encoding of exactly 32 bytes. Back up the MFA key securely with the database;
   changing it without re-encrypting factors prevents authenticator verification.
7. Configure Redis and `AUTH_SITE_URL`. See `docs/SECURITY.md`.
8. Provision the actual tenant/legal entity, then issue real invitations as
   described in `docs/PRODUCTION_PROVISIONING.md`. No default administrator exists.
9. Run `npm run verify` and `npm audit` before deploying a preview.

On Vercel, deploy only `DATABASE_URL`, optional `DATABASE_SSL_CA`,
`MFA_ENCRYPTION_KEY`, the three Redis/HMAC variables, and `AUTH_SITE_URL`.
**Do not deploy `DATABASE_MIGRATION_URL`**. The app uses at most five pooled
connections per process; use the managed pooler and qualify connection capacity
for your concurrency. No deployment or hosted data migration has been performed
by this source change.

## Preserving an existing database

Financial table shapes and IDs are retained, including exact numeric amounts,
relationships, versions, approvals and immutable evidence. The new baseline is
for a fresh target; it is not an automatic in-place conversion script.

Before cutover:

- Take a consistent database backup and an export of private CSV originals.
- Restore authorized user identities to the target `auth.users`, preserving every
  UUID referenced by memberships, approvals and audit records. Map existing bcrypt
  password hashes to `password_hash`, verified timestamps to `email_confirmed_at`,
  and display metadata to the retained metadata fields. Emails must be normalized
  and unique; resolve collisions explicitly. Imported bcrypt hashes with costs
  4–14 are supported and upgraded to scrypt on eligible successful logins.
- Preserve MFA: either migrate decrypted secrets through the new AES-GCM encryption
  path under a controlled process, or require verified identity recovery and
  re-enrollment before granting financial access. Do not silently drop factors.
  Existing provider MFA ciphertext cannot be copied into this application's format.
- Restore existing finance rows and profiles in foreign-key order. Check row
  counts, primary keys, amounts, digests, pending/posted states and membership scope.
  Do not rerun invoice imports as a substitute for transferring settled records.
- Convert private source objects to `public.source_files`, preserving the uploader,
  tenant/entity, original bytes and SHA-256 digest. Object names alone are not proof
  of authorized scope. New uploads archive bytes and stage rows in one transaction.
- Do not copy old access/refresh tokens. New opaque sessions require users to sign
  in again. Google/Microsoft provider sessions and callbacks are retired; this
  deployment supports invited email/password and TOTP. New OIDC connections require
  a separate implementation and deployment configuration.

A representative staging restore and the live export are still required when
real data exists. No existing hosted users, records, credentials, or storage were
changed or deleted during this implementation.

## Cutover and rollback

Keep the original source deployment and database backed up. Pause writes during
the final consistent export, restore and validate the new target, then switch a
preview to the new environment and run real user/workflow checks. Promote only
when the exact dataset and deployment pass.

Before new writes, rollback means returning traffic to the original deployment
and its original configuration. After new writes, first pause traffic and reconcile
new transactions before any switch back; never discard financial changes. The
migration does not destroy the old database or remove its hosted configuration.
Use Git history for the previous source version; uncommitted security fixes must
be preserved separately if rolling back the working checkout.

## Explicit local integration check

`npm test` executes the embedded PostgreSQL and unit suites. A separate suite
exercises actual PostgreSQL connections and the application auth/finance clients:

```sh
POSTGRES_TEST_ADMIN_URL='postgresql://postgres@127.0.0.1:55432/o2c_migration_test?sslmode=disable' npm run test:postgres
```

Run it only on a disposable local database whose name starts with
`o2c_migration_test`, after applying migrations. The suite creates test-only users
and financial fixtures under `tests/`; it refuses remote hosts. A database-owner
connection is used only by the test setup; application calls use a restricted
runtime test role. Destroy the disposable instance afterward. This does not prove
Neon/Vercel connectivity or operational recovery procedures.

After building, `npm run test:postgres:http` checks the real Next.js invitation,
login, cookie, MFA and logout flows on the same disposable local database. It
uses a test-only Redis transport and does not validate Redis Lua execution.
The CI workflow runs both integration suites with a disposable PostgreSQL 17
service; its credentials are test-only and never used by deployed applications.
