-- Forward hardening: preserve already-applied source_files migration checksums.
begin;
create function public.source_entity_access(p_tenant uuid, p_entity uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select public.member_role(p_tenant) is not null
    and current_setting('o2c.entity_id',true)=p_entity::text
    and exists(select 1 from public.entities e where e.tenant_id=p_tenant and e.id=p_entity)
$$;
revoke all on function public.source_entity_access(uuid,uuid) from public,anon;
grant execute on function public.source_entity_access(uuid,uuid) to authenticated;
alter policy source_read on public.source_files
  using(public.source_entity_access(tenant_id,entity_id));
alter policy source_insert on public.source_files
  with check(uploaded_by=auth.uid() and public.member_role(tenant_id) in ('maker','admin')
    and public.source_entity_access(tenant_id,entity_id));
commit;
