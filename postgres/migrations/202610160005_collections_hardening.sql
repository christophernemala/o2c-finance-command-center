-- Collections hardening from review: approved emails are re-checked against the ledger before they
-- are approved and again before they are sent; one open message per customer; Block-stage deny rules
-- also stop the agent's message and credit-hold routines on direct RPC; outbox completion is tied to
-- the claimed attempt; the attached statement lists only the approved invoices; promises are settled
-- from the ledger or resolved by a person, so a kept promise is never counted as broken.
begin;

-- 1. Guardrails on the agent's own write routines --------------------------------------------------
create function o2c_private.assert_agent_tool_allowed(p_tenant uuid,p_entity uuid,p_run uuid,p_tool text) returns void
language plpgsql stable security definer set search_path='' as $$
declare agent_kind text; rule record;
begin
  select kind into agent_kind from public.agent_runs where id=p_run and tenant_id=p_tenant and entity_id=p_entity;
  if not found then raise exception 'Forbidden'; end if;
  for rule in select * from o2c_private.active_guardrails(p_tenant,p_entity,agent_kind) where stage='block' and kind='deny_tool' and params->>'tool'=p_tool loop
    raise exception 'Blocked by guardrail: %', rule.name;
  end loop;
end $$;

-- 2. A message's evidence is current while every invoice is still overdue, undisputed and open for the
-- same total, and its contact is still on file.
create function o2c_private.message_evidence_current(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m public.collection_messages; matched integer; total numeric(15,2);
begin
  select * into m from public.collection_messages where id=p_id;
  if not found or not exists(select 1 from public.customer_contacts k where k.id=m.contact_id and not k.archived) then return false; end if;
  select count(*),coalesce(sum(o.open),0) into matched,total from o2c_private.open_invoices(m.tenant_id,m.entity_id) o
    where o.id=any(m.invoice_ids) and o.customer_id=m.customer_id and o.open>0 and o.due_date<o2c_private.dubai_today() and o.dispute<>'open';
  return matched=cardinality(m.invoice_ids) and total=m.total_overdue;
end $$;

create unique index collection_messages_one_open on public.collection_messages(customer_id) where status in ('pending','approved','sending');

create or replace function public.propose_collection_message(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_contact uuid,p_tone text,
  p_subject text,p_body text,p_invoices uuid[],p_attach boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); c public.customer_contacts; total numeric(15,2); matched integer;
  prior public.collection_messages; run uuid := o2c_private.current_agent_run();
begin
  if role not in ('maker','admin','agent') then raise exception 'Forbidden'; end if;
  if role='agent' and run is null then raise exception 'Forbidden'; end if;
  if role='agent' then perform o2c_private.assert_agent_tool_allowed(p_tenant,p_entity,run,'propose_collection_message'); end if;
  if p_tone not in ('reminder','firm','final_notice') or p_invoices is null or cardinality(p_invoices) not between 1 and 30 then raise exception 'Invalid message'; end if;
  select * into prior from public.collection_messages where id=p_id;
  if found then
    if prior.customer_id=p_customer and prior.maker=auth.uid() and prior.subject=p_subject and prior.body=p_body then
      return jsonb_build_object('id',prior.id,'status',prior.status,'total_overdue',prior.total_overdue::text); end if;
    raise exception 'Idempotency key conflict';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer::text,1));
  if exists(select 1 from public.collection_messages where customer_id=p_customer and status in ('pending','approved','sending')) then
    raise exception 'This customer already has a message awaiting approval or sending'; end if;
  select * into c from public.customer_contacts where id=p_contact and customer_id=p_customer and tenant_id=p_tenant and entity_id=p_entity and not archived;
  if not found then raise exception 'Contact required: add an AR contact for this customer first'; end if;
  select count(*),coalesce(sum(o.open),0) into matched,total from o2c_private.open_invoices(p_tenant,p_entity) o
    where o.id=any(p_invoices) and o.customer_id=p_customer and o.open>0 and o.due_date<o2c_private.dubai_today() and o.dispute<>'open';
  if matched<>cardinality(p_invoices) then raise exception 'Every invoice must be an overdue, undisputed open invoice of this customer'; end if;
  insert into public.collection_messages(id,tenant_id,entity_id,customer_id,contact_id,to_email,tone,subject,body,invoice_ids,total_overdue,attach_statement,maker,agent_run_id)
    values(p_id,p_tenant,p_entity,p_customer,p_contact,c.email,p_tone,p_subject,p_body,p_invoices,total,coalesce(p_attach,false),auth.uid(),run);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'collection_message.proposed',p_id,
    jsonb_build_object('customer_id',p_customer,'tone',p_tone,'total_overdue',total::text,'invoices',cardinality(p_invoices),'agent_run_id',run));
  return jsonb_build_object('id',p_id,'status','pending','total_overdue',total::text,'to',c.email);
