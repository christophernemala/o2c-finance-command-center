-- No demo records. Provision tenants/memberships through a trusted administrator.
begin;
create table public.tenants (id uuid primary key default gen_random_uuid(), name text not null);
create table public.memberships (
  tenant_id uuid not null references public.tenants, user_id uuid not null references auth.users,
  role text not null check (role in ('viewer','maker','approver','admin')), primary key (tenant_id,user_id)
);
create table public.entities (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants,
  name text not null, currency text not null default 'AED' check(currency='AED'), unique(tenant_id,id)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  account text not null, name text not null, unique(tenant_id,entity_id,id), unique(tenant_id,entity_id,account),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  customer_id uuid not null, number text not null, issued_at date not null, due_date date not null,
  gross numeric(15,2) not null check(gross>0), lifecycle text not null default 'posted' check(lifecycle in ('posted','void')),
  dispute text not null default 'none' check(dispute in ('none','open','resolved')),
  collection text not null default 'normal' check(collection in ('normal','follow_up','promise_to_pay')),
  version integer not null default 1, unique(tenant_id,entity_id,id), unique(tenant_id,entity_id,number),
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id)
);
create table public.bank_lines (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  reference text not null, booked_at date not null, direction text not null check(direction in ('credit','debit')),
  amount numeric(15,2) not null check(amount>0), version integer not null default 1,
  unique(tenant_id,entity_id,id), unique(tenant_id,entity_id,reference),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create table public.receipts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  customer_id uuid not null, bank_line_id uuid not null, amount numeric(15,2) not null check(amount>0),
  version integer not null default 1, created_at timestamptz not null default now(),
  unique(tenant_id,entity_id,id), unique(bank_line_id),
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,bank_line_id) references public.bank_lines(tenant_id,entity_id,id)
);
create table public.approvals (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null,
  kind text not null check(kind in ('receipt','allocation')), amount numeric(15,2) not null check(amount>0),
  maker uuid not null references auth.users, approver uuid references auth.users,
  status text not null default 'pending' check(status in ('pending','approved','rejected','posted')),
  invoice_id uuid, receipt_id uuid, bank_line_id uuid, customer_id uuid,
  invoice_version integer, receipt_version integer, bank_version integer,
  evidence text not null check(length(evidence) between 10 and 2000), version integer not null default 1,
  created_at timestamptz not null default now(), unique(tenant_id,entity_id,id),
  check(approver is null or approver<>maker),
  check((kind='receipt' and bank_line_id is not null and customer_id is not null and invoice_id is null and receipt_id is null)
    or (kind='allocation' and invoice_id is not null and receipt_id is not null and bank_line_id is null and customer_id is null)),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id),
  foreign key(tenant_id,entity_id,invoice_id) references public.invoices(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,receipt_id) references public.receipts(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,bank_line_id) references public.bank_lines(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id)
);
create table public.allocations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  invoice_id uuid not null, receipt_id uuid not null, approval_id uuid not null unique,
  amount numeric(15,2) not null check(amount>0), created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id,invoice_id) references public.invoices(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,receipt_id) references public.receipts(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,approval_id) references public.approvals(tenant_id,entity_id,id)
);
create table public.journals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  approval_id uuid not null unique, amount numeric(15,2) not null check(amount>0),
  debit_account text not null check(debit_account in ('bank','unapplied_cash')),
  credit_account text not null check(credit_account in ('unapplied_cash','accounts_receivable')),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id,approval_id) references public.approvals(tenant_id,entity_id,id)
);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  maker uuid not null references auth.users, checker uuid references auth.users,
  kind text not null check(kind in ('invoices','bank_lines')), file_name text not null,
  digest text not null check(digest ~ '^sha256:[a-f0-9]{64}$'), payload jsonb not null,
  rows integer not null check(rows between 1 and 2000), total numeric(22,2) not null check(total>0),
  status text not null default 'review' check(status in ('review','committed')),
  created_at timestamptz not null default now(), unique(tenant_id,entity_id,digest),
  check(checker is null or checker<>maker),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create table public.ecl_runs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  model_version text not null, exposure_snapshot text not null, scenario jsonb not null,
  allowance numeric(15,2) not null check(allowance>=0), as_of date not null,
  status text not null check(status in ('review','approved')), created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  name text not null, status text not null check(status in ('proposed','awaiting_approval','executing','posted','failed','outcome_unknown')),
  operation_id uuid, updated_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  actor uuid not null, operation text not null, record_id uuid not null,
  at timestamptz not null default now(), detail jsonb not null,
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create index invoices_scope on public.invoices(tenant_id,entity_id,number,id);
create index receipts_scope on public.receipts(tenant_id,entity_id,created_at,id);
create index allocations_invoice on public.allocations(invoice_id);
create index allocations_receipt on public.allocations(receipt_id);
create index audit_scope on public.audit_events(tenant_id,entity_id,at desc,id);
create index approvals_scope on public.approvals(tenant_id,entity_id,created_at desc,id);

