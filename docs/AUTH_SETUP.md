# Registration and work identity setup

Apply all migrations with `npm run db:migrate`, including
`202610160009_registration_oidc.sql`. Runtime connections must use `o2c_app`,
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

Local TypeScript checks, 151 tests and the production build pass. Tests cover private
registration, invitation activation, identity linking, replay, session rotation and
MFA; HTTP tests also exercise registration and disabled-provider behavior on PostgreSQL.
Live Google/Microsoft consent and browser/mobile visual review remain deployment
checks. Test each provider with dedicated accounts after credentials are configured;
verify invitation activation, repeat login, linking refusal and MFA challenge.
