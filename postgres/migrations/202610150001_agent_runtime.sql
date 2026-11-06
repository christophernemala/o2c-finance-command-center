-- Agent runtime: LLM agents act through a dedicated non-human identity per tenant.
-- Agents may read and propose. They never approve. Posting without a human checker
-- happens only through agent_auto_post under an active, independently approved
-- per-entity policy (off by default, per-item and daily AED limits, exact matches only).
begin;

-- 1. Agent identity -------------------------------------------------------------------
alter table auth.users add column kind text not null default 'human' check(kind in ('human','agent'));
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check check(role in ('viewer','maker','approver','admin','agent'));

create table o2c_private.agent_sessions (
  token_hash text primary key references auth.sessions(token_hash) on delete cascade,
  run_id uuid not null unique
);
revoke all on o2c_private.agent_sessions from public, anon, authenticated;

-- 2. Run, step, schedule and policy records --------------------------------------------
alter table public.agent_runs drop constraint agent_runs_status_check;
alter table public.agent_runs add constraint agent_runs_status_check check(status in
  ('proposed','awaiting_approval','executing','posted','failed','outcome_unknown','queued','running','succeeded'));
alter table public.agent_runs
  add column kind text check(kind in ('collections','cash_application','credit_risk','reporting')),
  add column trigger text check(trigger in ('manual','schedule')),
  add column requested_by uuid references auth.users,
  add column agent_user uuid references auth.users,
  add column as_of date,
  add column model text check(length(model) <= 100),
  add column input_tokens integer not null default 0 check(input_tokens >= 0),
  add column output_tokens integer not null default 0 check(output_tokens >= 0),
  add column cache_read_tokens integer not null default 0 check(cache_read_tokens >= 0),
  add column cost_usd numeric(12,6) check(cost_usd >= 0),
  add column summary text check(length(summary) <= 20000),
  add column error text check(length(error) <= 2000),
  add column created_at timestamptz not null default now(),
  add column started_at timestamptz,
  add column finished_at timestamptz,
  add column step_count integer not null default 0;
create unique index agent_runs_schedule_once on public.agent_runs(tenant_id,entity_id,kind,as_of) where trigger='schedule';
create index agent_runs_recent on public.agent_runs(tenant_id,entity_id,created_at desc,id);