create function public.member_role(p_tenant uuid) returns text language sql stable security definer set search_path='' as $$
  select role from public.memberships where tenant_id=p_tenant and user_id=auth.uid()
$$;
create function public.reject_audit_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Audit records are append-only'; end $$;
create trigger audit_immutable before update or delete on public.audit_events for each row execute function public.reject_audit_mutation();
create trigger ecl_frozen before update or delete on public.ecl_runs for each row execute function public.reject_audit_mutation();
create trigger journals_frozen before update or delete on public.journals for each row execute function public.reject_audit_mutation();
create trigger allocations_frozen before update or delete on public.allocations for each row execute function public.reject_audit_mutation();
create function public.freeze_import_payload() returns trigger language plpgsql set search_path='' as $$
begin
  if (to_jsonb(new)-'status'-'checker') is distinct from (to_jsonb(old)-'status'-'checker') then raise exception 'Preserved import cannot change'; end if;
  return new;
end $$;
create trigger import_payload_frozen before update on public.import_batches for each row execute function public.freeze_import_payload();

alter table public.tenants enable row level security;
create policy tenant_read on public.tenants for select to authenticated using(public.member_role(id) is not null);
alter table public.memberships enable row level security;
create policy member_read on public.memberships for select to authenticated using(user_id=auth.uid());
do $$ declare t text; begin
  foreach t in array array['entities','customers','invoices','bank_lines','receipts','approvals','allocations','journals','import_batches','ecl_runs','agent_runs','audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy scope_read on public.%I for select to authenticated using(public.member_role(tenant_id) is not null)',t);
  end loop;
end $$;
revoke all on public.tenants,public.memberships,public.entities,public.customers,public.invoices,public.bank_lines,
  public.receipts,public.approvals,public.allocations,public.journals,public.import_batches,public.ecl_runs,public.agent_runs,public.audit_events from anon, authenticated;
grant select on public.tenants,public.memberships,public.entities,public.customers,public.invoices,public.bank_lines,
  public.receipts,public.approvals,public.allocations,public.journals,public.import_batches,public.ecl_runs,public.agent_runs,public.audit_events to authenticated;

create function public.workspace_access() returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenant_id',m.tenant_id,'tenant_name',t.name,'role',m.role) order by t.name),'[]')
  from public.memberships m join public.tenants t on t.id=m.tenant_id where m.user_id=auth.uid()
$$;
create function public.workspace_entities(p_tenant uuid) returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'currency',currency) order by name),'[]') from public.entities where tenant_id=p_tenant
$$;

