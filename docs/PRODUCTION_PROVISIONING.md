# Production provisioning

Use a dedicated standalone PostgreSQL database with the migrations applied.
Follow [POSTGRESQL_MIGRATION.md](POSTGRESQL_MIGRATION.md) for database roles,
TLS, deployment variables, backups, migration and rollback.

A trusted administrator provisions the actual tenant and legal entity using the
schema-migration connection. Replace these placeholders with real, authorized names.
Public-table RLS is forced even for table owners, so use the owner-only provisioning
procedures rather than direct inserts:

```sql
begin;
select o2c_private.provision_tenant('<REAL TENANT NAME>') as tenant_id;
-- Use the returned UUID:
select o2c_private.provision_entity('<TENANT UUID>','<REAL LEGAL ENTITY NAME>','AED') as entity_id;
commit;
```

Then issue each real user an invitation with an explicit membership:

```sh
npm run auth:invite -- '<REAL WORK EMAIL>' '<TENANT UUID>' maker
npm run auth:invite -- '<INDEPENDENT CHECKER EMAIL>' '<TENANT UUID>' approver
```

This operator command requires local `DATABASE_MIGRATION_URL` and `AUTH_SITE_URL`.
It creates or re-invites the specified identity, assigns only the requested role,
and uses the restricted membership-provisioning procedure under forced RLS. It prints
a private single-use activation URL expiring in 24 hours. It does not
send email, create default accounts or seed business records. Deliver that URL
through your approved private channel. Do not log, commit or publicly share it.
A re-invitation replaces pending invitation links. Password activation invalidates
all sessions and invitations for that identity, including other activation sessions.

The invitee opens the link, selects **Continue activation**, sets a password of at
least 12 characters, and signs in. An activation session expires after 10 minutes
and cannot read financial data. After sign-in, Account security allows the user to
enroll a TOTP authenticator. Enrolled accounts must verify their second factor for
all financial access.

Before enabling agents or Copilot, an admin must set a positive daily USD cap in
the Agent Console. The cap is shared by the tenant across all entities and resets
at midnight Asia/Dubai. There is no preset amount; setting it to zero pauses AI.
The application estimates cost from its rate card, so configure a provider-side
spend limit as well.

Verify the real named maker and checker, tenant/entity scope, cross-user denial,
MFA, logout/revocation and an authorized source import/posting workflow on the
actual deployment. No customers, invoices, bank records, forecasts or financial
balances are created by account provisioning.

Public signup at `/signup` submits a private registration request for administrator
review; it does not create an account, tenant, membership or financial access.
Invitation-only activation remains the only way to grant workspace access. Google
sign-in and single-tenant Microsoft sign-in are supported only when their provider
credentials and callbacks are configured; see [AUTH_SETUP.md](AUTH_SETUP.md).
Existing confirmed users can also use email sign-in codes when a verified sender is
configured. These methods do not bypass enrolled authenticator MFA.

Administrator-assisted recovery still requires a reviewed identity-verification
process before issuing a new invitation or recovering MFA. There is no MFA
recovery-code UI or automatic password-reset service. Never remove a verified MFA
factor solely to bypass a login failure.
