-- Metadata only: no extension enablement, cron jobs, grants, table writes or DDL.
-- Run with an authorized catalog-reading identity in a READ ONLY transaction.
-- Index counters are observations, never a proven 30-day removal decision.
with tables as (
  select c.oid, n.nspname as schema_name, c.relname as table_name,
    c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
    c.relreplident as replica_identity,
    (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
), indexes as (
  select s.schemaname, s.relname as table_name, s.indexrelname as index_name,
    s.idx_scan::text as scans, pg_relation_size(s.indexrelid)::text as bytes,
    i.indisunique as unique_index, i.indisprimary as primary_index,
    i.indisvalid as valid, i.indisreplident as replica_identity,
    pg_get_indexdef(i.indexrelid) as definition,
    exists(select 1 from pg_constraint c where c.conindid=i.indexrelid) as constraint_backed,
    exists(select 1 from pg_constraint c where c.contype='f' and c.conrelid=i.indrelid
      and i.indpred is null and i.indexprs is null and i.indnkeyatts >= cardinality(c.conkey)
      and not exists(select 1 from unnest(c.conkey) with ordinality k(att,position)
        where i.indkey[(k.position-1)::integer] is distinct from k.att)) as supports_foreign_key,
    s.idx_scan < 5 as low_scan_observation
  from pg_stat_user_indexes s join pg_index i on i.indexrelid=s.indexrelid
  where s.schemaname='public'
)
select jsonb_build_object(
  'observed_at',now(), 'database',current_database(),
  'server_version',current_setting('server_version'),
  'stats_reset',(select stats_reset from pg_stat_database where datname=current_database()),
  'track_counts',current_setting('track_counts'),
  'removal_authorized',false,
  'extensions',coalesce((select jsonb_agg(jsonb_build_object('name',extname,'version',extversion) order by extname) from pg_extension),'[]'::jsonb),
  'tables',coalesce((select jsonb_agg(to_jsonb(t)-'oid' order by table_name) from tables t),'[]'::jsonb),
  'rls_disabled',coalesce((select jsonb_agg(table_name order by table_name) from tables where not rls_enabled),'[]'::jsonb),
  'rls_without_policies',coalesce((select jsonb_agg(table_name order by table_name) from tables where rls_enabled and policy_count=0),'[]'::jsonb),
  'policies',coalesce((select jsonb_agg(to_jsonb(p) order by tablename,policyname) from pg_policies p where schemaname='public'),'[]'::jsonb),
  'grants',coalesce((select jsonb_agg(to_jsonb(g) order by table_name,grantee,privilege_type) from information_schema.role_table_grants g where table_schema='public'),'[]'::jsonb),
  'constraints',coalesce((select jsonb_agg(jsonb_build_object('table',t.table_name,'name',c.conname,'type',c.contype,'definition',pg_get_constraintdef(c.oid)) order by t.table_name,c.conname) from pg_constraint c join tables t on t.oid=c.conrelid),'[]'::jsonb),
  'indexes',coalesce((select jsonb_agg(to_jsonb(i) order by table_name,index_name) from indexes i),'[]'::jsonb),
  'table_statistics',coalesce((select jsonb_agg(jsonb_build_object('table',relname,'seq_scan',seq_scan::text,'seq_tup_read',seq_tup_read::text,'live_rows_estimate',n_live_tup::text,'last_analyze',last_analyze,'last_autoanalyze',last_autoanalyze) order by relname) from pg_stat_user_tables where schemaname='public'),'[]'::jsonb),
  'definer_functions',coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'settings',p.proconfig,'owner',pg_get_userbyid(p.proowner),'public_execute',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')) order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef),'[]'::jsonb),
  'publications',coalesce((select jsonb_agg(jsonb_build_object('name',pubname,'all_tables',puballtables) order by pubname) from pg_publication),'[]'::jsonb),
  'publication_tables',coalesce((select jsonb_agg(to_jsonb(p) order by pubname,schemaname,tablename) from pg_publication_tables p where schemaname='public'),'[]'::jsonb)
) as audit;
