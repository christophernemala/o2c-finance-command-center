# Perplexity review instructions

1. Download the [consolidated candidate archive](https://github.com/christophernemala/o2c-finance-command-center/archive/refs/heads/codex/unified-cloud-audit.zip). This GitHub-generated archive and the branch below refer to the same candidate. The older checked-in `review-source.zip` is a historical migration snapshot, not the consolidated review target.
2. Open a new Perplexity thread. Use Research mode if your plan offers it.
3. Attach the downloaded ZIP with the attachment button. If your version rejects ZIP, extract it and upload the source files/docs it accepts, or use the public branch link. A repository link alone may not let Perplexity inspect every file.
4. Paste the prompt below. Verify that its response cites actual source files; if access fails, attach the files it identifies.
5. Copy its concrete findings back for verification and fixes. Do not approve deployment based only on the review.

The GitHub archive contains tracked source and `.env.example` variable names, but no ignored credential files. Before sharing any archive, inspect its contents for sensitive material. Synthetic test-only fixtures remain for review. For an immutable review, record the candidate SHA and download `/archive/<SHA>.zip` from this repository instead.

## Copy-ready prompt

```text
Review the consolidated standalone PostgreSQL/custom Auth candidate in O2C Finance Command Center.
Branch: https://github.com/christophernemala/o2c-finance-command-center/tree/codex/unified-cloud-audit

Start with START_HERE.md, docs/UNIFIED_AUDIT.md and docs/POSTGRESQL_MIGRATION.md, then inspect the actual changed source, SQL migrations and tests. Compare against PR #4's light-source base e6f41a53bf2dae4c4b7bfba09243607096364d2b.

Check SQL injection, tenant/entity isolation and RLS, database role privileges, pooled session isolation, scrypt/bcrypt handling, HttpOnly sessions, invitation/password-reset races, TOTP encryption and replay/concurrency, CSRF, uploads, rate limits, server-only secrets, TLS, dependencies and safe data transfer/rollback.

For each confirmed issue, give severity, file and line, exploit conditions, evidence and a minimal fix. Separate verified findings from assumptions and unverified deployment settings. Do not treat passing tests as proof of production safety. Do not assume live Neon/Vercel or Redis behavior is verified. If you cannot access a file, say which file; do not invent findings.

Keep the answer concise. Finish with the five most important actions before deployment. Do not modify, deploy or execute financial transactions.
```
