begin;
-- Identity onboarding data is private and never grants membership or creates finance records.
create table auth.registration_requests (
 id uuid primary key, full_name text not null check(length(full_name) between 2 and 120),
 email text not null unique check(email=lower(trim(email)) and length(email)<=254 and email ~ '^[^ @]+@[^ @]+\.[^ @]+$'),
 company text not null check(length(company) between 2 and 160), job_title text not null check(length(job_title) between 2 and 80),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),country text not null check(length(country) between 2 and 80),
 company_size text not null check(company_size in ('1–10','11–50','51–200','201–1000','1001+')),
 interest text not null check(interest in ('collections','cash_application','ar_reporting','treasury_review')),
 description text not null check(length(description) between 10 and 1000), consent_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create function o2c_private.request_registration(p_id uuid,p_name text,p_email text,p_company text,p_job text,p_phone text,p_country text,p_size text,p_interest text,p_description text)
returns void language plpgsql security definer set search_path='' as $$
begin
 insert into auth.registration_requests(id,full_name,email,company,job_title,phone,country,company_size,interest,description)
 values(p_id,p_name,lower(trim(p_email)),p_company,p_job,p_phone,p_country,p_size,p_interest,p_description)
 on conflict do nothing;
 -- Repeated anonymous requests never overwrite another applicant's contact data.
end $$;
create table auth.oauth_flows (
 state_hash text primary key check(state_hash ~ '^[a-f0-9]{64}$'), provider text not null check(provider in ('google','microsoft')),
 verifier text not null, nonce text not null, link_user_id uuid references auth.users,
 link_session_hash text references auth.sessions(token_hash) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now(),
 check((link_user_id is null)=(link_session_hash is null))
);
create table auth.external_identities (
 issuer text not null, subject text not null, provider text not null check(provider in ('google','microsoft')),
 user_id uuid not null references auth.users on delete cascade, created_at timestamptz not null default now(),
 primary key(issuer,subject),unique(provider,user_id)
);
revoke all on auth.registration_requests,auth.oauth_flows,auth.external_identities from public,anon,authenticated;
revoke all on function o2c_private.request_registration(uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function o2c_private.request_registration(uuid,text,text,text,text,text,text,text,text,text) to o2c_app;
grant select,insert,delete on auth.oauth_flows to o2c_app;
grant select,insert on auth.external_identities to o2c_app;
grant update(raw_user_meta_data) on auth.users to o2c_app;
commit;
