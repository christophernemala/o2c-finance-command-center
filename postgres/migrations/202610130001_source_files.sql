begin;
create table public.source_files (
  tenant_id uuid not null, entity_id uuid not null,
  uploaded_by uuid not null references auth.users,
  digest text not null check(digest ~ '^[a-f0-9]{64}$'),
  original_name text not null check(length(original_name) between 1 and 200),
  content bytea not null check(octet_length(content) between 1 and 1048576),
  content_type text not null default 'text/csv' check(content_type='text/csv'),
  created_at timestamptz not null default now(),
  primary key(tenant_id,entity_id,uploaded_by,digest),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id),
  check(encode(sha256(content),'hex')=digest)
);
alter table public.source_files enable row level security;
create policy source_read on public.source_files for select to authenticated
  using(public.member_role(tenant_id) is not null);
create policy source_insert on public.source_files for insert to authenticated
  with check(uploaded_by=auth.uid() and public.member_role(tenant_id) in ('maker','admin'));
revoke all on public.source_files from public,anon,authenticated;
grant select,insert on public.source_files to authenticated;
create trigger source_immutable before update or delete on public.source_files
  for each row execute function public.reject_audit_mutation();
commit;
