-- Forward-only: upgrade already-applied O2C migrations without recreating tables.
begin;
create schema if not exists o2c_private;
revoke all on schema o2c_private from public, anon, authenticated;
create function o2c_private.session_assured() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified')
    or auth.jwt()->>'aal'='aal2'
  )
$$;
revoke all on function o2c_private.session_assured() from public, anon, authenticated;
create or replace function public.member_role(p_tenant uuid) returns text
language sql stable security definer set search_path='' as $$
  select role from public.memberships where tenant_id=p_tenant and user_id=auth.uid()
    and o2c_private.session_assured()
$$;
create or replace function public.stage_import(p_tenant uuid,p_entity uuid,p_kind text,p_name text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare entry jsonb; total_value numeric:=0; batch_id uuid; digest_value text;
begin
  if public.member_role(p_tenant) not in ('maker','admin') or public.member_role(p_tenant) is null then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  if p_kind not in ('invoices','bank_lines') or p_kind is null or jsonb_typeof(p_payload) is distinct from 'array' or jsonb_array_length(p_payload) not between 1 and 2000 or p_name is null or length(p_name) not between 1 and 200 then raise exception 'Invalid import'; end if;
  for entry in select value from jsonb_array_elements(p_payload) loop
    if jsonb_typeof(entry->'amount') is distinct from 'string' or (entry->>'amount') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' or (entry->>'amount')::numeric<=0 or entry->>'currency' is distinct from 'AED' then raise exception 'Invalid currency/decimal'; end if;
    total_value:=total_value+(entry->>'amount')::numeric;
    if p_kind='invoices' then
      if coalesce(length(entry->>'number'),0) not between 1 and 100 or coalesce(length(entry->>'account'),0) not between 1 and 100 or coalesce(length(entry->>'customer'),0) not between 1 and 200 then raise exception 'Invalid invoice identity'; end if;
      if jsonb_typeof(entry->'issued_at') is distinct from 'string' or jsonb_typeof(entry->'due_date') is distinct from 'string'
        or entry->>'issued_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or entry->>'due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Canonical YYYY-MM-DD dates required';
      end if;
      if to_char((entry->>'issued_at')::date,'YYYY-MM-DD')<>entry->>'issued_at'
        or to_char((entry->>'due_date')::date,'YYYY-MM-DD')<>entry->>'due_date' then raise exception 'Noncanonical date'; end if;
    else
      if coalesce(length(entry->>'reference'),0) not between 1 and 200 or entry->>'direction' is null or entry->>'direction' not in ('credit','debit') or entry->>'booked_at' is null then raise exception 'Invalid bank record'; end if;
      if jsonb_typeof(entry->'booked_at') is distinct from 'string' or entry->>'booked_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Canonical YYYY-MM-DD dates required';
      end if;
      if to_char((entry->>'booked_at')::date,'YYYY-MM-DD')<>entry->>'booked_at' then raise exception 'Noncanonical date'; end if;
    end if;
  end loop;
  digest_value:='sha256:'||encode(sha256(convert_to(p_kind||p_payload::text,'UTF8')),'hex');
  insert into public.import_batches(tenant_id,entity_id,maker,kind,file_name,digest,payload,rows,total)
    values(p_tenant,p_entity,auth.uid(),p_kind,p_name,digest_value,p_payload,jsonb_array_length(p_payload),total_value)
    on conflict(tenant_id,entity_id,digest) do nothing returning id into batch_id;
  if batch_id is null then select id into batch_id from public.import_batches where tenant_id=p_tenant and entity_id=p_entity and digest=digest_value; return batch_id; end if;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'import.staged',batch_id,jsonb_build_object('digest',digest_value,'rows',jsonb_array_length(p_payload),'total',total_value::text));
  return batch_id;
end $$;