end $$;

create or replace function public.decide_collection_message(p_tenant uuid,p_entity uuid,p_id uuid,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.collection_messages;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into m from public.collection_messages where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or m.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if m.status=p_decision and m.checker=auth.uid() then return; end if;
  if m.status<>'pending' then raise exception 'Message is not pending'; end if;
  -- The checker approves what the ledger says now, not what it said when the message was drafted.
  if p_decision='approved' and not o2c_private.message_evidence_current(p_id) then
    raise exception 'Stale evidence: an invoice was paid, disputed or changed, or the contact was removed. Reject this message and propose a new one'; end if;
  update public.collection_messages set status=p_decision,checker=auth.uid(),decided_at=now() where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'collection_message.'||p_decision,p_id,
    jsonb_build_object('to',m.to_email,'total_overdue',m.total_overdue::text));
end $$;

-- Removing a contact withdraws what was queued for that address.
create or replace function public.archive_customer_contact(p_tenant uuid,p_entity uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  update public.customer_contacts set archived=true,is_primary=false where id=p_id and tenant_id=p_tenant and entity_id=p_entity;
  if not found then raise exception 'Contact unavailable'; end if;
  update public.collection_messages set status=case when status='pending' then 'rejected' else 'failed' end,error='Contact removed before sending'
    where contact_id=p_id and status in ('pending','approved');
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'contact.archived',p_id,'{}');
end $$;

-- 3. Outbox: stale and stuck messages fail; completion must match the claimed attempt -------------------
create or replace function o2c_private.claim_collection_messages(p_limit integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; stale record;
begin
  update public.collection_messages set status=case when attempts<3 then 'approved' else 'failed' end,
    error=case when attempts<3 then error else 'Sender stopped during the final attempt' end
    where status='sending' and sending_at<now()-interval '15 minutes';
  for stale in select id,tenant_id,entity_id,checker from public.collection_messages where status='approved' and attempts<3 for update skip locked loop
    if not o2c_private.message_evidence_current(stale.id) then
      update public.collection_messages set status='failed',error='Stale evidence at send time: an invoice was paid, disputed or changed, or the contact was removed' where id=stale.id;
      insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(stale.tenant_id,stale.entity_id,stale.checker,'collection_message.failed',stale.id,
        jsonb_build_object('error','stale evidence'));
    end if;
  end loop;
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

drop function o2c_private.complete_collection_message(uuid,boolean,text,text);
create function o2c_private.complete_collection_message(p_id uuid,p_attempt integer,p_ok boolean,p_provider_id text,p_error text) returns text
language plpgsql security definer set search_path='' as $$
declare m public.collection_messages; final text;
begin
  select * into m from public.collection_messages where id=p_id for update;
  -- A late worker whose attempt was reclaimed must not overwrite the newer attempt.
  if not found or m.status<>'sending' or m.attempts<>p_attempt then raise exception 'Message is not sending'; end if;
  final:=case when p_ok then 'sent' when m.attempts<3 then 'approved' else 'failed' end;
  update public.collection_messages set status=final,provider_id=case when p_ok then left(p_provider_id,200) else provider_id end,
    error=case when p_ok then null else left(p_error,1000) end,sent_at=case when p_ok then now() else sent_at end where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(m.tenant_id,m.entity_id,m.checker,'collection_message.'||final,p_id,
    jsonb_build_object('attempt',m.attempts,'provider_id',p_provider_id,'error',left(p_error,300)));
  return final;
end $$;

-- 4. The attached statement lists exactly the invoices the checker approved ----------------------------
create function o2c_private.statement_data(p_tenant uuid,p_entity uuid,p_customer uuid,p_as_of date,p_invoices uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  return (select jsonb_build_object('as_of',p_as_of,'entity',e.name,'customer',c.name,'account',c.account,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('number',o.number,'issued_at',o.issued_at,'due_date',o.due_date,'gross',o.gross::text,
      'paid',(o.gross-o.open)::text,'open',o.open::text,'days_overdue',greatest(p_as_of-o.due_date,0)) order by o.due_date,o.number)
      from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0 and (p_invoices is null or o.id=any(p_invoices))),'[]'),
    'total_open',(select coalesce(sum(o.open),0)::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0 and (p_invoices is null or o.id=any(p_invoices))),
    'total_overdue',(select coalesce(sum(o.open),0)::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0 and o.due_date<p_as_of
      and (p_invoices is null or o.id=any(p_invoices))))
    from public.customers c join public.entities e on e.tenant_id=c.tenant_id and e.id=c.entity_id
    where c.id=p_customer and c.tenant_id=p_tenant and c.entity_id=p_entity);
