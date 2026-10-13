# Perplexity review instructions

1. Download [review-source.zip](https://github.com/christophernemala/o2c-finance-command-center/raw/refs/heads/codex/postgresql-migration/review-source.zip) from the migration branch. If GitHub displays the file, use **Download raw file**.
2. Open a new Perplexity thread. Use Research mode if your plan offers it.
3. Attach the downloaded ZIP with the attachment button. If your version rejects ZIP, extract it and upload the source files/docs it accepts, or use the public branch link. A repository link alone may not let Perplexity inspect every file.
4. Paste the prompt below. Verify that its response cites actual source files; if access fails, attach the files it identifies.
5. Copy its concrete findings back for verification and fixes. Do not approve deployment based only on the review.

The ZIP excludes .env files (including the example), live credentials, actual activation URLs, TOTP setup secrets and customer data. Synthetic test-only fixtures remain for review.

## Copy-ready prompt

```text
Review the PostgreSQL migration in O2C Finance Command Center.
Branch: https://github.com/christophernemala/o2c-finance-command-center/tree/codex/postgresql-migration

Start with CODE_CHANGES.md and docs/POSTGRESQL_MIGRATION.md, then inspect the actual changed source, SQL migrations and tests. Compare against base commit ab9b4e14f9437d9e3061cfe65ada868e0278cf28.

Check SQL injection, tenant/entity isolation and RLS, database role privileges, pooled session isolation, scrypt/bcrypt handling, HttpOnly sessions, invitation/password-reset races, TOTP encryption and replay/concurrency, CSRF, uploads, rate limits, server-only secrets, TLS, dependencies and safe data transfer/rollback.

For each confirmed issue, give severity, file and line, exploit conditions, evidence and a minimal fix. Separate verified findings from assumptions and unverified deployment settings. Do not treat passing tests as proof of production safety. Do not assume live Neon/Vercel or Redis behavior is verified. If you cannot access a file, say which file; do not invent findings.

Keep the answer concise. Finish with the five most important actions before deployment. Do not modify, deploy or execute financial transactions.
```
