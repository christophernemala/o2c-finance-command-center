begin;

-- Profile attributes are not authorization. Roles remain in public.memberships.
-- Intentionally fail on an existing table rather than accepting schema drift.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text check (length(full_name) <= 200),
  avatar_url text check (length(avatar_url) <= 2048),
  provider text not null default 'email',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Display attributes only; finance authorization uses memberships. Email may be absent for non-email identities.';

alter table public.profiles enable row level security;
create policy profiles_read_self on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_self on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- Keep privileged trigger functions out of the exposed public API schema.
create schema if not exists o2c_private;
revoke all on schema o2c_private from public, anon, authenticated;
create function o2c_private.sync_auth_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, provider)
  values (
    new.id, new.email,
    nullif(left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 200), ''),
    nullif(left(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''), 2048), ''),
    coalesce(nullif(new.raw_app_meta_data->>'provider', ''), 'email')
  )
  on conflict (id) do update set email = excluded.email, provider = excluded.provider;
  return new;
end;
$$;
revoke all on function o2c_private.sync_auth_profile() from public, anon, authenticated;
-- Use a dedicated trigger name; do not remove another integration's Auth trigger.
create trigger o2c_sync_auth_profile
  after insert or update of email, raw_app_meta_data on auth.users
  for each row execute function o2c_private.sync_auth_profile();

create function o2c_private.touch_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function o2c_private.touch_profile() from public, anon, authenticated;
create trigger o2c_touch_profile before update on public.profiles
  for each row execute function o2c_private.touch_profile();

-- Only existing Auth identities, without generated accounts or financial records.
insert into public.profiles (id, email, full_name, avatar_url, provider)
select id, email,
  nullif(left(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', ''), 200), ''),
  nullif(left(coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture', ''), 2048), ''),
  coalesce(nullif(raw_app_meta_data->>'provider', ''), 'email')
from auth.users;

commit;
