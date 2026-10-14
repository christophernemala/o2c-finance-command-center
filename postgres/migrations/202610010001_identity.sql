-- Fresh standalone PostgreSQL database only. Run as the migration owner.
begin;
create role anon nologin;
create role authenticated nologin nosuperuser nobypassrls;
create role o2c_app nologin nosuperuser nobypassrls;
grant authenticated to o2c_app;
revoke create on schema public from public;
create schema auth;
revoke all on schema auth from public;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique check (email = lower(trim(email)) and length(email) <= 254),
  password_hash text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  disabled boolean not null default false,
  raw_user_meta_data jsonb not null default '{}',
  raw_app_meta_data jsonb not null default '{"provider":"email"}',
  created_at timestamptz not null default now()
);
create table auth.sessions (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users on delete cascade,
  purpose text not null check(purpose in ('login','invitation')),
  aal text not null check(aal in ('aal1','aal2')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user on auth.sessions(user_id);
create index sessions_expiry on auth.sessions(expires_at);
create table auth.invitations (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  status text not null check(status in ('unverified','verified')),
  secret_ciphertext text not null,
  last_counter bigint not null default -1,
  created_at timestamptz not null default now()
);
-- A transaction-local opaque session hash is resolved against live server sessions.
-- Claims supplied by the browser cannot set a user ID or an assurance level.
create function auth.uid() returns uuid language sql stable security definer set search_path='' as $$
  select u.id from auth.sessions s join auth.users u on u.id=s.user_id
  where s.token_hash=current_setting('o2c.session_hash',true) and s.purpose='login'
    and s.expires_at>now() and not u.disabled and u.email_confirmed_at is not null
$$;
create function auth.assurance() returns text language sql stable security definer set search_path='' as $$
  select s.aal from auth.sessions s join auth.users u on u.id=s.user_id
  where s.token_hash=current_setting('o2c.session_hash',true) and s.purpose='login'
    and s.expires_at>now() and not u.disabled and u.email_confirmed_at is not null
$$;
revoke all on function auth.uid(),auth.assurance() from public;
grant usage on schema public,auth to authenticated,anon,o2c_app;
grant execute on function auth.uid(),auth.assurance() to authenticated;
-- Backend-only identity access. Finance operations always SET LOCAL ROLE authenticated.
grant select,insert,update,delete on auth.sessions,auth.invitations,auth.mfa_factors to o2c_app;
grant select on auth.users to o2c_app;
grant update(password_hash,email_confirmed_at) on auth.users to o2c_app;
commit;