create function public.workspace_snapshot(p_tenant uuid,p_entity uuid,p_as_of date,p_page integer default 0)
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
    'tenant_id',p_tenant,'entity_id',p_entity,'as_of',p_as_of,'fetched_at',now(),'role',public.member_role(p_tenant),'page',p_page,
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
    'approvals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount',amount::text,'maker',maker,'approver',approver,'status',status,'invoice_id',invoice_id,'receipt_id',receipt_id,'bank_line_id',bank_line_id,'customer_id',customer_id,'evidence',evidence,'created_at',created_at,'version',version)) from (select * from public.approvals where tenant_id=p_tenant and entity_id=p_entity order by created_at desc,id limit 50 offset offset_rows) s),'[]'),
    'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'account',account)) from (select * from public.customers where tenant_id=p_tenant and entity_id=p_entity order by name,id limit 2000) s),'[]'),
    'ecl_runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'model_version',model_version,'exposure_snapshot',exposure_snapshot,'scenario',scenario::text,'allowance',allowance::text,'status',status,'as_of',as_of)) from (select * from public.ecl_runs where tenant_id=p_tenant and entity_id=p_entity order by created_at desc,id limit 50 offset offset_rows) s),'[]'),
    'agent_runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'operation_id',operation_id,'updated_at',updated_at)) from (select * from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity order by updated_at desc,id limit 50 offset offset_rows) s),'[]'),
    'imports',coalesce((select jsonb_agg(jsonb_build_object('id',id,'file_name',file_name,'status',status,'rows',rows,'total',total::text,'digest',digest,'created_at',created_at)) from (select * from public.import_batches where tenant_id=p_tenant and entity_id=p_entity order by created_at desc,id limit 50 offset offset_rows) s),'[]'),
    'audit',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actor',actor,'operation',operation,'record_id',record_id,'at',at,'detail',detail)) from (select * from public.audit_events where tenant_id=p_tenant and entity_id=p_entity order by at desc,id limit 50 offset offset_rows) s),'[]'),
    'totals',jsonb_build_object('gross',(select coalesce(sum(gross),0)::text from inv where lifecycle='posted'),'open',(select coalesce(sum(open),0)::text from inv where lifecycle='posted'),'unapplied',(select coalesce(sum(residual),0)::text from rec),'allowance',(select allowance::text from public.ecl_runs where tenant_id=p_tenant and entity_id=p_entity and status='approved' and as_of=p_as_of order by created_at desc limit 1),'invoice_count',(select count(*) from inv),'pending_count',(select count(*) from public.approvals where tenant_id=p_tenant and entity_id=p_entity and status='pending'))
  ) into result; return result;
end $$;

create function public.propose_action(p_tenant uuid,p_entity uuid,p_id uuid,p_kind text,p_amount text,p_evidence text,
  p_invoice uuid default null,p_receipt uuid default null,p_bank uuid default null,p_customer uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.invoices; r public.receipts; b public.bank_lines; prior public.approvals; value numeric(15,2);
begin
  if public.member_role(p_tenant) not in ('maker','admin') or public.member_role(p_tenant) is null then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' then raise exception 'Invalid decimal'; end if;
  value:=p_amount::numeric; if value<=0 then raise exception 'Invalid amount'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into prior from public.approvals where id=p_id;
  if found then
    if prior.tenant_id=p_tenant and prior.entity_id=p_entity and prior.maker=auth.uid() and prior.kind=p_kind and prior.amount=value and prior.evidence=p_evidence
      and prior.invoice_id is not distinct from p_invoice and prior.receipt_id is not distinct from p_receipt and prior.bank_line_id is not distinct from p_bank and prior.customer_id is not distinct from p_customer then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if p_kind='allocation' then
    select * into i from public.invoices where id=p_invoice and tenant_id=p_tenant and entity_id=p_entity for update;
    if not found or i.lifecycle<>'posted' then raise exception 'Invoice unavailable'; end if;
    select * into r from public.receipts where id=p_receipt and tenant_id=p_tenant and entity_id=p_entity for update;
    if not found or r.customer_id<>i.customer_id then raise exception 'Receipt/customer mismatch'; end if;
    if value>i.gross-coalesce((select sum(amount) from public.allocations where invoice_id=i.id),0) or value>r.amount-coalesce((select sum(amount) from public.allocations where receipt_id=r.id),0) then raise exception 'Amount exceeds remaining balance'; end if;
  elsif p_kind='receipt' then
    select * into b from public.bank_lines where id=p_bank and tenant_id=p_tenant and entity_id=p_entity for update;
    if not found or b.direction<>'credit' or value<>b.amount or exists(select 1 from public.receipts where bank_line_id=b.id) then raise exception 'Bank line cannot be posted'; end if;
    if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  else raise exception 'Unsupported command'; end if;
  insert into public.approvals(id,tenant_id,entity_id,kind,amount,maker,invoice_id,receipt_id,bank_line_id,customer_id,invoice_version,receipt_version,bank_version,evidence)
    values(p_id,p_tenant,p_entity,p_kind,value,auth.uid(),p_invoice,p_receipt,p_bank,p_customer,i.version,r.version,b.version,p_evidence);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'proposal.submitted',p_id,jsonb_build_object('kind',p_kind,'amount',value::text,'evidence',p_evidence));
  return p_id;
