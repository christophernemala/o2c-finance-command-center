-- Collections and credit: customer contacts, an approved-before-send email outbox, payment promises,
-- maker/checker credit limits and asymmetric credit holds (an agent may place one; only a human releases it).
begin;

-- 1. Records ---------------------------------------------------------------------------------
create table public.customer_contacts (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  name text not null check(length(name) between 1 and 120),
  email text not null check(length(email) <= 254 and email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  role text not null default 'ar' check(role in ('ar','ap','finance','other')),
  is_primary boolean not null default false, archived boolean not null default false,
  created_by uuid not null references auth.users, created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index customer_contacts_one_primary on public.customer_contacts(customer_id) where is_primary and not archived;

create table public.collection_messages (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  contact_id uuid not null references public.customer_contacts, to_email text not null,
  tone text not null check(tone in ('reminder','firm','final_notice')),
  subject text not null check(length(subject) between 3 and 200), body text not null check(length(body) between 20 and 4000),
  invoice_ids uuid[] not null check(cardinality(invoice_ids) between 1 and 30),
  total_overdue numeric(15,2) not null check(total_overdue > 0), attach_statement boolean not null default false,
  status text not null default 'pending' check(status in ('pending','approved','rejected','sending','sent','failed')),
  maker uuid not null references auth.users, checker uuid references auth.users, agent_run_id uuid references public.agent_runs,
  attempts integer not null default 0 check(attempts between 0 and 10), provider_id text check(length(provider_id) <= 200),
  error text check(length(error) <= 1000), created_at timestamptz not null default now(), decided_at timestamptz,
  sending_at timestamptz, sent_at timestamptz,
  check(checker is null or checker <> maker),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create index collection_messages_outbox on public.collection_messages(status,decided_at) where status in ('approved','sending');
create index collection_messages_customer on public.collection_messages(customer_id,created_at desc);

create table public.payment_promises (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  invoice_id uuid references public.invoices, amount numeric(15,2) not null check(amount > 0), promised_date date not null,
  status text not null default 'open' check(status in ('open','kept','cancelled')),
  note text check(length(note) <= 500), created_by uuid not null references auth.users, created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);

create table public.credit_limits (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  credit_limit numeric(15,2) not null check(credit_limit >= 0), reason text not null check(length(reason) between 5 and 500),
  status text not null default 'pending' check(status in ('pending','active','rejected','superseded')),
  maker uuid not null references auth.users, checker uuid references auth.users,
  created_at timestamptz not null default now(), decided_at timestamptz, check(checker is null or checker <> maker),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index credit_limits_one_active on public.credit_limits(customer_id) where status='active';
create unique index credit_limits_one_pending on public.credit_limits(customer_id) where status='pending';

create table public.customer_holds (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  reason text not null check(length(reason) between 5 and 500),
  placed_by uuid not null references auth.users, placed_by_kind text not null check(placed_by_kind in ('agent','human')),
  agent_run_id uuid references public.agent_runs, placed_at timestamptz not null default now(),
  released_by uuid references auth.users, released_at timestamptz, release_reason text check(length(release_reason) <= 500),
  check((released_by is null) = (released_at is null)), check(released_by is null or released_by <> placed_by),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index customer_holds_one_open on public.customer_holds(customer_id) where released_at is null;

alter table public.customer_contacts enable row level security;
create policy scope_read on public.customer_contacts for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.collection_messages enable row level security;
create policy scope_read on public.collection_messages for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.payment_promises enable row level security;
create policy scope_read on public.payment_promises for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.credit_limits enable row level security;
create policy scope_read on public.credit_limits for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.customer_holds enable row level security;
create policy scope_read on public.customer_holds for select to authenticated using(public.member_role(tenant_id) is not null);
revoke all on public.customer_contacts,public.collection_messages,public.payment_promises,public.credit_limits,public.customer_holds from public,anon,authenticated;
grant select on public.customer_contacts,public.collection_messages,public.payment_promises,public.credit_limits,public.customer_holds to authenticated;

-- 2. Guardrail tool list gains the slice 2 agent tools ----------------------------------------
create or replace function o2c_private.check_guardrail(p_kind text,p_params jsonb) returns void language plpgsql immutable set search_path='' as $$
declare tools text[] := array['get_ar_overview','list_invoices','get_cash_match_candidates','get_ar_kpi_pack','propose_receipt',
  'propose_allocation','auto_post_if_policy_allows','record_finding','propose_collection_message','get_collections_worklist',
  'get_customer_account','place_credit_hold'];
begin
  if p_params is null or jsonb_typeof(p_params)<>'object' then raise exception 'Invalid guardrail'; end if;
  if p_kind='deny_tool' then
    if not (p_params->>'tool' = any(tools)) then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='max_amount' then
    if not (p_params->>'tool' = any(array['propose_receipt','propose_allocation']))
      or coalesce(p_params->>'limit','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='require_field' then
    if not (p_params->>'tool' = any(tools)) or coalesce(p_params->>'field','') !~ '^[a-z_]{1,40}$' then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='max_identical_calls' then
    if coalesce(p_params->>'limit','') !~ '^([1-9]|1[0-9]|20)$' then raise exception 'Invalid guardrail'; end if;
  else raise exception 'Invalid guardrail'; end if;
end $$;

-- 3. Contacts --------------------------------------------------------------------------------
create function public.add_customer_contact(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_name text,p_email text,p_role text,p_primary boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.customer_contacts;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  select * into prior from public.customer_contacts where id=p_id;
  if found then
    if prior.customer_id=p_customer and prior.email=lower(p_email) and prior.created_by=auth.uid() then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if coalesce(p_primary,false) then update public.customer_contacts set is_primary=false where customer_id=p_customer and is_primary; end if;
  insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,role,is_primary,created_by)
    values(p_id,p_tenant,p_entity,p_customer,p_name,lower(p_email),coalesce(p_role,'ar'),coalesce(p_primary,false),auth.uid());
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'contact.added',p_id,
    jsonb_build_object('customer_id',p_customer,'role',coalesce(p_role,'ar'),'primary',coalesce(p_primary,false)));
  return p_id;
end $$;

create function public.archive_customer_contact(p_tenant uuid,p_entity uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  update public.customer_contacts set archived=true,is_primary=false where id=p_id and tenant_id=p_tenant and entity_id=p_entity;
  if not found then raise exception 'Contact unavailable'; end if;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'contact.archived',p_id,'{}');
end $$;

-- 4. Outbox: propose, decide, then the trusted sender claims and completes ------------------------
create function public.propose_collection_message(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_contact uuid,p_tone text,
  p_subject text,p_body text,p_invoices uuid[],p_attach boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); c public.customer_contacts; total numeric(15,2); matched integer;
  prior public.collection_messages; run uuid := o2c_private.current_agent_run();
begin
  if role not in ('maker','admin','agent') then raise exception 'Forbidden'; end if;
  if role='agent' and run is null then raise exception 'Forbidden'; end if;
  if p_tone not in ('reminder','firm','final_notice') or p_invoices is null or cardinality(p_invoices) not between 1 and 30 then raise exception 'Invalid message'; end if;
  select * into prior from public.collection_messages where id=p_id;
  if found then
    if prior.customer_id=p_customer and prior.maker=auth.uid() and prior.subject=p_subject and prior.body=p_body then
      return jsonb_build_object('id',prior.id,'status',prior.status,'total_overdue',prior.total_overdue::text); end if;
    raise exception 'Idempotency key conflict';
  end if;
  -- A message needs a live contact of this customer; there is no free-text recipient.
  select * into c from public.customer_contacts where id=p_contact and customer_id=p_customer and tenant_id=p_tenant and entity_id=p_entity and not archived;
  if not found then raise exception 'Contact required: add an AR contact for this customer first'; end if;
  -- The total is recomputed from the ledger; the caller's figure is never trusted.
  select count(*),coalesce(sum(o.open),0) into matched,total from o2c_private.open_invoices(p_tenant,p_entity) o
    where o.id=any(p_invoices) and o.customer_id=p_customer and o.open>0 and o.due_date<o2c_private.dubai_today() and o.dispute<>'open';
  if matched<>cardinality(p_invoices) then raise exception 'Every invoice must be an overdue, undisputed open invoice of this customer'; end if;
  insert into public.collection_messages(id,tenant_id,entity_id,customer_id,contact_id,to_email,tone,subject,body,invoice_ids,total_overdue,attach_statement,maker,agent_run_id)
    values(p_id,p_tenant,p_entity,p_customer,p_contact,c.email,p_tone,p_subject,p_body,p_invoices,total,coalesce(p_attach,false),auth.uid(),run);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'collection_message.proposed',p_id,
    jsonb_build_object('customer_id',p_customer,'tone',p_tone,'total_overdue',total::text,'invoices',cardinality(p_invoices),'agent_run_id',run));
  return jsonb_build_object('id',p_id,'status','pending','total_overdue',total::text,'to',c.email);
end $$;

create function public.decide_collection_message(p_tenant uuid,p_entity uuid,p_id uuid,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.collection_messages;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into m from public.collection_messages where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or m.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if m.status=p_decision and m.checker=auth.uid() then return; end if;
  if m.status<>'pending' then raise exception 'Message is not pending'; end if;
  update public.collection_messages set status=p_decision,checker=auth.uid(),decided_at=now() where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'collection_message.'||p_decision,p_id,
    jsonb_build_object('to',m.to_email,'total_overdue',m.total_overdue::text));
end $$;

-- Trusted sender only (o2c_app). SKIP LOCKED plus approved -> sending means two senders never take one message.
create function o2c_private.claim_collection_messages(p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  update public.collection_messages set status='approved' where status='sending' and sending_at<now()-interval '15 minutes' and attempts<3;
  with claimed as (
    select id from public.collection_messages where status='approved' and attempts<3 order by decided_at,id
    for update skip locked limit greatest(1,least(coalesce(p_limit,10),25))
  ), updated as (
    update public.collection_messages m set status='sending',sending_at=now(),attempts=m.attempts+1 from claimed where m.id=claimed.id returning m.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'tenant_id',u.tenant_id,'entity_id',u.entity_id,'customer_id',u.customer_id,'to',u.to_email,
    'subject',u.subject,'body',u.body,'attach_statement',u.attach_statement,'attempts',u.attempts,'customer',c.name,'account',c.account)),'[]')
  into result from updated u join public.customers c on c.id=u.customer_id;
  return result;
end $$;

create function o2c_private.complete_collection_message(p_id uuid,p_ok boolean,p_provider_id text,p_error text) returns text
language plpgsql security definer set search_path='' as $$
declare m public.collection_messages; final text;
begin
  select * into m from public.collection_messages where id=p_id for update;
  if not found or m.status<>'sending' then raise exception 'Message is not sending'; end if;
  final:=case when p_ok then 'sent' when m.attempts<3 then 'approved' else 'failed' end;
  update public.collection_messages set status=final,provider_id=case when p_ok then left(p_provider_id,200) else provider_id end,
    error=case when p_ok then null else left(p_error,1000) end,sent_at=case when p_ok then now() else sent_at end where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(m.tenant_id,m.entity_id,m.checker,'collection_message.'||final,p_id,
    jsonb_build_object('attempt',m.attempts,'provider_id',p_provider_id,'error',left(p_error,300)));
  return final;
end $$;

-- 5. Promises, limits and holds ------------------------------------------------------------------
create function public.record_payment_promise(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_invoice uuid,p_amount text,p_date date,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' or p_amount::numeric<=0 or p_date is null or not isfinite(p_date) then raise exception 'Invalid promise'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity)
    or (p_invoice is not null and not exists(select 1 from public.invoices where id=p_invoice and customer_id=p_customer)) then raise exception 'Customer unavailable'; end if;
  insert into public.payment_promises(id,tenant_id,entity_id,customer_id,invoice_id,amount,promised_date,note,created_by)
    values(p_id,p_tenant,p_entity,p_customer,p_invoice,p_amount::numeric,p_date,p_note,auth.uid()) on conflict(id) do nothing;
  if not exists(select 1 from public.payment_promises where id=p_id and created_by=auth.uid() and customer_id=p_customer) then raise exception 'Idempotency key conflict'; end if;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'promise.recorded',p_id,
    jsonb_build_object('customer_id',p_customer,'amount',p_amount,'promised_date',p_date));
  return p_id;
end $$;

create function public.propose_credit_limit(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_limit text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_limit is null or p_limit !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' then raise exception 'Invalid decimal'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  insert into public.credit_limits(id,tenant_id,entity_id,customer_id,credit_limit,reason,maker) values(p_id,p_tenant,p_entity,p_customer,p_limit::numeric,p_reason,auth.uid())
    on conflict(id) do nothing;
  if not exists(select 1 from public.credit_limits where id=p_id and maker=auth.uid() and customer_id=p_customer and credit_limit=p_limit::numeric) then raise exception 'Idempotency key conflict'; end if;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_limit.proposed',p_id,
    jsonb_build_object('customer_id',p_customer,'limit',p_limit));
  return p_id;
end $$;

create function public.decide_credit_limit(p_tenant uuid,p_entity uuid,p_id uuid,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.credit_limits;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if p_decision is null or p_decision not in ('active','rejected') then raise exception 'Invalid decision'; end if;
  select * into l from public.credit_limits where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or l.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if l.status=p_decision and l.checker=auth.uid() then return; end if;
  if l.status<>'pending' then raise exception 'Limit is not pending'; end if;
  if p_decision='active' then update public.credit_limits set status='superseded' where customer_id=l.customer_id and status='active'; end if;
  update public.credit_limits set status=p_decision,checker=auth.uid(),decided_at=now() where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_limit.'||p_decision,p_id,
    jsonb_build_object('customer_id',l.customer_id,'limit',l.credit_limit::text));
end $$;

create function public.place_customer_hold(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); run uuid := o2c_private.current_agent_run(); prior public.customer_holds;
begin
  if role not in ('maker','approver','admin','agent') or (role='agent' and run is null) then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  select * into prior from public.customer_holds where customer_id=p_customer and released_at is null;
  if found then return prior.id; end if;
  insert into public.customer_holds(id,tenant_id,entity_id,customer_id,reason,placed_by,placed_by_kind,agent_run_id)
    values(p_id,p_tenant,p_entity,p_customer,p_reason,auth.uid(),case when role='agent' then 'agent' else 'human' end,run);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_hold.placed',p_id,
    jsonb_build_object('customer_id',p_customer,'by',case when role='agent' then 'agent' else 'human' end,'agent_run_id',run,'reason',p_reason));
  return p_id;
end $$;

-- Release is human-only: the agent role has no path here, and the placer cannot release their own hold.
create function public.release_customer_hold(p_tenant uuid,p_entity uuid,p_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare h public.customer_holds;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if (select kind from auth.users where id=auth.uid())<>'human' then raise exception 'Forbidden'; end if;
  if p_reason is null or length(p_reason)<5 then raise exception 'A release reason is required'; end if;
  select * into h from public.customer_holds where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or h.placed_by=auth.uid() then raise exception 'Independent checker required'; end if;
  if h.released_at is not null then return; end if;
  update public.customer_holds set released_by=auth.uid(),released_at=now(),release_reason=p_reason where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_hold.released',p_id,
    jsonb_build_object('customer_id',h.customer_id,'reason',p_reason));
end $$;

-- 6. Read models ---------------------------------------------------------------------------------
-- A promise is broken when its date has passed and it was neither kept nor cancelled.
create function public.collections_worklist(p_tenant uuid,p_entity uuid,p_as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_as_of is null or not isfinite(p_as_of) then raise exception 'Invalid date'; end if;
  return coalesce((select jsonb_agg(row_to_json(w)::jsonb order by w.overdue::numeric desc,w.customer) from (
    select c.id as customer_id,c.name as customer,c.account,
      coalesce(sum(o.open) filter (where o.due_date<p_as_of),0)::text as overdue,coalesce(sum(o.open),0)::text as open,
      count(*) filter (where o.due_date<p_as_of and o.open>0) as overdue_invoices,
      max(p_as_of-o.due_date) filter (where o.open>0 and o.due_date<p_as_of) as oldest_days,
      count(*) filter (where o.dispute='open' and o.open>0) as disputed_invoices,
      (select count(*) from public.payment_promises p where p.customer_id=c.id and p.status='open' and p.promised_date<p_as_of) as broken_promises,
      (select count(*) from public.payment_promises p where p.customer_id=c.id and p.status='open' and p.promised_date>=p_as_of) as open_promises,
      exists(select 1 from public.customer_holds h where h.customer_id=c.id and h.released_at is null) as on_hold,
      (select count(*) from public.customer_contacts k where k.customer_id=c.id and not k.archived) as contacts,
      (select l.credit_limit::text from public.credit_limits l where l.customer_id=c.id and l.status='active') as credit_limit,
      (select m.status from public.collection_messages m where m.customer_id=c.id order by m.created_at desc limit 1) as last_message
    from public.customers c join o2c_private.open_invoices(p_tenant,p_entity) o on o.customer_id=c.id
    where c.tenant_id=p_tenant and c.entity_id=p_entity and o.open>0
    group by c.id,c.name,c.account having coalesce(sum(o.open) filter (where o.due_date<p_as_of),0)>0) w),'[]');
end $$;

create function public.customer_account(p_tenant uuid,p_entity uuid,p_customer uuid,p_as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  select jsonb_build_object('customer',jsonb_build_object('id',c.id,'name',c.name,'account',c.account),
    'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'issued_at',o.issued_at,'due_date',o.due_date,'gross',o.gross::text,
      'open',o.open::text,'days_overdue',greatest(p_as_of-o.due_date,0),'dispute',o.dispute) order by o.due_date,o.number)
      from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0),'[]'),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'name',k.name,'email',k.email,'role',k.role,'is_primary',k.is_primary) order by k.is_primary desc,k.name)
      from public.customer_contacts k where k.customer_id=c.id and not k.archived),'[]'),
    'promises',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',p.invoice_id,'amount',p.amount::text,'promised_date',p.promised_date,
      'status',case when p.status='open' and p.promised_date<p_as_of then 'broken' else p.status end,'note',p.note) order by p.promised_date desc)
      from public.payment_promises p where p.customer_id=c.id),'[]'),
    'hold',(select jsonb_build_object('id',h.id,'reason',h.reason,'placed_by_kind',h.placed_by_kind,'placed_by',h.placed_by,'placed_at',h.placed_at)
      from public.customer_holds h where h.customer_id=c.id and h.released_at is null),
    'credit_limit',(select jsonb_build_object('id',l.id,'limit',l.credit_limit::text,'decided_at',l.decided_at) from public.credit_limits l where l.customer_id=c.id and l.status='active'),
    'pending_limit',(select jsonb_build_object('id',l.id,'limit',l.credit_limit::text,'reason',l.reason,'maker',l.maker) from public.credit_limits l where l.customer_id=c.id and l.status='pending'),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'tone',m.tone,'subject',m.subject,'body',m.body,'to',m.to_email,'total_overdue',m.total_overdue::text,
      'invoice_ids',m.invoice_ids,'attach_statement',m.attach_statement,'status',m.status,'maker',m.maker,'checker',m.checker,'agent_run_id',m.agent_run_id,
      'error',m.error,'created_at',m.created_at,'sent_at',m.sent_at) order by m.created_at desc) from (select * from public.collection_messages where customer_id=c.id order by created_at desc limit 20) m),'[]'))
  into result from public.customers c where c.id=p_customer and c.tenant_id=p_tenant and c.entity_id=p_entity;
  if result is null then raise exception 'Customer unavailable'; end if;
  return result;