create table public.agent_steps (
  run_id uuid not null references public.agent_runs(id), seq integer not null check(seq between 1 and 1000),
  tenant_id uuid not null, entity_id uuid not null,
  type text not null check(type in ('thinking','message','tool_call','tool_result','finding','proposal','auto_execution','error')),
  tool text check(length(tool) <= 100), detail jsonb not null check(octet_length(detail::text) <= 65536),
  duration_ms integer check(duration_ms >= 0), created_at timestamptz not null default now(),
  primary key(run_id,seq), foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create trigger agent_steps_frozen before update or delete on public.agent_steps for each row execute function public.reject_audit_mutation();

create table public.agent_schedules (
  tenant_id uuid not null, entity_id uuid not null,
  kind text not null check(kind in ('collections','cash_application','credit_risk','reporting')),
  cadence text not null check(cadence in ('manual','daily')),
  updated_by uuid not null references auth.users, updated_at timestamptz not null default now(),
  primary key(tenant_id,entity_id,kind), foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);

create table public.agent_policies (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null,
  auto_execute boolean not null,
  per_item_limit numeric(15,2) not null check(per_item_limit >= 0),
  daily_limit numeric(15,2) not null check(daily_limit >= per_item_limit),
  status text not null default 'pending' check(status in ('pending','active','rejected','superseded')),
  maker uuid not null references auth.users, checker uuid references auth.users,
  created_at timestamptz not null default now(), decided_at timestamptz,
  check(checker is null or checker <> maker),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index agent_policies_one_active on public.agent_policies(tenant_id,entity_id) where status='active';

alter table public.approvals
  add column checker_basis text not null default 'human' check(checker_basis in ('human','policy')),
  add column policy_id uuid references public.agent_policies,
  add column agent_run_id uuid references public.agent_runs;
alter table public.approvals add constraint approvals_policy_basis check(
  (checker_basis='human' and policy_id is null) or (checker_basis='policy' and policy_id is not null and approver is null));

-- 3. Copilot records (owner-private) ----------------------------------------------------
create table public.copilot_threads (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null,
  user_id uuid not null references auth.users, title text not null check(length(title) between 1 and 200),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create index copilot_threads_owner on public.copilot_threads(user_id,tenant_id,entity_id,updated_at desc);
create table public.copilot_messages (
  thread_id uuid not null references public.copilot_threads, seq integer not null check(seq between 1 and 400),
  role text not null check(role in ('user','assistant')),
  content text not null check(length(content) between 1 and 100000),
  trace jsonb not null default '[]' check(octet_length(trace::text) <= 262144),
  created_at timestamptz not null default now(), primary key(thread_id,seq)
);
create trigger copilot_messages_frozen before update or delete on public.copilot_messages for each row execute function public.reject_audit_mutation();
create table public.copilot_files (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null,
  user_id uuid not null references auth.users,
  name text not null check(length(name) between 1 and 200),
  media_type text not null check(media_type in ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  content bytea not null check(octet_length(content) between 1 and 2097152),
  digest text not null check(digest ~ '^[a-f0-9]{64}$' and encode(sha256(content),'hex')=digest),
  created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create trigger copilot_files_frozen before update or delete on public.copilot_files for each row execute function public.reject_audit_mutation();

-- 4. RLS ---------------------------------------------------------------------------------
alter table public.agent_steps enable row level security;
create policy scope_read on public.agent_steps for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.agent_schedules enable row level security;
create policy scope_read on public.agent_schedules for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.agent_policies enable row level security;
create policy scope_read on public.agent_policies for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.copilot_threads enable row level security;
create policy owner_read on public.copilot_threads for select to authenticated using(user_id=auth.uid() and public.member_role(tenant_id) is not null);
alter table public.copilot_messages enable row level security;
create policy owner_read on public.copilot_messages for select to authenticated using(exists(
  select 1 from public.copilot_threads t where t.id=thread_id and t.user_id=auth.uid() and public.member_role(t.tenant_id) is not null));
alter table public.copilot_files enable row level security;
create policy owner_read on public.copilot_files for select to authenticated using(user_id=auth.uid() and public.member_role(tenant_id) is not null);
revoke all on public.agent_steps,public.agent_schedules,public.agent_policies,public.copilot_threads,public.copilot_messages,public.copilot_files from public,anon,authenticated;
grant select on public.agent_steps,public.agent_schedules,public.agent_policies,public.copilot_threads,public.copilot_messages,public.copilot_files to authenticated;

-- 5. Shared helpers ----------------------------------------------------------------------
create function o2c_private.current_agent_run() returns uuid language sql stable security definer set search_path='' as $$
  select s.run_id from o2c_private.agent_sessions s where s.token_hash=current_setting('o2c.session_hash',true)
$$;
create function o2c_private.require_scope(p_tenant uuid,p_entity uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare r text := public.member_role(p_tenant);
begin
  if auth.uid() is null or r is null or not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  return r;
end $$;
create function o2c_private.dubai_today() returns date language sql stable set search_path='' as $$
  select (now() at time zone 'Asia/Dubai')::date
$$;
-- Open balance of each posted invoice in scope. Used by every read tool so figures agree.
create function o2c_private.open_invoices(p_tenant uuid,p_entity uuid) returns table(
  id uuid, number text, customer_id uuid, customer text, account text, issued_at date, due_date date,
  gross numeric, open numeric, dispute text, collection text, version integer)
language sql stable security definer set search_path='' as $$
  select i.id,i.number,i.customer_id,c.name,c.account,i.issued_at,i.due_date,i.gross,
    i.gross-coalesce((select sum(a.amount) from public.allocations a where a.invoice_id=i.id),0),
    i.dispute,i.collection,i.version
  from public.invoices i join public.customers c on c.id=i.customer_id
  where i.tenant_id=p_tenant and i.entity_id=p_entity and i.lifecycle='posted'
$$;
revoke all on function o2c_private.current_agent_run(),o2c_private.require_scope(uuid,uuid),o2c_private.dubai_today(),o2c_private.open_invoices(uuid,uuid) from public,anon,authenticated;

-- Posting body shared by human execution and policy auto-execution.
create function o2c_private.post_approved(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.approvals; i public.invoices; r public.receipts; b public.bank_lines; journal_id uuid;
begin
  select * into a from public.approvals where id=p_id for update;
  if not found or a.status<>'approved' then raise exception 'Approved current proposal required'; end if;
  if a.kind='allocation' then
    select * into i from public.invoices where id=a.invoice_id for update;
    select * into r from public.receipts where id=a.receipt_id for update;
    if i.version<>a.invoice_version or r.version<>a.receipt_version or i.lifecycle<>'posted' or i.customer_id<>r.customer_id then raise exception 'Stale evidence; submit a new proposal'; end if;
    if a.amount>i.gross-coalesce((select sum(amount) from public.allocations where invoice_id=i.id),0) or a.amount>r.amount-coalesce((select sum(amount) from public.allocations where receipt_id=r.id),0) then raise exception 'Insufficient remaining amount'; end if;
    insert into public.allocations(tenant_id,entity_id,invoice_id,receipt_id,approval_id,amount) values(a.tenant_id,a.entity_id,i.id,r.id,a.id,a.amount);
    update public.invoices set version=version+1 where id=i.id;
    update public.receipts set version=version+1 where id=r.id;
    insert into public.journals(tenant_id,entity_id,approval_id,amount,debit_account,credit_account) values(a.tenant_id,a.entity_id,a.id,a.amount,'unapplied_cash','accounts_receivable') returning id into journal_id;
  else
    select * into b from public.bank_lines where id=a.bank_line_id for update;
    if b.version<>a.bank_version or b.direction<>'credit' or b.amount<>a.amount or exists(select 1 from public.receipts where bank_line_id=b.id) then raise exception 'Stale bank evidence'; end if;
    insert into public.receipts(tenant_id,entity_id,bank_line_id,customer_id,amount) values(a.tenant_id,a.entity_id,b.id,a.customer_id,a.amount);
    update public.bank_lines set version=version+1 where id=b.id;
    insert into public.journals(tenant_id,entity_id,approval_id,amount,debit_account,credit_account) values(a.tenant_id,a.entity_id,a.id,a.amount,'bank','unapplied_cash') returning id into journal_id;
  end if;
  update public.approvals set status='posted',version=version+1 where id=a.id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(a.tenant_id,a.entity_id,auth.uid(),'journal.posted',journal_id,
    jsonb_build_object('approval_id',a.id,'amount',a.amount::text,'checker_basis',a.checker_basis,'policy_id',a.policy_id));
  return journal_id;
end $$;
revoke all on function o2c_private.post_approved(uuid) from public,anon,authenticated;

-- 6. Existing commands accept the agent as maker only -----------------------------------
create or replace function public.propose_action(p_tenant uuid,p_entity uuid,p_id uuid,p_kind text,p_amount text,p_evidence text,
  p_invoice uuid default null,p_receipt uuid default null,p_bank uuid default null,p_customer uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.invoices; r public.receipts; b public.bank_lines; prior public.approvals; value numeric(15,2); run uuid := o2c_private.current_agent_run();
begin
  if coalesce(public.member_role(p_tenant),'') not in ('maker','admin','agent') then raise exception 'Forbidden'; end if;
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
  insert into public.approvals(id,tenant_id,entity_id,kind,amount,maker,invoice_id,receipt_id,bank_line_id,customer_id,invoice_version,receipt_version,bank_version,evidence,agent_run_id)
    values(p_id,p_tenant,p_entity,p_kind,value,auth.uid(),p_invoice,p_receipt,p_bank,p_customer,i.version,r.version,b.version,p_evidence,run);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'proposal.submitted',p_id,
    jsonb_build_object('kind',p_kind,'amount',value::text,'evidence',p_evidence,'agent_run_id',run));
  return p_id;
end $$;

create or replace function public.execute_action(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.approvals; journal_id uuid;
begin
  if coalesce(public.member_role(p_tenant),'') not in ('maker','approver','admin') then raise exception 'Forbidden'; end if;
  select * into a from public.approvals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found then raise exception 'Forbidden'; end if;
  if a.status='posted' then select id into journal_id from public.journals where approval_id=p_id; return journal_id; end if;
  if a.status<>'approved' or a.version<>p_version or a.approver=a.maker or a.checker_basis<>'human' then raise exception 'Approved current proposal required'; end if;
  if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=a.approver and role in ('approver','admin'))
    or not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=a.maker and role in ('maker','admin','agent')) then raise exception 'Approval authority revoked'; end if;
  return o2c_private.post_approved(a.id);
end $$;

-- 7. Policy-governed auto-posting --------------------------------------------------------
create function public.agent_auto_post(p_tenant uuid,p_entity uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.approvals; p public.agent_policies; b public.bank_lines; r public.receipts; posted_today numeric; journal uuid; exact boolean;
begin
  if coalesce(public.member_role(p_tenant),'') <> 'agent' then raise exception 'Forbidden'; end if;
  select * into a from public.approvals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or a.maker<>auth.uid() then raise exception 'Forbidden'; end if;
  if a.status='posted' then return jsonb_build_object('status','posted','journal_id',(select id from public.journals where approval_id=a.id)); end if;
  if a.status<>'pending' then raise exception 'Proposal is not pending'; end if;
  select * into p from public.agent_policies where tenant_id=p_tenant and entity_id=p_entity and status='active' for update;
  if not found or not p.auto_execute then return jsonb_build_object('status','awaiting_approval','reason','Auto-execution disabled for this entity'); end if;
  if a.amount>p.per_item_limit then return jsonb_build_object('status','awaiting_approval','reason','Amount above the per-item auto-execution limit'); end if;
  select coalesce(sum(x.amount),0) into posted_today from public.approvals x
    where x.tenant_id=p_tenant and x.entity_id=p_entity and x.checker_basis='policy' and x.status='posted'
      and (x.created_at at time zone 'Asia/Dubai')::date=o2c_private.dubai_today();
  if posted_today+a.amount>p.daily_limit then return jsonb_build_object('status','awaiting_approval','reason','Daily auto-execution limit reached'); end if;
  -- Only exact matches qualify: the bank reference equals an invoice number of the same customer
  -- and the amounts equal the invoice open balance to the fils.
  if a.kind='receipt' then
    select * into b from public.bank_lines where id=a.bank_line_id;
    select exists(select 1 from o2c_private.open_invoices(p_tenant,p_entity) i
      where i.customer_id=a.customer_id and i.number=b.reference and i.open=b.amount and i.dispute<>'open') into exact;
  else
    select * into r from public.receipts where id=a.receipt_id;
    select * into b from public.bank_lines where id=r.bank_line_id;
    select exists(select 1 from o2c_private.open_invoices(p_tenant,p_entity) i
      where i.id=a.invoice_id and i.number=b.reference and i.open=a.amount and i.dispute<>'open'
        and r.amount-coalesce((select sum(amount) from public.allocations where receipt_id=r.id),0)=a.amount) into exact;
  end if;
  if not exact then return jsonb_build_object('status','awaiting_approval','reason','Not an exact reference and amount match'); end if;
  update public.approvals set status='approved',checker_basis='policy',policy_id=p.id,version=version+1 where id=a.id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'proposal.auto_approved',a.id,
    jsonb_build_object('policy_id',p.id,'per_item_limit',p.per_item_limit::text,'daily_limit',p.daily_limit::text,'amount',a.amount::text,'agent_run_id',a.agent_run_id));
  journal:=o2c_private.post_approved(a.id);
  return jsonb_build_object('status','posted','journal_id',journal);
end $$;

create function public.propose_agent_policy(p_tenant uuid,p_entity uuid,p_id uuid,p_auto boolean,p_item_limit text,p_daily_limit text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity)<>'admin' then raise exception 'Forbidden'; end if;
  if p_auto is null or p_item_limit !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' or p_daily_limit !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$'
    or p_daily_limit::numeric<p_item_limit::numeric then raise exception 'Invalid policy limits'; end if;
  insert into public.agent_policies(id,tenant_id,entity_id,auto_execute,per_item_limit,daily_limit,maker)
    values(p_id,p_tenant,p_entity,p_auto,p_item_limit::numeric,p_daily_limit::numeric,auth.uid()) on conflict(id) do nothing;
  if not exists(select 1 from public.agent_policies where id=p_id and maker=auth.uid() and tenant_id=p_tenant and entity_id=p_entity
    and auto_execute=p_auto and per_item_limit=p_item_limit::numeric and daily_limit=p_daily_limit::numeric) then raise exception 'Idempotency key conflict'; end if;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent_policy.proposed',p_id,
    jsonb_build_object('auto_execute',p_auto,'per_item_limit',p_item_limit,'daily_limit',p_daily_limit));
  return p_id;
end $$;

create function public.decide_agent_policy(p_tenant uuid,p_entity uuid,p_id uuid,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.agent_policies;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if p_decision not in ('active','rejected') or p_decision is null then raise exception 'Invalid decision'; end if;
  select * into p from public.agent_policies where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or p.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if p.status=p_decision and p.checker=auth.uid() then return; end if;
  if p.status<>'pending' then raise exception 'Policy is not pending'; end if;
  if p_decision='active' then
    update public.agent_policies set status='superseded' where tenant_id=p_tenant and entity_id=p_entity and status='active';
  end if;
  update public.agent_policies set status=p_decision,checker=auth.uid(),decided_at=now() where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent_policy.'||p_decision,p_id,
    jsonb_build_object('auto_execute',p.auto_execute,'per_item_limit',p.per_item_limit::text,'daily_limit',p.daily_limit::text));
end $$;

create function public.set_agent_schedule(p_tenant uuid,p_entity uuid,p_kind text,p_cadence text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity)<>'admin' then raise exception 'Forbidden'; end if;
  if p_kind not in ('collections','cash_application','credit_risk','reporting') or p_cadence not in ('manual','daily') then raise exception 'Invalid schedule'; end if;
  insert into public.agent_schedules(tenant_id,entity_id,kind,cadence,updated_by) values(p_tenant,p_entity,p_kind,p_cadence,auth.uid())
    on conflict(tenant_id,entity_id,kind) do update set cadence=excluded.cadence,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent_schedule.set',p_entity,
    jsonb_build_object('kind',p_kind,'cadence',p_cadence));
end $$;

-- 8. Run lifecycle -------------------------------------------------------------------------
create function public.request_agent_run(p_tenant uuid,p_entity uuid,p_id uuid,p_kind text,p_as_of date) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.agent_runs;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','approver','admin') then raise exception 'Forbidden'; end if;
  if p_kind not in ('collections','cash_application','credit_risk','reporting') or p_as_of is null or not isfinite(p_as_of) then raise exception 'Invalid run'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into prior from public.agent_runs where id=p_id;
  if found then
    if prior.tenant_id=p_tenant and prior.entity_id=p_entity and prior.requested_by=auth.uid() and prior.kind=p_kind then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if (select count(*) from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and status in ('queued','running'))>=3 then raise exception 'Too many active runs'; end if;
  insert into public.agent_runs(id,tenant_id,entity_id,name,status,kind,trigger,requested_by,as_of)
    values(p_id,p_tenant,p_entity,initcap(replace(p_kind,'_',' '))||' agent','queued',p_kind,'manual',auth.uid(),p_as_of);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent.run.requested',p_id,jsonb_build_object('kind',p_kind,'as_of',p_as_of));
  return p_id;
end $$;

-- Called by the trusted server role (o2c_app) only. Mints a short-lived session for the
-- tenant's agent identity, bound to exactly one run.
create function o2c_private.claim_agent_run(p_run uuid,p_session_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs; agent uuid;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
  update public.agent_runs set status='failed',error='Run exceeded its time budget',finished_at=now(),updated_at=now()
    where status='running' and started_at<now()-interval '20 minutes';
  select * into run from public.agent_runs where id=p_run for update;
  if not found or run.status<>'queued' then return null; end if;
  select m.user_id into agent from public.memberships m join auth.users u on u.id=m.user_id
    where m.tenant_id=run.tenant_id and m.role='agent' and u.kind='agent' and not u.disabled limit 1;
  if agent is null then
    insert into auth.users(email,kind,email_confirmed_at,raw_user_meta_data)
      values('agent+'||run.tenant_id||'@agents.invalid','agent',now(),jsonb_build_object('full_name','O2C AI agent'))
      on conflict(email) do update set kind='agent' returning id into agent;
    insert into public.memberships(tenant_id,user_id,role) values(run.tenant_id,agent,'agent') on conflict do nothing;
  end if;
  insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values(p_session_hash,agent,'login','aal1',now()+interval '20 minutes');
  insert into o2c_private.agent_sessions(token_hash,run_id) values(p_session_hash,p_run);
  update public.agent_runs set status='running',agent_user=agent,started_at=now(),updated_at=now() where id=p_run;
  return jsonb_build_object('id',run.id,'tenant_id',run.tenant_id,'entity_id',run.entity_id,'kind',run.kind,'as_of',run.as_of,'trigger',run.trigger,'agent_user',agent);
end $$;

-- Daily schedule fan-out for the cron route. Returns queued scheduled runs for the date.
create function o2c_private.schedule_due_runs(p_as_of date) returns setof uuid
language plpgsql security definer set search_path='' as $$
begin
  if p_as_of is null or not isfinite(p_as_of) then raise exception 'Invalid date'; end if;
  insert into public.agent_runs(tenant_id,entity_id,name,status,kind,trigger,as_of)
    select s.tenant_id,s.entity_id,initcap(replace(s.kind,'_',' '))||' agent','queued',s.kind,'schedule',p_as_of
    from public.agent_schedules s where s.cadence='daily'
    on conflict do nothing;
  return query select id from public.agent_runs where trigger='schedule' and as_of=p_as_of and status='queued' order by created_at,id;
end $$;

create function o2c_private.require_run(p_tenant uuid,p_entity uuid,p_run uuid) returns public.agent_runs
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs;
begin
  if coalesce(public.member_role(p_tenant),'')<>'agent' or o2c_private.current_agent_run() is distinct from p_run then raise exception 'Forbidden'; end if;
  select * into run from public.agent_runs where id=p_run and tenant_id=p_tenant and entity_id=p_entity and agent_user=auth.uid() for update;
  if not found or run.status<>'running' then raise exception 'Run is not active'; end if;
  return run;
end $$;

create function public.agent_record_step(p_tenant uuid,p_entity uuid,p_run uuid,p_type text,p_tool text,p_detail jsonb,p_duration integer) returns integer
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs := o2c_private.require_run(p_tenant,p_entity,p_run); next_seq integer;
begin
  next_seq:=run.step_count+1;
  insert into public.agent_steps(run_id,seq,tenant_id,entity_id,type,tool,detail,duration_ms) values(p_run,next_seq,p_tenant,p_entity,p_type,p_tool,p_detail,p_duration);
  update public.agent_runs set step_count=next_seq,updated_at=now() where id=p_run;
  return next_seq;
end $$;

create function public.agent_finish_run(p_tenant uuid,p_entity uuid,p_run uuid,p_status text,p_summary text,p_model text,
  p_input_tokens integer,p_output_tokens integer,p_cache_read_tokens integer,p_cost text,p_error text) returns text
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs := o2c_private.require_run(p_tenant,p_entity,p_run); final text;
begin
  if p_status not in ('succeeded','failed') then raise exception 'Invalid status'; end if;
  if p_cost is not null and p_cost !~ '^[0-9]{1,6}(\.[0-9]{1,6})?$' then raise exception 'Invalid cost'; end if;
  final:=case when p_status='succeeded' and exists(select 1 from public.approvals where agent_run_id=p_run and status='pending') then 'awaiting_approval' else p_status end;
  update public.agent_runs set status=final,summary=left(p_summary,20000),model=left(p_model,100),input_tokens=greatest(coalesce(p_input_tokens,0),0),
    output_tokens=greatest(coalesce(p_output_tokens,0),0),cache_read_tokens=greatest(coalesce(p_cache_read_tokens,0),0),cost_usd=p_cost::numeric,
    error=left(p_error,2000),finished_at=now(),updated_at=now() where id=p_run;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent.run.'||final,p_run,
    jsonb_build_object('kind',run.kind,'model',p_model,'steps',run.step_count,'cost_usd',p_cost));
  -- The agent session ends with the run.
  delete from auth.sessions where token_hash=current_setting('o2c.session_hash',true);
  return final;
end $$;

-- 9. Read tools (members of the tenant, including the agent identity) ------------------
create function public.agent_ar_overview(p_tenant uuid,p_entity uuid,p_as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  with inv as (select * from o2c_private.open_invoices(p_tenant,p_entity)),
  rec as (select r.amount-coalesce((select sum(a.amount) from public.allocations a where a.receipt_id=r.id),0) as residual
    from public.receipts r where r.tenant_id=p_tenant and r.entity_id=p_entity)
  select jsonb_build_object(
    'as_of',p_as_of,'currency','AED',
    'open_ar',(select coalesce(sum(open),0)::text from inv),
    'overdue_ar',(select coalesce(sum(open),0)::text from inv where due_date<p_as_of and open>0),
    'disputed_ar',(select coalesce(sum(open),0)::text from inv where dispute='open' and open>0),
    'unapplied_cash',(select coalesce(sum(residual),0)::text from rec),
    'open_invoice_count',(select count(*) from inv where open>0),
    'customer_count',(select count(distinct customer_id) from inv where open>0),
    'unposted_bank_credits',(select count(*) from public.bank_lines b where b.tenant_id=p_tenant and b.entity_id=p_entity and b.direction='credit'
      and not exists(select 1 from public.receipts r where r.bank_line_id=b.id)),
    'pending_approvals',(select count(*) from public.approvals where tenant_id=p_tenant and entity_id=p_entity and status='pending'),
    'aging',(select jsonb_agg(jsonb_build_object('bucket',bucket,'amount',amount::text,'invoices',n) order by rank) from (
      select b.bucket,b.rank,coalesce(sum(i.open),0) as amount,count(i.id) as n from (values ('Current',0),('1-30',1),('31-60',2),('61-90',3),('91-180',4),('180+',5)) b(bucket,rank)
      left join inv i on i.open>0 and b.rank=case when i.due_date>=p_as_of then 0 when p_as_of-i.due_date<=30 then 1 when p_as_of-i.due_date<=60 then 2
        when p_as_of-i.due_date<=90 then 3 when p_as_of-i.due_date<=180 then 4 else 5 end group by b.bucket,b.rank) s),
    'top_debtors',coalesce((select jsonb_agg(row_to_json(t)::jsonb) from (
      select customer,account,sum(open)::text as open,sum(open) filter(where due_date<p_as_of)::text as overdue,min(due_date) filter(where open>0) as oldest_due,count(*) as invoices
      from inv where open>0 group by customer_id,customer,account order by sum(open) desc,customer limit 10) t),'[]'))
  into result;
  return result;
end $$;

create function public.agent_invoices(p_tenant uuid,p_entity uuid,p_as_of date,p_filter text,p_search text,p_limit integer,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_filter not in ('open','overdue','disputed','all') or p_limit not between 1 and 100 or p_offset not between 0 and 100000 then raise exception 'Invalid filter'; end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb),'[]') into result from (
    select id,number,customer,account,issued_at,due_date,gross::text,open::text,greatest(p_as_of-due_date,0) as days_overdue,dispute,collection,version
    from o2c_private.open_invoices(p_tenant,p_entity)
    where (p_filter='all' or (p_filter='open' and open>0) or (p_filter='overdue' and open>0 and due_date<p_as_of) or (p_filter='disputed' and dispute='open'))
      and (p_search is null or customer ilike '%'||p_search||'%' or account ilike '%'||p_search||'%' or number ilike '%'||p_search||'%')
    order by due_date,number limit p_limit offset p_offset) t;
  return result;
end $$;

-- Three-tier matching: exact (reference+amount), review (unique amount), exception.
create function public.agent_cash_candidates(p_tenant uuid,p_entity uuid,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_limit not between 1 and 100 then raise exception 'Invalid limit'; end if;
  with inv as (select * from o2c_private.open_invoices(p_tenant,p_entity) where open>0),
  credits as (select b.* from public.bank_lines b where b.tenant_id=p_tenant and b.entity_id=p_entity and b.direction='credit'
    and not exists(select 1 from public.receipts r where r.bank_line_id=b.id) order by b.booked_at,b.id limit p_limit),
  receipts as (select r.id,r.customer_id,r.version,b.reference,r.amount-coalesce((select sum(a.amount) from public.allocations a where a.receipt_id=r.id),0) as residual
    from public.receipts r join public.bank_lines b on b.id=r.bank_line_id where r.tenant_id=p_tenant and r.entity_id=p_entity)
  select jsonb_build_object(
    'bank_credits',coalesce((select jsonb_agg(jsonb_build_object('bank_line_id',c.id,'reference',c.reference,'booked_at',c.booked_at,'amount',c.amount::text,
      'tier',case when e.id is not null then 'exact' when u.n=1 then 'review' else 'exception' end,
      'confidence',case when e.id is not null then '0.99' when u.n=1 then '0.90' else null end,
      'invoice_id',coalesce(e.id,u.id),'invoice_number',coalesce(e.number,u.number),'customer_id',coalesce(e.customer_id,u.customer_id),'customer',coalesce(e.customer,u.customer),
      'basis',case when e.id is not null then 'Bank reference equals invoice number and amount equals open balance'
        when u.n=1 then 'Amount equals the open balance of exactly one invoice; reference differs' else 'No unambiguous invoice match' end) order by c.booked_at,c.id)
      from credits c
      left join lateral (select i.* from inv i where i.number=c.reference and i.open=c.amount and i.dispute<>'open' limit 1) e on true
      left join lateral (select count(*) over() as n,i.* from inv i where i.open=c.amount and i.dispute<>'open' limit 1) u on true),'[]'),
    'unapplied_receipts',coalesce((select jsonb_agg(jsonb_build_object('receipt_id',r.id,'reference',r.reference,'residual',r.residual::text,'customer_id',r.customer_id,
      'invoice_id',i.id,'invoice_number',i.number,'invoice_open',i.open::text,
      'tier',case when i.id is not null and i.number=r.reference and i.open=r.residual then 'exact' when i.id is not null then 'review' else 'exception' end))
      from (select * from receipts where residual>0 limit p_limit) r
      left join lateral (select * from inv i where i.customer_id=r.customer_id and i.dispute<>'open'
        order by (i.number=r.reference) desc,(i.open=r.residual) desc,i.due_date limit 1) i on true),'[]'))
  into result;
  return result;
end $$;

-- AR KPI pack: countback DSO, 30-day CEI, aging, concentration.
create function public.report_ar_pack(p_tenant uuid,p_entity uuid,p_as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare remaining numeric; dso numeric:=0; month_start date; period_end date; sales numeric; days integer; k integer;
  start_date date := p_as_of-29; begin_ar numeric; period_sales numeric; end_ar numeric; end_current numeric; cei numeric; denominator numeric;
  dso_text text; overview jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_as_of is null or not isfinite(p_as_of) then raise exception 'Invalid date'; end if;
  select coalesce(sum(open),0) into remaining from o2c_private.open_invoices(p_tenant,p_entity) where open>0;
  end_ar:=remaining;
  if remaining=0 then dso_text:='0.00';
  else
    for k in 0..23 loop
      month_start:=(date_trunc('month',p_as_of)-make_interval(months=>k))::date;
      period_end:=least(p_as_of,(month_start+interval '1 month'-interval '1 day')::date);
      days:=period_end-month_start+1;
      select coalesce(sum(gross),0) into sales from public.invoices where tenant_id=p_tenant and entity_id=p_entity and lifecycle='posted'
        and issued_at between month_start and period_end;
      if sales>=remaining then dso:=dso+remaining/sales*days; remaining:=0; exit;
      else dso:=dso+days; remaining:=remaining-sales; end if;
    end loop;
    dso_text:=case when remaining>0 then null else round(dso,2)::text end;
  end if;
  select coalesce(sum(gross),0) into begin_ar from public.invoices where tenant_id=p_tenant and entity_id=p_entity and lifecycle='posted' and issued_at<start_date;
  begin_ar:=begin_ar-coalesce((select sum(a.amount) from public.allocations a join public.invoices i on i.id=a.invoice_id
    where a.tenant_id=p_tenant and a.entity_id=p_entity and i.lifecycle='posted' and i.issued_at<start_date and (a.created_at at time zone 'Asia/Dubai')::date<start_date),0);
  select coalesce(sum(gross),0) into period_sales from public.invoices where tenant_id=p_tenant and entity_id=p_entity and lifecycle='posted' and issued_at between start_date and p_as_of;
  select coalesce(sum(open),0) into end_current from o2c_private.open_invoices(p_tenant,p_entity) where open>0 and due_date>=p_as_of;
  denominator:=begin_ar+period_sales-end_current;
  cei:=case when denominator>0 then round((begin_ar+period_sales-end_ar)/denominator*100,2) else null end;
  overview:=public.agent_ar_overview(p_tenant,p_entity,p_as_of);
  return overview||jsonb_build_object(
    'dso_countback_days',dso_text,
    'dso_basis','Countback over posted invoice gross by calendar month (24-month horizon); null when history is insufficient',
    'cei_30d_percent',cei::text,
    'cei_basis',jsonb_build_object('period_start',start_date,'period_end',p_as_of,'beginning_ar',begin_ar::text,'credit_sales',period_sales::text,
      'ending_ar',end_ar::text,'ending_current_ar',end_current::text));
end $$;

-- 10. Console reads ---------------------------------------------------------------------
create function public.agent_console(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  select jsonb_build_object(
    'agent_user',(select m.user_id from public.memberships m where m.tenant_id=p_tenant and m.role='agent' limit 1),
    'schedules',coalesce((select jsonb_object_agg(kind,cadence) from public.agent_schedules where tenant_id=p_tenant and entity_id=p_entity),'{}'),
    'policies',coalesce((select jsonb_agg(jsonb_build_object('id',id,'auto_execute',auto_execute,'per_item_limit',per_item_limit::text,'daily_limit',daily_limit::text,
      'status',status,'maker',maker,'checker',checker,'created_at',created_at,'decided_at',decided_at) order by created_at desc)
      from (select * from public.agent_policies where tenant_id=p_tenant and entity_id=p_entity and status in ('pending','active') order by created_at desc limit 10) p),'[]'),
    'auto_posted_today',(select coalesce(sum(amount),0)::text from public.approvals where tenant_id=p_tenant and entity_id=p_entity and checker_basis='policy'
      and status='posted' and (created_at at time zone 'Asia/Dubai')::date=o2c_private.dubai_today()),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'status',status,'trigger',trigger,'requested_by',requested_by,'as_of',as_of,
      'model',model,'input_tokens',input_tokens,'output_tokens',output_tokens,'cost_usd',cost_usd::text,'summary',summary,'error',error,'step_count',step_count,
      'created_at',created_at,'started_at',started_at,'finished_at',finished_at,
      'proposals',(select count(*) from public.approvals a where a.agent_run_id=r.id),
      'auto_posted',(select count(*) from public.approvals a where a.agent_run_id=r.id and a.checker_basis='policy' and a.status='posted')) order by created_at desc,id)
      from (select * from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and kind is not null order by created_at desc,id limit 30) r),'[]'))
  into result;
  return result;
end $$;

create function public.agent_run_detail(p_tenant uuid,p_entity uuid,p_run uuid,p_after integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  select jsonb_build_object('run',jsonb_build_object('id',r.id,'kind',r.kind,'status',r.status,'summary',r.summary,'error',r.error,'step_count',r.step_count,
      'model',r.model,'cost_usd',r.cost_usd::text,'input_tokens',r.input_tokens,'output_tokens',r.output_tokens,'started_at',r.started_at,'finished_at',r.finished_at),
    'steps',coalesce((select jsonb_agg(jsonb_build_object('seq',seq,'type',type,'tool',tool,'detail',detail,'duration_ms',duration_ms,'created_at',created_at) order by seq)
      from (select * from public.agent_steps s where s.run_id=r.id and s.seq>coalesce(p_after,0) order by seq limit 200) s),'[]'))
  into result from public.agent_runs r where r.id=p_run and r.tenant_id=p_tenant and r.entity_id=p_entity;
  if result is null then raise exception 'Run unavailable'; end if;
  return result;
end $$;

-- 11. Copilot persistence -----------------------------------------------------------------
create function public.copilot_append(p_tenant uuid,p_entity uuid,p_thread uuid,p_role text,p_content text,p_trace jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare t public.copilot_threads; next_seq integer;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if coalesce(public.member_role(p_tenant),'')='agent' then raise exception 'Forbidden'; end if;
  if p_role not in ('user','assistant') or p_content is null or length(p_content) not between 1 and 100000 then raise exception 'Invalid message'; end if;
  insert into public.copilot_threads(id,tenant_id,entity_id,user_id,title) values(p_thread,p_tenant,p_entity,auth.uid(),left(regexp_replace(p_content,'\s+',' ','g'),120))
    on conflict(id) do nothing;
  select * into t from public.copilot_threads where id=p_thread for update;
  if t.user_id<>auth.uid() or t.tenant_id<>p_tenant or t.entity_id<>p_entity then raise exception 'Forbidden'; end if;
  select coalesce(max(seq),0)+1 into next_seq from public.copilot_messages where thread_id=p_thread;
  insert into public.copilot_messages(thread_id,seq,role,content,trace) values(p_thread,next_seq,p_role,p_content,coalesce(p_trace,'[]'));
  update public.copilot_threads set updated_at=now() where id=p_thread;
  return next_seq;
end $$;

create function public.copilot_history(p_tenant uuid,p_entity uuid,p_thread uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return coalesce((select jsonb_agg(jsonb_build_object('seq',m.seq,'role',m.role,'content',m.content,'trace',m.trace,'created_at',m.created_at) order by m.seq)
    from (select * from public.copilot_messages m where m.thread_id=p_thread order by seq desc limit 40) m
    join public.copilot_threads t on t.id=m.thread_id where t.user_id=auth.uid() and t.tenant_id=p_tenant and t.entity_id=p_entity),'[]');
end $$;

create function public.copilot_threads_list(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'updated_at',updated_at) order by updated_at desc)
    from (select * from public.copilot_threads where user_id=auth.uid() and tenant_id=p_tenant and entity_id=p_entity order by updated_at desc limit 20) t),'[]');
end $$;

create function public.copilot_attach(p_tenant uuid,p_entity uuid,p_id uuid,p_name text,p_media_type text,p_content bytea) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if coalesce(public.member_role(p_tenant),'')='agent' then raise exception 'Forbidden'; end if;
  insert into public.copilot_files(id,tenant_id,entity_id,user_id,name,media_type,content,digest)
    values(p_id,p_tenant,p_entity,auth.uid(),p_name,p_media_type,p_content,encode(sha256(p_content),'hex'));
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'copilot.file.attached',p_id,
    jsonb_build_object('name',p_name,'media_type',p_media_type,'bytes',octet_length(p_content)));
  return p_id;
end $$;

create function public.copilot_file(p_tenant uuid,p_entity uuid,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare f public.copilot_files;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  select * into f from public.copilot_files where id=p_id and tenant_id=p_tenant and entity_id=p_entity and user_id=auth.uid();
  if not found then raise exception 'File unavailable'; end if;
  return jsonb_build_object('id',f.id,'name',f.name,'media_type',f.media_type,'content_base64',encode(f.content,'base64'));
end $$;

-- 12. Grants --------------------------------------------------------------------------------
revoke all on function o2c_private.claim_agent_run(uuid,text),o2c_private.schedule_due_runs(date),o2c_private.require_run(uuid,uuid,uuid) from public,anon,authenticated;
grant usage on schema o2c_private to o2c_app;
grant execute on function o2c_private.claim_agent_run(uuid,text),o2c_private.schedule_due_runs(date) to o2c_app;
revoke all on function public.agent_auto_post(uuid,uuid,uuid),public.propose_agent_policy(uuid,uuid,uuid,boolean,text,text),public.decide_agent_policy(uuid,uuid,uuid,text),
  public.set_agent_schedule(uuid,uuid,text,text),public.request_agent_run(uuid,uuid,uuid,text,date),
  public.agent_record_step(uuid,uuid,uuid,text,text,jsonb,integer),public.agent_finish_run(uuid,uuid,uuid,text,text,text,integer,integer,integer,text,text),
  public.agent_ar_overview(uuid,uuid,date),public.agent_invoices(uuid,uuid,date,text,text,integer,integer),public.agent_cash_candidates(uuid,uuid,integer),
  public.report_ar_pack(uuid,uuid,date),public.agent_console(uuid,uuid),public.agent_run_detail(uuid,uuid,uuid,integer),
  public.copilot_append(uuid,uuid,uuid,text,text,jsonb),public.copilot_history(uuid,uuid,uuid),public.copilot_threads_list(uuid,uuid),
  public.copilot_attach(uuid,uuid,uuid,text,text,bytea),public.copilot_file(uuid,uuid,uuid) from public,anon;
grant execute on function public.agent_auto_post(uuid,uuid,uuid),public.propose_agent_policy(uuid,uuid,uuid,boolean,text,text),public.decide_agent_policy(uuid,uuid,uuid,text),
  public.set_agent_schedule(uuid,uuid,text,text),public.request_agent_run(uuid,uuid,uuid,text,date),
  public.agent_record_step(uuid,uuid,uuid,text,text,jsonb,integer),public.agent_finish_run(uuid,uuid,uuid,text,text,text,integer,integer,integer,text,text),
  public.agent_ar_overview(uuid,uuid,date),public.agent_invoices(uuid,uuid,date,text,text,integer,integer),public.agent_cash_candidates(uuid,uuid,integer),
  public.report_ar_pack(uuid,uuid,date),public.agent_console(uuid,uuid),public.agent_run_detail(uuid,uuid,uuid,integer),
  public.copilot_append(uuid,uuid,uuid,text,text,jsonb),public.copilot_history(uuid,uuid,uuid),public.copilot_threads_list(uuid,uuid),
  public.copilot_attach(uuid,uuid,uuid,text,text,bytea),public.copilot_file(uuid,uuid,uuid) to authenticated;
commit;