create or replace function public.workspace_snapshot(p_tenant uuid,p_entity uuid,p_as_of date,p_page integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; offset_rows integer := p_page*50;
begin
  if auth.uid() is null or public.member_role(p_tenant) is null or not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  if p_page<0 or p_page>100000 or p_as_of is null then raise exception 'Invalid scope'; end if;
  with inv as (
    select i.*,c.name as customer,i.gross-coalesce((select sum(a.amount) from public.allocations a where a.invoice_id=i.id),0) as open
    from public.invoices i join public.customers c on c.id=i.customer_id where i.tenant_id=p_tenant and i.entity_id=p_entity
  ), rec as (
    select r.*,b.reference,r.amount-coalesce((select sum(a.amount) from public.allocations a where a.receipt_id=r.id),0) as residual
    from public.receipts r join public.bank_lines b on b.id=r.bank_line_id where r.tenant_id=p_tenant and r.entity_id=p_entity
  ) select jsonb_build_object(
    'insights',public.workspace_insights(p_tenant,p_entity,p_as_of),
    'tenant_id',p_tenant,'entity_id',p_entity,'as_of',p_as_of,'fetched_at',now(),'role',public.member_role(p_tenant),'page',p_page,
    'pagination',jsonb_build_object(
      'invoices',exists(select 1 from inv offset offset_rows+50),
      'receipts',exists(select 1 from rec offset offset_rows+50),
      'bank_lines',exists(select 1 from public.bank_lines where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50),
      'approvals',exists(select 1 from public.approvals where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50),
      'audit',exists(select 1 from public.audit_events where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50),
      'imports',exists(select 1 from public.import_batches where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50),
      'ecl_runs',exists(select 1 from public.ecl_runs where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50),
      'agent_runs',exists(select 1 from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50)
    ),
    'has_more',exists(select 1 from inv offset offset_rows+50) or exists(select 1 from rec offset offset_rows+50)
      or exists(select 1 from public.bank_lines where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50)
      or exists(select 1 from public.approvals where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50)
      or exists(select 1 from public.audit_events where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50)
      or exists(select 1 from public.import_batches where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50)
      or exists(select 1 from public.ecl_runs where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50)
      or exists(select 1 from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity offset offset_rows+50),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'number',number,'customer',customer,'customer_id',customer_id,'due_date',due_date,'gross',gross::text,'open',open::text,'lifecycle',lifecycle,'dispute',dispute,'collection',collection,'version',version,'settlement',case when open=0 then 'settled' when open=gross then 'unpaid' else 'partial' end)) from (select * from inv order by number,id limit 50 offset offset_rows) s),'[]'),
    'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'reference',reference,'customer_id',customer_id,'amount',amount::text,'residual',residual::text,'version',version)) from (select * from rec order by created_at,id limit 50 offset offset_rows) s),'[]'),
    'bank_lines',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'reference',b.reference,'booked_at',b.booked_at,'direction',b.direction,'amount',b.amount::text,'version',b.version,'posted',exists(select 1 from public.receipts r where r.bank_line_id=b.id))) from (select * from public.bank_lines where tenant_id=p_tenant and entity_id=p_entity order by booked_at desc,id limit 50 offset offset_rows) b),'[]'),
    'approvals',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'kind',a.kind,'amount',a.amount::text,'maker',a.maker,'approver',a.approver,'status',a.status,
      'invoice_id',a.invoice_id,'receipt_id',a.receipt_id,'bank_line_id',a.bank_line_id,'customer_id',a.customer_id,
      'evidence',a.evidence,'created_at',a.created_at,'version',a.version,
      'captured_versions',jsonb_build_object('invoice',a.invoice_version,'receipt',a.receipt_version,'bank_line',a.bank_version),
      'source_records',jsonb_build_object(
        'customer',(select jsonb_build_object('id',c.id,'name',c.name,'account',c.account)
          from public.customers c where c.id=coalesce(a.customer_id,i.customer_id)
            and c.tenant_id=p_tenant and c.entity_id=p_entity),
        'invoice',case when i.id is not null then jsonb_build_object('id',i.id,'number',i.number,'customer_id',i.customer_id,
          'customer',i.customer,'due_date',i.due_date,'gross',i.gross::text,'open',i.open::text,'lifecycle',i.lifecycle,'version',i.version) end,
        'receipt',case when r.id is not null then jsonb_build_object('id',r.id,'reference',r.reference,'customer_id',r.customer_id,
          'amount',r.amount::text,'residual',r.residual::text,'version',r.version) end,
        'bank_line',case when b.id is not null then jsonb_build_object('id',b.id,'reference',b.reference,'booked_at',b.booked_at,
          'direction',b.direction,'amount',b.amount::text,'version',b.version) end
      )
    ) order by a.created_at desc,a.id)
    from (select * from public.approvals where tenant_id=p_tenant and entity_id=p_entity order by created_at desc,id limit 50 offset offset_rows) a
    left join inv i on i.id=a.invoice_id left join rec r on r.id=a.receipt_id
    left join public.bank_lines b on b.id=coalesce(a.bank_line_id,r.bank_line_id) and b.tenant_id=p_tenant and b.entity_id=p_entity),'[]'),
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'account',account)) from (select * from public.customers where tenant_id=p_tenant and entity_id=p_entity order by name,id limit 2000) s),'[]'),
    'ecl_runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'model_version',model_version,'exposure_snapshot',exposure_snapshot,'scenario',scenario::text,'allowance',allowance::text,'status',status,'as_of',as_of)) from (select * from public.ecl_runs where tenant_id=p_tenant and entity_id=p_entity order by created_at desc,id limit 50 offset offset_rows) s),'[]'),
    'agent_runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'operation_id',operation_id,'updated_at',updated_at)) from (select * from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity order by updated_at desc,id limit 50 offset offset_rows) s),'[]'),
    'imports',coalesce((select jsonb_agg(jsonb_build_object('id',id,'file_name',file_name,'status',status,'rows',rows,'total',total::text,'digest',digest,'created_at',created_at)) from (select * from public.import_batches where tenant_id=p_tenant and entity_id=p_entity order by created_at desc,id limit 50 offset offset_rows) s),'[]'),
    'audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actor',actor,'operation',operation,'record_id',record_id,'at',at,'detail',detail)) from (select * from public.audit_events where tenant_id=p_tenant and entity_id=p_entity order by at desc,id limit 50 offset offset_rows) s),'[]'),
    'totals',jsonb_build_object('gross',(select coalesce(sum(gross),0)::text from inv where lifecycle='posted'),'open',(select coalesce(sum(open),0)::text from inv where lifecycle='posted'),'overdue',(select coalesce(sum(open),0)::text from inv where lifecycle='posted' and due_date<p_as_of and open>0),'unapplied',(select coalesce(sum(residual),0)::text from rec),'allowance',(select allowance::text from public.ecl_runs where tenant_id=p_tenant and entity_id=p_entity and status='approved' and as_of=p_as_of order by created_at desc limit 1),'dso_days',null,'cei_percent',null,'invoice_count',(select count(*) from inv),'pending_count',(select count(*) from public.approvals where tenant_id=p_tenant and entity_id=p_entity and status='pending'))
  ) into result; return result;
end $$;
commit;
