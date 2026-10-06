# Flask authentication and email verification

The React frontend retains the existing logo, motion scene, dark theme,
stylesheet, and dashboard. Login now requires a provisioned account password
and an emailed six-digit code. The pasted OTP component is not used.

## Install

Use Node 24 and Python 3.12. From the repository root:

```bash
bash scripts/setup-cloud.sh
```

This installs locked frontend dependencies, builds the app, generates offline
reports, creates `.venv`, installs hash-verified Python dependencies, and runs
backend tests with a temporary database and loopback inbox. It does not configure
live SMTP or create default users. For production-only Python dependencies:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r backend/requirements.txt
```

## SMTP and secrets

Use `.env.example` as a list of variable names. Supply real values through your
secret manager or secure environment settings. The app reads process environment
variables; `.env` is not loaded automatically. Never commit secrets or put them in
command arguments or chat. HTTPS proxy placeholders are not raw SMTP passwords.

| Variable | Configuration |
| --- | --- |
| `O2C_ENV` | Defaults to production. Use `development` only for local HTTP. |
| `O2C_APP_ORIGIN` | Exact browser origin, including scheme and port, without a trailing slash. Production requires HTTPS. |
| `O2C_SECRET_KEY` | Secret generated from at least 32 random bytes; retain across restarts and share across workers. |
| `O2C_DATABASE` | Private persistent SQLite path, outside the public `dist/` directory. |
| `SMTP_HOST`, `SMTP_PORT` | Your provider hostname and TLS port, usually 587 or 465. |
| `SMTP_MODE` | `starttls` for 587 or `ssl` for 465. `plain` is permitted only for a loopback development inbox. |
| `SMTP_FROM` | Valid sender email verified with your provider. |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | Provider credentials if required. |

Required configuration is checked at startup. Actual SMTP delivery requires
provider credentials and outbound TLS SMTP connectivity; a passing local inbox
test does not prove production connectivity. Configure SPF/DKIM/DMARC with your
provider and test delivery to your real mailbox before using the app publicly.
The authentication implementation does not log passwords, codes, or mail bodies.

## Account creation and recovery

After injecting configuration, run the local administrator CLI:

```bash
.venv/bin/flask --app backend.app:create_app create-user your-work-email@example.com
```

The password is prompted twice without echo. Use a unique password of at least
12 characters. There is no public registration route or built-in demo account.
For administrator recovery:

```bash
.venv/bin/flask --app backend.app:create_app reset-password your-work-email@example.com
```

Resetting a password revokes all sessions and pending codes for the account.
Only trusted administrators should access the host, CLI, database, and secrets.

## Local development

Set `O2C_ENV=development`, `O2C_APP_ORIGIN=http://127.0.0.1:5174`, a random secret,
and your SMTP configuration. Start these commands in separate terminals from
the repository root:

```bash
.venv/bin/flask --app backend.app:create_app run --host 127.0.0.1 --port 5000
```

```bash
npm run dev -- --strictPort
```

Vite proxies `/api` to Flask. Use the exact configured browser origin; changing
between `localhost` and `127.0.0.1` causes origin rejection. Keep development
servers and the debugger private. For cloud tasks, use the existing isolated
checkout; do not create a Git worktree unless explicitly requested. Retained files
can survive a snapshot, but both processes must restart in each task.

## Production

Run `npm run build`. Set production configuration, an actual HTTPS origin,
SMTP credentials, and a persistent private database. Start Gunicorn:

```bash
.venv/bin/gunicorn --workers 2 --bind 127.0.0.1:5000 'backend.app:create_app()'
```

Put an HTTPS reverse proxy in front of Gunicorn, forward the original Host,
redirect HTTP to HTTPS, and use the same origin for frontend and `/api`.
Flask serves only `dist/`, never the checkout or database. A standalone static
preview cannot supply authentication. Keep port 5000 private. Production secure
cookies deliberately do not authenticate over HTTP.

