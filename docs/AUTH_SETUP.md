# Registration and work identity setup

Apply all migrations with `npm run db:migrate`, including
`202610160010_email_login_codes.sql`. Runtime connections must use `o2c_app`,
never the migration owner. Set the canonical HTTPS `AUTH_SITE_URL` and the existing
session, encryption and durable login-limiter settings described in `.env.example`.

## Registration review

Public registration collects contact details, company, role, country, company size,
finance workflow and a description, with an explicit privacy acknowledgment.
It stores a private `auth.registration_requests` record. It does not create a user,
tenant, financial membership or notification email. Duplicate emails cannot overwrite
an earlier request. A signed short-lived receipt confirms an actual submission.

An administrator reviews requests using an authorized database connection and issues
an invitation for an existing tenant and an explicit role:

```sh
npm run auth:invite -- person@company.example TENANT_UUID viewer
```

The command prints a private invitation URL; the operator delivers it securely.
Opening it establishes the existing invitation session. Password activation requires
complete registration details and matching passwords. Provider activation requires
the invited work email. Only the administrator's invitation grants membership;
registration fields and provider claims cannot grant roles or tenant access.

## Google and Microsoft

Create a confidential web application in each provider's developer console. Configure
these exact callback URLs using the deployed canonical origin:

- `https://YOUR_HOST/api/auth/oidc/google/callback`
- `https://YOUR_HOST/api/auth/oidc/microsoft/callback`

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google. Set
`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID`
for Microsoft. The latter must be one Entra tenant UUID; common/multitenant and
personal Microsoft accounts are not supported by this implementation. Store secrets
in deployment settings, never browser variables or source control. Restart/redeploy
after changing settings. Unconfigured provider buttons remain disabled.

An invited user can connect during activation. Existing password users connect their
provider in Account security after satisfying enrolled MFA. Later logins use the
stored issuer and subject. An email match alone never links accounts. PKCE, nonce,
signed identity-token verification, a same-browser state cookie and one-use database
flows protect callbacks. Existing MFA remains required after provider login.

## Visual and release checks

The entry screens use a white/blue banking scene rendered with Three.js, a static SVG
fallback, pause control and reduced-motion support. The scene represents the product,
not a live bank connection or an agent execution result.

Current local checks passed 169 tests, TypeScript and the production build. Tests cover private
registration, invitation activation, identity linking, replay, session rotation and
MFA; HTTP tests also exercise registration and disabled-provider behavior on PostgreSQL.
Live Google/Microsoft consent and browser/mobile visual review remain deployment
checks. Test each provider with dedicated accounts after credentials are configured;
verify invitation activation, repeat login, linking refusal and MFA challenge.

## PR preview configuration repair

The PR branch requires its own restricted database connection and the matching MFA
key; credentials scoped to another preview branch are not inherited. Registration
and OIDC require the registration migration; the current branch has 20 migrations.
An isolated Neon verification branch has all 20 applied, including email sign-in
and the newer ledger corrections; original staging was preserved.
No Google/Microsoft provider credentials were present during this check. Email sign-in
code support is now implemented separately from enrolled authenticator TOTP; it
requires the migration and a verified deployment email sender.

The migration runner now accepts equivalent LF/CRLF checksum histories. It still
rejects changed SQL, comments and whitespace. This handles the existing Windows
migration history without rewriting applied checksums or skipping integrity checks.

## Email sign-in codes

Existing confirmed, enabled accounts can request a six-digit code at `/login/code`.
This signs into an existing identity; it never creates accounts, confirms pending
invitations, grants memberships, or bypasses enrolled authenticator MFA. Registration
continues to require administrator review and an invitation.

Use either a verified Resend sender (`AUTH_EMAIL_FROM` and `RESEND_API_KEY`) or
SMTP (`SMTP_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_MODE`, `SMTP_USERNAME`,
`SMTP_PASSWORD`). SMTP only accepts authenticated TLS on 465 (`ssl`/`tls`) or
STARTTLS on 587 (`starttls`), with certificate verification. `AUTH_EMAIL_FROM`
overrides `SMTP_FROM`. Keep credentials in deployment environment settings, never
in chat or Git. Cloud workspace settings are not automatically inherited by Vercel.
A syntactically valid sender configuration does not establish delivery.

Codes expire after ten minutes, allow five failed guesses, and are usable once in
the requesting browser. New requests replace older codes. The database stores only
a keyed hash of the code and a hash of the browser binding; the cookie is HttpOnly.
Durable account/IP limits apply to requests. Codes, passwords and private session
tokens must not appear in logs. A rejected send invalidates its challenge. Unknown
and disabled emails receive a generic response and are never provisioned.

After deployment, test with an existing account: request code, confirm receipt in
inbox, submit it in the same browser, verify tenant access, replay refusal and MFA.
Local provider stubs establish behavior, not real inbox delivery. Until a sender
is configured, email-code controls remain disabled and the endpoint returns 503.
