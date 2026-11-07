# Production provisioning

Use a dedicated standalone PostgreSQL database with the migrations applied.
Follow [POSTGRESQL_MIGRATION.md](POSTGRESQL_MIGRATION.md) for database roles,
TLS, deployment variables, backups, migration and rollback.

A trusted administrator provisions the actual tenant and legal entity using the
schema-owner connection. Replace these placeholders with real, authorized names:

```sql
begin;
insert into public.tenants(name) values ('<REAL TENANT NAME>') returning id;
-- Use the returned UUID:
insert into public.entities(tenant_id,name,currency)
values ('<TENANT UUID>','<REAL LEGAL ENTITY NAME>','AED') returning id;
commit;
```

Then issue each real user an invitation with an explicit membership:

```sh
npm run auth:invite -- '<REAL WORK EMAIL>' '<TENANT UUID>' maker
npm run auth:invite -- '<INDEPENDENT CHECKER EMAIL>' '<TENANT UUID>' approver
```

This operator command requires local `DATABASE_MIGRATION_URL` and `AUTH_SITE_URL`.
It creates or re-invites the specified identity, assigns only the requested role,
and prints a private single-use activation URL expiring in 24 hours. It does not
send email, create default accounts or seed business records. Deliver that URL
through your approved private channel. Do not log, commit or publicly share it.
A re-invitation replaces pending invitation links. Password activation invalidates
all sessions and invitations for that identity, including other activation sessions.

The invitee opens the link, selects **Continue activation**, sets a password of at least 12 characters, and signs
in. An activation session expires after 10 minutes and cannot read financial data.
After sign-in, Account security allows the user to enroll a TOTP authenticator.
Enrolled accounts must verify their second factor for all financial access.

Verify the real named maker and checker, tenant/entity scope, cross-user denial,
MFA, logout/revocation and an authorized source import/posting workflow on the
actual deployment. No customers, invoices, bank records, forecasts or financial
balances are created by account provisioning.

Public signup is not supported. Administrator-assisted recovery uses a reviewed
identity verification process before a new invitation or MFA recovery. There is
no automatic recovery email service, MFA recovery-code UI or social-provider login.
Never remove a verified MFA factor solely to bypass a login failure.
