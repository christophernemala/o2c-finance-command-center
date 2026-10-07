# Production provisioning

Use this only after selecting an active Supabase project, reviewing schema conflicts,
backing up the database, and applying all migrations in filename order in staging first.
The application must never receive a service-role key.

Create the real user in Supabase Auth with the intended email verification or invite
flow. Do not store their password in SQL, source control, chat, or Vercel.

In the Supabase SQL editor, replace every placeholder before execution:

```sql
begin;

insert into public.tenants(name)
values ('<REAL LEGAL TENANT NAME>')
returning id;

-- Use the returned tenant UUID and the real Auth user UUID.
insert into public.entities(tenant_id, name, currency)
values ('<TENANT UUID>', '<REAL LEGAL ENTITY NAME>', 'AED')
returning id;

insert into public.memberships(tenant_id, user_id, role)
select '<TENANT UUID>', id, 'admin'
from auth.users
where lower(email) = lower('<REAL WORK EMAIL>')
on conflict (tenant_id, user_id) do update set role = excluded.role;

-- Must return exactly one row before attempting application login.
select t.id as tenant_id, t.name, u.id as user_id, u.email, m.role
from public.memberships m
join public.tenants t on t.id = m.tenant_id
join auth.users u on u.id = m.user_id
where lower(u.email) = lower('<REAL WORK EMAIL>');

commit;
```

If the verification query does not return exactly one intended membership, roll back
or correct the provisioning before login. Do not insert customers, invoices, balances,
bank lines, receipts, forecasts, ECL runs, or agent runs as part of account setup.

After provisioning, verify `workspace_access()` as the real user and verify that a
different tenant cannot be read. Supabase Auth password policy, rate limiting, MFA,
email delivery, recovery, and abuse protections are live project settings and require
provider evidence. Configure the durable Redis limiter from `docs/SECURITY.md` before
sign-in. Password hashing remains provider-managed; no application bcrypt or browser
authentication state is introduced.