end $$;

-- Open-items statement for a customer: every open posted invoice with what was paid against it.
create function o2c_private.statement_data(p_tenant uuid,p_entity uuid,p_customer uuid,p_as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  return (select jsonb_build_object('as_of',p_as_of,'entity',e.name,'customer',c.name,'account',c.account,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('number',o.number,'issued_at',o.issued_at,'due_date',o.due_date,'gross',o.gross::text,
      'paid',(o.gross-o.open)::text,'open',o.open::text,'days_overdue',greatest(p_as_of-o.due_date,0)) order by o.due_date,o.number)
      from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0),'[]'),
    'total_open',(select coalesce(sum(o.open),0)::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0),
    'total_overdue',(select coalesce(sum(o.open),0)::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0 and o.due_date<p_as_of))
    from public.customers c join public.entities e on e.tenant_id=c.tenant_id and e.id=c.entity_id
    where c.id=p_customer and c.tenant_id=p_tenant and c.entity_id=p_entity);
end $$;

create function public.customer_statement(p_tenant uuid,p_entity uuid,p_customer uuid,p_as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_as_of is null or not isfinite(p_as_of) then raise exception 'Invalid date'; end if;
  result:=o2c_private.statement_data(p_tenant,p_entity,p_customer,p_as_of);
  if result is null then raise exception 'Customer unavailable'; end if;
  return result;
end $$;

-- The sender builds the attached statement from the ledger at send time (trusted server role only).
create function o2c_private.message_statement(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select o2c_private.statement_data(m.tenant_id,m.entity_id,m.customer_id,o2c_private.dubai_today()) from public.collection_messages m where m.id=p_id and m.status='sending'
$$;

-- 7. Grants ----------------------------------------------------------------------------------------
revoke all on function o2c_private.claim_collection_messages(integer),o2c_private.complete_collection_message(uuid,boolean,text,text),
  o2c_private.statement_data(uuid,uuid,uuid,date),o2c_private.message_statement(uuid) from public,anon,authenticated;
grant execute on function o2c_private.claim_collection_messages(integer),o2c_private.complete_collection_message(uuid,boolean,text,text),o2c_private.message_statement(uuid) to o2c_app;
revoke all on function public.add_customer_contact(uuid,uuid,uuid,uuid,text,text,text,boolean),public.archive_customer_contact(uuid,uuid,uuid),
  public.propose_collection_message(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[],boolean),public.decide_collection_message(uuid,uuid,uuid,text),
  public.record_payment_promise(uuid,uuid,uuid,uuid,uuid,text,date,text),public.propose_credit_limit(uuid,uuid,uuid,uuid,text,text),
  public.decide_credit_limit(uuid,uuid,uuid,text),public.place_customer_hold(uuid,uuid,uuid,uuid,text),public.release_customer_hold(uuid,uuid,uuid,text),
  public.collections_worklist(uuid,uuid,date),public.customer_account(uuid,uuid,uuid,date),public.customer_statement(uuid,uuid,uuid,date) from public,anon;
grant execute on function public.add_customer_contact(uuid,uuid,uuid,uuid,text,text,text,boolean),public.archive_customer_contact(uuid,uuid,uuid),
  public.propose_collection_message(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[],boolean),public.decide_collection_message(uuid,uuid,uuid,text),
  public.record_payment_promise(uuid,uuid,uuid,uuid,uuid,text,date,text),public.propose_credit_limit(uuid,uuid,uuid,uuid,text,text),
  public.decide_credit_limit(uuid,uuid,uuid,text),public.place_customer_hold(uuid,uuid,uuid,uuid,text),public.release_customer_hold(uuid,uuid,uuid,text),
  public.collections_worklist(uuid,uuid,date),public.customer_account(uuid,uuid,uuid,date),public.customer_statement(uuid,uuid,uuid,date) to authenticated;
commit;
