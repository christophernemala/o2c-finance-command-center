# Unified cloud workflow

## Source and development

Use `codex/unified-cloud-audit` in the existing O2C repository for this candidate.
GitHub stores code, migrations, tests and public-safe designs/documentation.
The restored devcontainer uses Node 22 and `npm ci`; a Codespace must still be
created with the owner's account authorization. No running Codespace is claimed.
The current GitHub default branch remains the prior light/Supabase source until
the candidate's live release gates are met.

Run `npm run verify` and `npm audit --audit-level=high`. GitHub Actions additionally
tests migrations twice and exercises real PostgreSQL/HTTP Auth against a disposable
CI database. Never point fixture/integration test suites at the hosted finance DB.

## Candidate staging destinations

| Material | Destination | Qualification |
| --- | --- | --- |
| Source and cloud CI | Existing GitHub repository, candidate branch | Inspect checks for the exact commit |
| Web/API preview | Vercel `o2c-finance-command-center-app` | Candidate preview; production is not promoted |
| Identity, financial records and private CSV originals | Dedicated Neon `autonomous-ar-platform`, database `autonomous_ar`, staging branch | Seven migrations applied; real onboarding/workflows pending |
| Login/API limiter | Existing server-only Upstash settings on selected Vercel project | Values retained; actual provider health needs a live check |
| Private chat history, archives and evidence | Owner-controlled private storage | Do not publish to this public repository |

The selected Neon project is in `aws-us-east-1` and uses 0.25 CU. Region selection
is for staging adjacent to observed hosting; production data residency and workload
requirements must be decided before loading real business records. Account defaults
control compute suspension and retention; backup/restore capability remains a gate.

## Secrets and privileged operations

Candidate preview needs server-only `DATABASE_URL`, `MFA_ENCRYPTION_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `AUTH_RATE_LIMIT_SECRET`
and `AUTH_SITE_URL`. Use verified remote TLS and a pooled non-owner runtime role.
The candidate DB and MFA variables are branch-scoped preview settings so existing
production deployments retain their previous configuration.

`DATABASE_MIGRATION_URL` is operator-only; never deploy it. Migration/invitation
commands run through an authorized administrator environment. Store MFA encryption
keys with restricted access and retain them for recovery; do not silently rotate
them after accounts enroll factors. Ignored operator files are local convenience,
not proof of a provisioned cloud development environment.

Do not expose database URLs, credentials, activation links or financial records in
CI logs, screenshots, prompts or this repository. Public Supabase variables retained
on old deployments are historical settings; candidate code does not use them.

## Promotion gates

Inspect the candidate preview and exact commit. Real login, two independent users,
tenant/entity denial, MFA, import review/posting and source-backed balances must
pass before production. Preserve the older provider and deployments until their
data and rollback requirements are verified. See the unified audit for remaining
autonomous integrations; a hosted application alone does not establish autonomy.
