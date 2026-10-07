-- Private immutable originals; financial review still uses preserved import batches.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('o2c-source-files','o2c-source-files',false,1048576,array['text/csv']);
create policy o2c_source_read on storage.objects for select to authenticated using (
  bucket_id='o2c-source-files' and exists(
    select 1 from public.entities e where e.tenant_id::text=(storage.foldername(storage.objects.name))[1]
      and e.id::text=(storage.foldername(storage.objects.name))[2] and public.member_role(e.tenant_id) is not null
  )
);
create policy o2c_source_insert on storage.objects for insert to authenticated with check (
  bucket_id='o2c-source-files' and owner_id=auth.uid()::text
  and (storage.foldername(name))[3]=auth.uid()::text
  and exists(select 1 from public.entities e where e.tenant_id::text=(storage.foldername(storage.objects.name))[1]
    and e.id::text=(storage.foldername(storage.objects.name))[2] and public.member_role(e.tenant_id) in ('maker','admin'))
);
-- No application update/delete policies: a reviewed original cannot be overwritten.
commit;