end $$;
create or replace function o2c_private.message_statement(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select o2c_private.statement_data(m.tenant_id,m.entity_id,m.customer_id,o2c_private.dubai_today(),m.invoice_ids) from public.collection_messages m where m.id=p_id and m.status='sending'
$$;

-- 5. Promises: kept from the ledger, broken only while still unpaid, or resolved by a person -----------
-- An invoice promise is kept once that invoice is fully paid and void if the invoice was voided; an account
-- promise is kept once nothing is overdue. Otherwise it is broken after its date.
create function o2c_private.promise_state(p_tenant uuid,p_entity uuid,p_customer uuid,p_invoice uuid,p_status text,p_date date,p_as_of date) returns text
language sql stable security definer set search_path='' as $$
  select case when p_status<>'open' then p_status
    when p_invoice is not null and not exists(select 1 from o2c_private.open_invoices(p_tenant,p_entity) o where o.id=p_invoice) then 'cancelled'
    when p_invoice is not null and exists(select 1 from o2c_private.open_invoices(p_tenant,p_entity) o where o.id=p_invoice and o.open<=0) then 'kept'
    when p_invoice is null and not exists(select 1 from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=p_customer and o.open>0 and o.due_date<p_as_of) then 'kept'
    when p_date<p_as_of then 'broken' else 'open' end
$$;

create function public.resolve_payment_promise(p_tenant uuid,p_entity uuid,p_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payment_promises;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','approver','admin') then raise exception 'Forbidden'; end if;
  if p_status is null or p_status not in ('kept','cancelled') or p_reason is null or length(p_reason) not between 5 and 500 then raise exception 'Invalid resolution'; end if;
  select * into p from public.payment_promises where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found then raise exception 'Promise unavailable'; end if;
  if p.status=p_status then return; end if;
  if p.status<>'open' then raise exception 'Promise is already resolved'; end if;
  update public.payment_promises set status=p_status where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'promise.'||p_status,p_id,
    jsonb_build_object('customer_id',p.customer_id,'amount',p.amount::text,'reason',p_reason));
end $$;

-- Replays return without a second audit event; a different amount or date is a key conflict.
create or replace function public.record_payment_promise(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_invoice uuid,p_amount text,p_date date,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.payment_promises;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' or p_amount::numeric<=0 or p_date is null or not isfinite(p_date) then raise exception 'Invalid promise'; end if;
  select * into prior from public.payment_promises where id=p_id;
  if found then
    if prior.created_by=auth.uid() and prior.customer_id=p_customer and prior.amount=p_amount::numeric and prior.promised_date=p_date
      and prior.invoice_id is not distinct from p_invoice then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity)
    or (p_invoice is not null and not exists(select 1 from public.invoices where id=p_invoice and customer_id=p_customer)) then raise exception 'Customer unavailable'; end if;
  insert into public.payment_promises(id,tenant_id,entity_id,customer_id,invoice_id,amount,promised_date,note,created_by)
    values(p_id,p_tenant,p_entity,p_customer,p_invoice,p_amount::numeric,p_date,p_note,auth.uid());
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'promise.recorded',p_id,
    jsonb_build_object('customer_id',p_customer,'amount',p_amount,'promised_date',p_date));
  return p_id;