Use one host and shared persistent disk for this SQLite implementation, not
independent replicas. Protect and back up the database. Rate limits use the
immediate peer IP; a reverse proxy therefore shares the IP limit unless you add
a carefully trusted proxy configuration. Forwarded IP headers are deliberately
ignored. Add gateway limits, monitoring, and tested backups for a public service.
SMTP runs in a serialized database transaction with a ten-second timeout; use
a durable queue and shared database before scaling beyond a small deployment.
Changing the secret invalidates existing sessions and verification codes.

## Protections and scope

- Passwords use salted scrypt hashes. Unknown accounts and invalid passwords
  return the same error, with a dummy password hash check for unknown accounts.
- Codes use cryptographic randomness and keyed hashes, are bound to a pending
  session, expire after five minutes, and are consumed atomically. Five incorrect
  attempts invalidate the challenge. Resending replaces the previous code.
- Password requests are limited to 10 per account and 30 per peer IP per 15
  minutes. Resends are limited to 5 per account and 30 per IP per 15 minutes,
  with a 30-second cooldown. Verification has a 60-per-IP limit per 15 minutes.
  Resending creates a new challenge with its own attempt counter, subject to
  the resend and IP limits. Limits persist in SQLite across worker restarts.
- Random session tokens are stored only as keyed hashes on the server. They
  rotate after password acceptance and verification. Pending sessions expire
  after 15 minutes; authenticated sessions after eight hours. Logout revokes
  server access, and the frontend checks session state at least every minute.
- Mutation endpoints require exact Origin and a per-session CSRF token.
  Production cookies use `Secure`, `HttpOnly`, `SameSite=Strict`, and `__Host-`.
  Authentication responses have `Cache-Control: no-store`.
- Host validation, request size limits, CSP, frame protection, and production
  HSTS are enabled. CSP permits inline styles to preserve current React styling
  but does not permit inline scripts. Credentials are not put in browser storage.
- SMTP TLS verifies certificates. Delivery failures never authenticate a user.
- Workbook limits are 10 MB compressed, 16 MB per archive member, 32 MB expanded,
  256 members, 20,000 rows per sheet, and 256 columns. At most ten uploaded
  workbooks are retained in the current view. These bounds reduce browser resource
  exhaustion; they are not a malware scanner or a universal XLSX validator.

The financial dashboard still generates **mock data in the browser**.
Authentication does not make that sample private server-held financial data.
Future real finance endpoints must independently enforce authorization,
account ownership, and roles, as `/api/workspace` demonstrates for authentication.
Never embed real financial data in the frontend bundle. Email OTP depends on
mailbox security and is not phishing-resistant MFA; use passkeys or a managed
identity provider for higher-assurance deployments. This review focuses on the
new authentication and obvious upload/resource risks; it is not an independent
penetration test or a full audit of all finance logic.

## Run checks

```bash
npm run build
npm test
.venv/bin/python -m pytest backend/tests -q
```

The backend tests cover passwords, origin/CSRF enforcement, code expiry,
resending, throttling across instances, mail failure, hashed codes, session
binding, concurrent replay, expiry, password recovery, request limits, and
production cookie/configuration checks. Real SMTP transport is exercised against
a loopback inbox. No live email or permanent test account is needed.

The browser test needs Chromium on PATH or `O2C_CHROMIUM` set to its executable.
It starts a temporary real Flask server and SMTP inbox, then checks incorrect
passwords, code entry, pending-session reload, dashboard access, authenticated
reload, logout, original logo/card styling, and mobile display. Without Chromium
or Playwright the browser test is explicitly skipped, not passed.

Audit dependencies with `npm audit` and an independently installed `pip-audit`
against both Python requirements files. Refresh hash-pinned Python locks using
`pip-compile --generate-hashes` after reviewing updates. Passing advisory scans
reflect known vulnerabilities at that time, not a guarantee against all attacks.
Re-run checks and review dependency updates regularly.