end $$;

create function public.decide_action(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer,p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare a public.approvals;
begin
  if public.member_role(p_tenant) not in ('approver','admin') or public.member_role(p_tenant) is null then raise exception 'Forbidden'; end if;
  select * into a from public.approvals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or a.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if p_decision not in ('approved','rejected') or p_decision is null then raise exception 'Invalid decision'; end if;
  if a.status=p_decision and a.approver=auth.uid() then return; end if;
  if a.status<>'pending' or a.version<>p_version then raise exception 'Stale proposal; refresh and review'; end if;
  update public.approvals set status=p_decision,approver=auth.uid(),version=version+1 where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'proposal.'||p_decision,p_id,jsonb_build_object('proposal_version',p_version,'amount',a.amount::text));
end $$;

create function public.execute_action(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.approvals; i public.invoices; r public.receipts; b public.bank_lines; journal_id uuid;
begin
  if public.member_role(p_tenant) not in ('maker','approver','admin') or public.member_role(p_tenant) is null then raise exception 'Forbidden'; end if;
  select * into a from public.approvals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found then raise exception 'Forbidden'; end if;
  if a.status='posted' then select id into journal_id from public.journals where approval_id=p_id; return journal_id; end if;
  if a.status<>'approved' or a.version<>p_version or a.approver=a.maker then raise exception 'Approved current proposal required'; end if;
  if public.member_role(p_tenant) is null or not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=a.approver and role in ('approver','admin'))
    or not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=a.maker and role in ('maker','admin')) then raise exception 'Approval authority revoked'; end if;
  if a.kind='allocation' then
    select * into i from public.invoices where id=a.invoice_id for update;
    select * into r from public.receipts where id=a.receipt_id for update;
    if i.version<>a.invoice_version or r.version<>a.receipt_version or i.lifecycle<>'posted' or i.customer_id<>r.customer_id then raise exception 'Stale evidence; submit a new proposal'; end if;
    if a.amount>i.gross-coalesce((select sum(amount) from public.allocations where invoice_id=i.id),0) or a.amount>r.amount-coalesce((select sum(amount) from public.allocations where receipt_id=r.id),0) then raise exception 'Insufficient remaining amount'; end if;
    insert into public.allocations(tenant_id,entity_id,invoice_id,receipt_id,approval_id,amount) values(p_tenant,p_entity,i.id,r.id,a.id,a.amount);
    update public.invoices set version=version+1 where id=i.id;
    update public.receipts set version=version+1 where id=r.id;
    insert into public.journals(tenant_id,entity_id,approval_id,amount,debit_account,credit_account) values(p_tenant,p_entity,a.id,a.amount,'unapplied_cash','accounts_receivable') returning id into journal_id;
  else
    select * into b from public.bank_lines where id=a.bank_line_id for update;
    if b.version<>a.bank_version or b.direction<>'credit' or b.amount<>a.amount or exists(select 1 from public.receipts where bank_line_id=b.id) then raise exception 'Stale bank evidence'; end if;
    insert into public.receipts(tenant_id,entity_id,bank_line_id,customer_id,amount) values(p_tenant,p_entity,b.id,a.customer_id,a.amount);
    update public.bank_lines set version=version+1 where id=b.id;
    insert into public.journals(tenant_id,entity_id,approval_id,amount,debit_account,credit_account) values(p_tenant,p_entity,a.id,a.amount,'bank','unapplied_cash') returning id into journal_id;
  end if;
  update public.approvals set status='posted',version=version+1 where id=a.id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'journal.posted',journal_id,jsonb_build_object('approval_id',a.id,'amount',a.amount::text));
  return journal_id;