end $$;

create or replace function public.propose_credit_limit(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_limit text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.credit_limits;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_limit is null or p_limit !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' then raise exception 'Invalid decimal'; end if;
  select * into prior from public.credit_limits where id=p_id;
  if found then
    if prior.maker=auth.uid() and prior.customer_id=p_customer and prior.credit_limit=p_limit::numeric then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  insert into public.credit_limits(id,tenant_id,entity_id,customer_id,credit_limit,reason,maker) values(p_id,p_tenant,p_entity,p_customer,p_limit::numeric,p_reason,auth.uid());
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_limit.proposed',p_id,
    jsonb_build_object('customer_id',p_customer,'limit',p_limit));
  return p_id;
end $$;

create or replace function public.place_customer_hold(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); run uuid := o2c_private.current_agent_run(); prior public.customer_holds;
begin
  if role not in ('maker','approver','admin','agent') or (role='agent' and run is null) then raise exception 'Forbidden'; end if;
  if role='agent' then perform o2c_private.assert_agent_tool_allowed(p_tenant,p_entity,run,'place_credit_hold'); end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  select * into prior from public.customer_holds where customer_id=p_customer and released_at is null;
  if found then return prior.id; end if;
  insert into public.customer_holds(id,tenant_id,entity_id,customer_id,reason,placed_by,placed_by_kind,agent_run_id)
    values(p_id,p_tenant,p_entity,p_customer,p_reason,auth.uid(),case when role='agent' then 'agent' else 'human' end,run);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_hold.placed',p_id,
    jsonb_build_object('customer_id',p_customer,'by',case when role='agent' then 'agent' else 'human' end,'agent_run_id',run,'reason',p_reason));
  return p_id;
end $$;

-- Read models: promise status comes from promise_state, so the worklist, the account and the agent agree.
create or replace function public.collections_worklist(p_tenant uuid,p_entity uuid,p_as_of date) returns jsonb
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
      (select count(*) from public.payment_promises p where p.customer_id=c.id
        and o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of)='broken') as broken_promises,
      (select count(*) from public.payment_promises p where p.customer_id=c.id
        and o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of)='open') as open_promises,
      exists(select 1 from public.customer_holds h where h.customer_id=c.id and h.released_at is null) as on_hold,
      (select count(*) from public.customer_contacts k where k.customer_id=c.id and not k.archived) as contacts,
      (select l.credit_limit::text from public.credit_limits l where l.customer_id=c.id and l.status='active') as credit_limit,
      (select m.status from public.collection_messages m where m.customer_id=c.id order by m.created_at desc limit 1) as last_message
    from public.customers c join o2c_private.open_invoices(p_tenant,p_entity) o on o.customer_id=c.id
    where c.tenant_id=p_tenant and c.entity_id=p_entity and o.open>0
    group by c.id,c.name,c.account having coalesce(sum(o.open) filter (where o.due_date<p_as_of),0)>0) w),'[]');
end $$;

create or replace function public.customer_account(p_tenant uuid,p_entity uuid,p_customer uuid,p_as_of date) returns jsonb
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
      'status',o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of),'resolvable',p.status='open','note',p.note) order by p.promised_date desc)
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

-- 6. Grants ------------------------------------------------------------------------------------------
revoke all on function o2c_private.assert_agent_tool_allowed(uuid,uuid,uuid,text),o2c_private.message_evidence_current(uuid),
  o2c_private.complete_collection_message(uuid,integer,boolean,text,text),o2c_private.statement_data(uuid,uuid,uuid,date,uuid[]),
  o2c_private.promise_state(uuid,uuid,uuid,uuid,text,date,date) from public,anon,authenticated;
grant execute on function o2c_private.complete_collection_message(uuid,integer,boolean,text,text) to o2c_app;
revoke all on function public.resolve_payment_promise(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.resolve_payment_promise(uuid,uuid,uuid,text,text) to authenticated;
commit;
