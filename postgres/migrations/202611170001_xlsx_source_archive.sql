-- Preserve existing applied checksums while aligning the source archive with the implemented CSV/XLSX import contract.
begin;
alter table public.source_files drop constraint source_files_content_check;
alter table public.source_files
  add constraint source_files_content_size_check check(octet_length(content) between 1 and 8388608);
alter table public.source_files drop constraint source_files_content_type_check;
alter table public.source_files
  add constraint source_files_content_type_check
    check(content_type in ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
commit;