end $$;

create function public.stage_import(p_tenant uuid,p_entity uuid,p_kind text,p_name text,p_payload jsonb)
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
      if entry->>'issued_at' is null or entry->>'due_date' is null then raise exception 'Dates required'; end if;
      perform (entry->>'issued_at')::date,(entry->>'due_date')::date;
    else
      if coalesce(length(entry->>'reference'),0) not between 1 and 200 or entry->>'direction' is null or entry->>'direction' not in ('credit','debit') or entry->>'booked_at' is null then raise exception 'Invalid bank record'; end if;
      perform (entry->>'booked_at')::date;
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

create function public.commit_import(p_tenant uuid,p_entity uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare batch public.import_batches; entry jsonb; customer uuid;
begin
  if public.member_role(p_tenant) not in ('approver','admin') or public.member_role(p_tenant) is null then raise exception 'Forbidden'; end if;
  select * into batch from public.import_batches where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or batch.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if batch.status='committed' then return; end if;
  for entry in select value from jsonb_array_elements(batch.payload) loop
    if batch.kind='invoices' then
      insert into public.customers(tenant_id,entity_id,account,name) values(p_tenant,p_entity,entry->>'account',entry->>'customer') on conflict(tenant_id,entity_id,account) do nothing;
      select id into customer from public.customers where tenant_id=p_tenant and entity_id=p_entity and account=entry->>'account' and name=entry->>'customer';
      if customer is null then raise exception 'Customer identity conflict'; end if;
      insert into public.invoices(tenant_id,entity_id,customer_id,number,issued_at,due_date,gross) values(p_tenant,p_entity,customer,entry->>'number',(entry->>'issued_at')::date,(entry->>'due_date')::date,(entry->>'amount')::numeric);
    else
      insert into public.bank_lines(tenant_id,entity_id,reference,booked_at,direction,amount) values(p_tenant,p_entity,entry->>'reference',(entry->>'booked_at')::date,entry->>'direction',(entry->>'amount')::numeric);
    end if;
  end loop;
  update public.import_batches set status='committed',checker=auth.uid() where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'import.committed',p_id,jsonb_build_object('digest',batch.digest,'rows',batch.rows,'total',batch.total::text));
end $$;

revoke execute on function public.member_role(uuid),public.reject_audit_mutation(),public.freeze_import_payload(),public.workspace_access(),public.workspace_entities(uuid),
  public.workspace_snapshot(uuid,uuid,date,integer),public.propose_action(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,uuid),
  public.decide_action(uuid,uuid,uuid,integer,text),public.execute_action(uuid,uuid,uuid,integer),
  public.stage_import(uuid,uuid,text,text,jsonb),public.commit_import(uuid,uuid,uuid) from public,anon;
grant execute on function public.member_role(uuid),public.workspace_access(),public.workspace_entities(uuid),
  public.workspace_snapshot(uuid,uuid,date,integer),public.propose_action(uuid,uuid,uuid,text,text,text,uuid,uuid,uuid,uuid),
  public.decide_action(uuid,uuid,uuid,integer,text),public.execute_action(uuid,uuid,uuid,integer),
  public.stage_import(uuid,uuid,text,text,jsonb),public.commit_import(uuid,uuid,uuid) to authenticated;
commit;
