# Authentication security review — October 6, 2026

## Changes reviewed

The original login accepted any locally valid-looking email/password and opened
the dashboard without server verification. It is replaced with Flask password
verification, session-bound email OTP, and revocable server-side sessions. React
no longer treats a local button click as proof of authentication. Login logo
markup and `src/styles.css` remain unchanged.

Reviewed controls include password hashing, code generation/storage/expiry,
atomic single use, throttles, CSRF and Origin checks, cookie attributes, session
rotation/logout, production configuration, SMTP certificate verification,
request bounds, and public file serving. Local administrator provisioning and
password reset never accept passwords in command arguments; reset revokes sessions.

The existing workbook parser lacked archive expansion and column/row limits.
Bounds were added before decompression/allocation, with regression coverage.
React escapes displayed values; no raw HTML sinks, `eval`, or browser credential
storage were found in the current frontend search. This is a focused code review
and automated validation, not an independent penetration test.

## Validation

- TypeScript and production Vite build passed.
- Nineteen backend tests passed, including real loopback SMTP delivery, concurrent
  OTP replay, CSRF/origin rejection, cookie configuration, throttling across app
  instances, expiration, mail failure, and password reset revocation.
- One Chromium smoke test passed against real Flask and loopback SMTP: invalid
  credentials, code submission, pending/authenticated reloads, logout, original
  logo/card background, and mobile display.
- Five workbook regression tests passed, including compressed expansion bombs,
  oversized buffers, malicious column references, and excessive archive entries.
- The reusable setup script was executed successfully with hash verification.
- `npm audit` initially identified vulnerable Nano ID, PostCSS, and source-map-js
  versions. Compatible updates to 3.3.20, 8.5.29, and 1.2.2 respectively cleared
  reported findings. The final npm audit reported zero known vulnerabilities.
- `pip-audit` reported no known vulnerabilities for both the pinned production
  and development Python dependency sets. TLS/checksum verification stayed enabled.

## Remaining deployment requirements

Live SMTP provider credentials and connectivity, mailbox delivery, HTTPS reverse
proxy behavior, production backups, and access monitoring have not been verified.
No production credentials were supplied or committed. See
[authentication instructions](AUTHENTICATION.md) before deployment.

Email OTP is not phishing-resistant. The finance data remains a client-generated
mock dataset, not a secure ERP integration. New real-data APIs need independent
authorization and ownership checks. SQLite/mail delivery is designed for one
small host; larger deployments require a durable mail queue, shared database,
and trusted proxy/gateway rate limits. Advisory scans do not prove immunity to
unknown vulnerabilities, and this review does not certify every finance module.


## Server-validation follow-up

Shared strict Pydantic schemas now replace the handwritten credential checks.
They apply to login, administrator account provisioning, password reset,
verification, resend, and logout. Field/JSON rejection responses are generic;
private rejection events provide redacted diagnostics and bounded retention.
See [the validation audit](VALIDATION_AUDIT.md) for the field rules and file-level
changes. This follow-up keeps the existing design and does not enable public
registration or read provider credentials.


Follow-up verification passed: 85 Python tests (including real local SMTP and
Chromium), five workbook regression tests, TypeScript/production build, and
hash-verified dependency installation. Both updated Python requirements scans
reported no known vulnerabilities. Direct API tests explicitly bypass browser
validation. These results do not establish production SMTP or remote-host readiness.
