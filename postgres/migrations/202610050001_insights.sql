-- Apply after 202610040001_workspaces.sql. No records are seeded.
-- Approved forecast records come from a trusted governed source integration.
begin;
create table public.cashflow_runs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  starts_on date not null, opening_cash numeric(15,2) not null,
  scenario text not null check(length(trim(scenario)) between 1 and 2000),
  model_version text not null check(length(trim(model_version)) between 1 and 2000),
  source_digest text not null check(source_digest ~ '^sha256:[a-f0-9]{64}$'),
  maker uuid not null references auth.users, checker uuid not null references auth.users,
  approved_at timestamptz not null check(approved_at <= now()),
  evidence text not null check(length(trim(evidence)) between 1 and 2000),
  confidence_percent numeric(5,2) check(confidence_percent between 0 and 100),
  confidence_method text check(length(trim(confidence_method)) between 1 and 2000),
  entries jsonb not null check(jsonb_typeof(entries)='array' and jsonb_array_length(entries)<=2000),
  check(maker<>checker),
  check((confidence_percent is null) = (confidence_method is null)),
  unique(tenant_id,entity_id,source_digest),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
alter table public.cashflow_runs enable row level security;
create policy cashflow_read on public.cashflow_runs for select to authenticated using(public.member_role(tenant_id) is not null);
revoke all on public.cashflow_runs from public,anon,authenticated;
grant select on public.cashflow_runs to authenticated;
create index cashflow_scope on public.cashflow_runs(tenant_id,entity_id,approved_at desc,id);
create trigger cashflow_frozen before update or delete on public.cashflow_runs for each row execute function public.reject_audit_mutation();

create function public.validate_cashflow_source() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; seen text[] := '{}'; at_date date;
begin
  if not exists(select 1 from public.memberships where tenant_id=new.tenant_id and user_id=new.maker and role in ('maker','admin'))
    or not exists(select 1 from public.memberships where tenant_id=new.tenant_id and user_id=new.checker and role in ('approver','admin')) then
    raise exception 'Independent authorized forecast maker/checker required';
  end if;
  for item in select value from jsonb_array_elements(new.entries) loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'id') is distinct from 'string'
      or length(trim(item->>'id')) not between 1 and 200 or item->>'id'=any(seen)
      or jsonb_typeof(item->'date') is distinct from 'string' or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(item->>'direction','') not in ('in','out') or coalesce(item->>'category','') not in ('operating','investing','financing')
      or jsonb_typeof(item->'amount') is distinct from 'string' or item->>'amount' !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$'
      or jsonb_typeof(item->'source_reference') is distinct from 'string' or length(trim(item->>'source_reference')) not between 1 and 2000 then
      raise exception 'Invalid preserved forecast entry';
    end if;
    at_date := (item->>'date')::date;
    if at_date < new.starts_on or at_date >= new.starts_on+91 or (item->>'amount')::numeric<=0 then
      raise exception 'Forecast entry outside horizon or nonpositive';
    end if;
    seen := array_append(seen,item->>'id');
  end loop;
  return new;
end $$;
create trigger cashflow_validate before insert on public.cashflow_runs for each row execute function public.validate_cashflow_source();
revoke all on function public.validate_cashflow_source() from public,anon,authenticated;

create function public.workspace_insights(p_tenant uuid,p_entity uuid,p_as_of date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or public.member_role(p_tenant) is null or p_as_of is null
    or not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  with inv as (
    select i.*,i.gross-coalesce((select sum(a.amount) from public.allocations a where a.invoice_id=i.id),0) as open
    from public.invoices i where i.tenant_id=p_tenant and i.entity_id=p_entity and i.lifecycle='posted'
  ), defs as (
    select 1 ord,'aging' key,'Receivables aging' title,'Open balances by days past due; due today is current.' description,'AED' unit,
      coalesce((select jsonb_agg(jsonb_build_object('label',label,'value',value::text) order by bucket) from (
        select b.bucket,b.label,coalesce(sum(i.open),0) value
        from (values (0,'Current'),(1,'1–30 days'),(2,'31–60 days'),(3,'61–90 days'),(4,'90+ days')) b(bucket,label)
        left join inv i on b.bucket=case when i.due_date>=p_as_of then 0 when p_as_of-i.due_date<=30 then 1 when p_as_of-i.due_date<=60 then 2 when p_as_of-i.due_date<=90 then 3 else 4 end
        group by b.bucket,b.label) amounts),'[]') series
    union all select 2,'settlement','Settlement states','Posted invoices grouped by settled, partial, or unpaid balance.','records',
      (select jsonb_agg(jsonb_build_object('label',b.label,'value',(select count(*)::text from inv i where case when i.open=0 then 'Settled' when i.open=i.gross then 'Unpaid' else 'Partial' end=b.label)) order by b.ord)
       from (values(1,'Unpaid'),(2,'Partial'),(3,'Settled')) b(ord,label))
    union all select 3,'disputes','Dispute exposure','Remaining posted invoice balances by dispute state.','AED',
      (select jsonb_agg(jsonb_build_object('label',b.label,'value',(select coalesce(sum(open),0)::text from inv where dispute=b.label)) order by b.ord)
       from (values(1,'none'),(2,'open'),(3,'resolved')) b(ord,label))
    union all select 4,'collections','Collection states','Open posted invoice balances by recorded collection state.','AED',
      (select jsonb_agg(jsonb_build_object('label',b.label,'value',(select coalesce(sum(open),0)::text from inv where collection=b.label)) order by b.ord)
       from (values(1,'normal'),(2,'follow_up'),(3,'promise_to_pay')) b(ord,label))
    union all select 5,'bank_direction','Statement direction','All imported statement amounts; not available cash or a net balance.','AED',
      (select jsonb_agg(jsonb_build_object('label',b.label,'value',(select coalesce(sum(amount),0)::text from public.bank_lines where tenant_id=p_tenant and entity_id=p_entity and direction=b.label)) order by b.ord)
       from (values(1,'credit'),(2,'debit')) b(ord,label))
    union all select 6,'approvals','Financial approval states','Recorded proposal counts. Approval remains separate from posting.','records',
      (select jsonb_agg(jsonb_build_object('label',b.label,'value',(select count(*)::text from public.approvals where tenant_id=p_tenant and entity_id=p_entity and status=b.label)) order by b.ord)
       from (values(1,'pending'),(2,'approved'),(3,'rejected'),(4,'posted')) b(ord,label))
  ) select jsonb_build_object(
    'charts',(select jsonb_agg(jsonb_build_object('key',key,'title',title,'description',description,'unit',unit,'series',series) order by ord) from defs),
    'forecast',(select jsonb_build_object('id',id,'tenant_id',tenant_id,'entity_id',entity_id,'starts_on',starts_on,
      'opening_cash',opening_cash::text,'scenario',scenario,'model_version',model_version,'source_digest',source_digest,
      'maker',maker,'checker',checker,'approved_at',approved_at,'evidence',evidence,'confidence_percent',confidence_percent::text,
      'confidence_method',confidence_method,'entries',entries)
      from public.cashflow_runs where tenant_id=p_tenant and entity_id=p_entity and starts_on<=p_as_of and starts_on+90>=p_as_of
        and approved_at::date<=p_as_of order by approved_at desc,id desc limit 1)
  ) into result; return result;
end $$;
revoke all on function public.workspace_insights(uuid,uuid,date) from public,anon;
grant execute on function public.workspace_insights(uuid,uuid,date) to authenticated;

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
