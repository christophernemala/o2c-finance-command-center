-- Review hardening (PR #6 automated review, 2026-11-04):
-- 1. An agent session is bound to one run, so it may act only in that run's entity. require_scope and
--    propose_action (which checks membership directly) now refuse any other entity.
-- 2. claim_agent_run no longer revives a disabled agent identity or converts an existing human account
--    with the agent address; the claim fails closed instead.
-- 3. Runs that were queued but never started (a cron batch out of time, a manual run whose start
--    failed) are expired after an hour with a reason, instead of staying queued and holding the
--    active-run cap; the cron batch marks the runs it had no time for at once.
-- 4. An account promise is judged only on invoices issued on or before the day it was recorded, so an
--    invoice issued later cannot turn a kept promise broken.
begin;

-- 1. Agent sessions are entity-bound ----------------------------------------------------------------
create or replace function o2c_private.require_scope(p_tenant uuid,p_entity uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare r text := public.member_role(p_tenant);
begin
  if auth.uid() is null or r is null or not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  if r='agent' and not exists(select 1 from public.agent_runs where id=o2c_private.current_agent_run() and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Forbidden'; end if;
  return r;
end $$;

create or replace function public.propose_action(p_tenant uuid,p_entity uuid,p_id uuid,p_kind text,p_amount text,p_evidence text,
  p_invoice uuid default null,p_receipt uuid default null,p_bank uuid default null,p_customer uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.invoices; r public.receipts; b public.bank_lines; prior public.approvals; value numeric(15,2); run uuid := o2c_private.current_agent_run();
begin
  if coalesce(public.member_role(p_tenant),'') not in ('maker','admin','agent') then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  if public.member_role(p_tenant)='agent' and not exists(select 1 from public.agent_runs where id=run and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Forbidden'; end if;
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

-- 2 and 3. Claiming fails closed; stale queued runs expire ------------------------------------------
create function o2c_private.expire_stale_runs() returns void
language sql security definer set search_path='' as $$
  update public.agent_runs set status='failed',error='Not started in time; request the run again',finished_at=now(),updated_at=now()
    where status='queued' and created_at<now()-interval '1 hour'
$$;

create or replace function o2c_private.claim_agent_run(p_run uuid,p_session_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs; agent uuid;
begin
  if p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
  update public.agent_runs set status='failed',error='Run exceeded its time budget',finished_at=now(),updated_at=now()
    where status='running' and started_at<now()-interval '20 minutes';
  perform o2c_private.expire_stale_runs();
  select * into run from public.agent_runs where id=p_run for update;
  if not found or run.status<>'queued' then return null; end if;
  select m.user_id into agent from public.memberships m join auth.users u on u.id=m.user_id
    where m.tenant_id=run.tenant_id and m.role='agent' and u.kind='agent' and not u.disabled limit 1;
  if agent is null then
    -- Never revive a disabled agent identity or take over a non-agent account with this address.
    insert into auth.users(email,kind,email_confirmed_at,raw_user_meta_data)
      values('agent+'||run.tenant_id||'@agents.invalid','agent',now(),jsonb_build_object('full_name','O2C AI agent'))
      on conflict(email) do update set kind='agent' where auth.users.kind='agent' and not auth.users.disabled returning id into agent;
    if agent is null then
      update public.agent_runs set status='failed',error='The agent identity for this workspace is disabled',finished_at=now(),updated_at=now() where id=p_run;
      return null;
    end if;
    insert into public.memberships(tenant_id,user_id,role) values(run.tenant_id,agent,'agent') on conflict do nothing;
  end if;
  insert into auth.sessions(token_hash,user_id,purpose,aal,expires_at) values(p_session_hash,agent,'login','aal1',now()+interval '20 minutes');
  insert into o2c_private.agent_sessions(token_hash,run_id) values(p_session_hash,p_run);
  update public.agent_runs set status='running',agent_user=agent,started_at=now(),updated_at=now() where id=p_run;
  return jsonb_build_object('id',run.id,'tenant_id',run.tenant_id,'entity_id',run.entity_id,'kind',run.kind,'as_of',run.as_of,'trigger',run.trigger,'agent_user',agent);
end $$;

create or replace function o2c_private.schedule_due_runs(p_as_of date) returns setof uuid
language plpgsql security definer set search_path='' as $$
begin
  if p_as_of is null or not isfinite(p_as_of) then raise exception 'Invalid date'; end if;
  perform o2c_private.expire_stale_runs();
  insert into public.agent_runs(tenant_id,entity_id,name,status,kind,trigger,as_of)
    select s.tenant_id,s.entity_id,initcap(replace(s.kind,'_',' '))||' agent','queued',s.kind,'schedule',p_as_of
    from public.agent_schedules s where s.cadence='daily'
    on conflict do nothing;
  return query select id from public.agent_runs where trigger='schedule' and as_of=p_as_of and status='queued' order by created_at,id;
end $$;

-- The cron batch marks the runs it had no time for, so they are visible and free the active-run cap.
create function o2c_private.skip_agent_runs(p_runs uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  update public.agent_runs set status='failed',error='Skipped: the scheduled batch ran out of time; request the run again',finished_at=now(),updated_at=now()
    where id=any(p_runs) and status='queued';
  get diagnostics n=row_count; return n;
end $$;

revoke all on function o2c_private.expire_stale_runs(),o2c_private.skip_agent_runs(uuid[]) from public,anon,authenticated;
grant execute on function o2c_private.skip_agent_runs(uuid[]) to o2c_app;

-- 4. Account promises ignore invoices issued after they were recorded --------------------------------
create or replace function o2c_private.promise_state(p_tenant uuid,p_entity uuid,p_customer uuid,p_invoice uuid,p_status text,p_date date,p_as_of date,p_since timestamptz) returns text
language plpgsql stable security definer set search_path='' as $$
declare scope uuid[]; still_open boolean; cash numeric;
begin
  if p_status<>'open' then return p_status; end if;
  if p_invoice is not null then
    select array_agg(o.id),bool_or(o.open>0) into scope,still_open from o2c_private.open_invoices(p_tenant,p_entity) o where o.id=p_invoice;
    if scope is null then return 'cancelled'; end if;
  else
    select array_agg(o.id),coalesce(bool_or(o.open>0),false) into scope,still_open from o2c_private.open_invoices(p_tenant,p_entity) o
      where o.customer_id=p_customer and o.due_date<=p_date and o.issued_at<=(p_since at time zone 'Asia/Dubai')::date
        and o.gross-coalesce((select sum(a.amount) from public.allocations a where a.invoice_id=o.id and a.created_at<p_since),0)>0;
    if scope is null then return 'kept'; end if;
  end if;
  if still_open then return case when p_date<p_as_of then 'broken' else 'open' end; end if;
  select coalesce(sum(a.amount),0) into cash from public.allocations a where a.invoice_id=any(scope) and a.receipt_id is not null and a.created_at>=p_since;
  return case when cash>0 then 'kept' else 'cancelled' end;
end $$;

-- 5-10. Replays compare the whole payload; guardrails need a tool; DSO uses invoice sales; the console
-- always includes the active policy; "unassigned" is reserved in any case.
create or replace function public.propose_adjustment_note(p_tenant uuid,p_entity uuid,p_id uuid,p_kind text,p_customer uuid,p_invoice uuid,
  p_amount text,p_reason text,p_memo text,p_reference text,p_due date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); run uuid := o2c_private.current_agent_run();
  prior public.adjustment_notes; inv record; inv_version integer; value numeric(15,2);
begin
  if role not in ('maker','admin','agent') or (role='agent' and run is null) then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' or p_amount::numeric<=0 then raise exception 'Invalid amount'; end if;
  value:=p_amount::numeric;
  if p_kind is null or p_kind not in ('credit','debit') then raise exception 'Invalid note'; end if;
  -- The agent may only propose small-difference credit notes; it never proposes debit notes.
  if role='agent' then
    if p_kind<>'credit' or p_reason not in ('short_payment','bank_charges') then raise exception 'Forbidden'; end if;
    perform o2c_private.assert_agent_amount_allowed(p_tenant,p_entity,run,'propose_credit_note',value);
  end if;
  select * into prior from public.adjustment_notes where id=p_id;
  if found then
    if prior.maker=auth.uid() and prior.kind=p_kind and prior.customer_id=p_customer and prior.amount=value and prior.reference=p_reference
      and prior.invoice_id is not distinct from p_invoice and prior.reason=p_reason and prior.memo=p_memo and prior.due_date is not distinct from p_due then
      return jsonb_build_object('id',prior.id,'status',prior.status,'version',prior.version); end if;
    raise exception 'Idempotency key conflict';
  end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  if p_invoice is not null then
    select o.*,i.version as invoice_version into inv from o2c_private.open_invoices(p_tenant,p_entity) o join public.invoices i on i.id=o.id where o.id=p_invoice and o.customer_id=p_customer;
    if not found then raise exception 'Invoice unavailable'; end if;
    inv_version:=inv.invoice_version;
  end if;
  if p_kind='credit' then
    if p_invoice is null then raise exception 'A credit note must name the invoice it reduces'; end if;
    if value>inv.open then raise exception 'Credit note exceeds the invoice open amount'; end if;
    if p_due is not null then raise exception 'Invalid note'; end if;
  else
    if p_due is null or not isfinite(p_due) then raise exception 'A debit note needs a due date'; end if;
    if exists(select 1 from public.invoices where tenant_id=p_tenant and entity_id=p_entity and number=p_reference) then raise exception 'Reference already used by a receivable'; end if;
  end if;
  insert into public.adjustment_notes(id,tenant_id,entity_id,customer_id,kind,invoice_id,invoice_version,amount,reason,memo,reference,due_date,maker,agent_run_id)
    values(p_id,p_tenant,p_entity,p_customer,p_kind,p_invoice,case when p_kind='credit' then inv_version end,value,p_reason,p_memo,p_reference,p_due,auth.uid(),run);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'adjustment_note.proposed',p_id,
    jsonb_build_object('kind',p_kind,'customer_id',p_customer,'invoice_id',p_invoice,'amount',p_amount,'reason',p_reason,'reference',p_reference,'agent_run_id',run));
  return jsonb_build_object('id',p_id,'status','pending','version',1);
end $$;

create or replace function public.add_customer_remark(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_invoice uuid,p_reason text,p_channel text,
  p_note text,p_next date,p_promise_amount text,p_promise_date date) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.customer_remarks; promise uuid;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','approver','admin') then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity)
    or (p_invoice is not null and not exists(select 1 from public.invoices where id=p_invoice and customer_id=p_customer)) then raise exception 'Customer unavailable'; end if;
  if p_next is not null and (not isfinite(p_next) or p_next<o2c_private.dubai_today() or p_next>o2c_private.dubai_today()+365) then raise exception 'Follow-up date must be within the next year'; end if;
  select * into prior from public.customer_remarks where id=p_id;
  if found then
    if prior.customer_id=p_customer and prior.created_by=auth.uid() and prior.note=p_note and prior.invoice_id is not distinct from p_invoice
      and prior.reason=p_reason and prior.channel=p_channel and prior.next_follow_up is not distinct from p_next
      and (prior.promise_id is null or exists(select 1 from public.payment_promises p where p.id=prior.promise_id
        and p.amount::text=p_promise_amount and p.promised_date=p_promise_date)) then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if p_reason='promised' then
    if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
    if p_promise_amount is null or p_promise_amount !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' or p_promise_amount::numeric<=0
      or p_promise_date is null or not isfinite(p_promise_date) then raise exception 'A promise needs an amount and a date'; end if;
    promise:=gen_random_uuid();
    insert into public.payment_promises(id,tenant_id,entity_id,customer_id,invoice_id,amount,promised_date,note,created_by)
      values(promise,p_tenant,p_entity,p_customer,p_invoice,p_promise_amount::numeric,p_promise_date,left(p_note,500),auth.uid());
  end if;
  insert into public.customer_remarks(id,tenant_id,entity_id,customer_id,invoice_id,reason,channel,note,next_follow_up,promise_id,created_by)
    values(p_id,p_tenant,p_entity,p_customer,p_invoice,p_reason,p_channel,p_note,p_next,promise,auth.uid());
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'remark.added',p_id,
    jsonb_build_object('customer_id',p_customer,'reason',p_reason,'channel',p_channel,'next_follow_up',p_next,'promise_id',promise));
  return p_id;
end $$;

create or replace function public.add_customer_contact(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_name text,p_email text,p_role text,p_primary boolean,
  p_phone text default null,p_sms boolean default false,p_whatsapp boolean default false,p_consent text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.customer_contacts;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  p_phone:=nullif(trim(p_phone),'');
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid phone: use E.164'; end if;
  if (coalesce(p_sms,false) or coalesce(p_whatsapp,false)) and (p_phone is null or length(trim(coalesce(p_consent,''))) not between 5 and 500) then raise exception 'Phone and consent evidence required'; end if;
  select * into prior from public.customer_contacts where id=p_id;
  if found then
    if prior.customer_id=p_customer and prior.email=lower(p_email) and prior.name=p_name and prior.role=p_role and prior.is_primary=coalesce(p_primary,false) and prior.created_by=auth.uid() and prior.tenant_id=p_tenant and prior.entity_id=p_entity
      and prior.phone is not distinct from p_phone and prior.sms_opt_in=coalesce(p_sms,false)
      and prior.whatsapp_opt_in=coalesce(p_whatsapp,false) and prior.consent_note is not distinct from nullif(trim(p_consent),'') then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if coalesce(p_primary,false) then update public.customer_contacts set is_primary=false where customer_id=p_customer and is_primary; end if;
  insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,role,is_primary,created_by,phone,sms_opt_in,whatsapp_opt_in,consent_note)
    values(p_id,p_tenant,p_entity,p_customer,p_name,lower(p_email),coalesce(p_role,'ar'),coalesce(p_primary,false),auth.uid(),p_phone,coalesce(p_sms,false),coalesce(p_whatsapp,false),nullif(trim(p_consent),''));
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'contact.added',p_id,
    jsonb_build_object('customer_id',p_customer,'role',coalesce(p_role,'ar'),'primary',coalesce(p_primary,false),'sms_opt_in',coalesce(p_sms,false),'whatsapp_opt_in',coalesce(p_whatsapp,false),'consent_note',nullif(trim(p_consent),'')));
  return p_id;
end $$;

create or replace function o2c_private.check_guardrail(p_kind text,p_params jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare tools text[] := array['get_ar_overview','list_invoices','get_cash_match_candidates','get_ar_kpi_pack','propose_receipt',
  'propose_allocation','auto_post_if_policy_allows','record_finding','propose_collection_message','get_collections_worklist',
  'get_customer_account','place_credit_hold','get_outstanding_breakdown','get_short_payment_candidates','propose_credit_note'];
begin
  if p_params is null or jsonb_typeof(p_params)<>'object' then raise exception 'Invalid guardrail'; end if;
  if p_kind='deny_tool' then
    if not coalesce(p_params->>'tool' = any(tools),false) then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='max_amount' then
    if not coalesce(p_params->>'tool' = any(array['propose_receipt','propose_allocation','propose_credit_note']),false)
      or coalesce(p_params->>'limit','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='require_field' then
    if not coalesce(p_params->>'tool' = any(tools),false) or coalesce(p_params->>'field','') !~ '^[a-z_]{1,40}$' then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='max_identical_calls' then
    if coalesce(p_params->>'limit','') !~ '^([1-9]|1[0-9]|20)$' then raise exception 'Invalid guardrail'; end if;
  else raise exception 'Invalid guardrail'; end if;
end $$;

create or replace function public.report_ar_pack(p_tenant uuid,p_entity uuid,p_as_of date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare remaining numeric; dso numeric:=0; month_start date; period_end date; sales numeric; days integer; k integer;
  start_date date := p_as_of-29; begin_ar numeric; period_sales numeric; period_debits numeric; period_credits numeric; end_ar numeric; end_current numeric;
  cei numeric; denominator numeric; dso_text text; overview jsonb;
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
        and document_type='invoice' and issued_at between month_start and period_end;
      if sales>=remaining then dso:=dso+remaining/sales*days; remaining:=0; exit;
      else dso:=dso+days; remaining:=remaining-sales; end if;
    end loop;
    dso_text:=case when remaining>0 then null else round(dso,2)::text end;
  end if;
  select coalesce(sum(gross),0) into begin_ar from public.invoices where tenant_id=p_tenant and entity_id=p_entity and lifecycle='posted' and issued_at<start_date;
  begin_ar:=begin_ar-coalesce((select sum(a.amount) from public.allocations a join public.invoices i on i.id=a.invoice_id
    where a.tenant_id=p_tenant and a.entity_id=p_entity and i.lifecycle='posted' and i.issued_at<start_date and (a.created_at at time zone 'Asia/Dubai')::date<start_date),0);
  select coalesce(sum(gross) filter (where document_type='invoice'),0),coalesce(sum(gross) filter (where document_type='debit_note'),0) into period_sales,period_debits
    from public.invoices where tenant_id=p_tenant and entity_id=p_entity and lifecycle='posted' and issued_at between start_date and p_as_of;
  select coalesce(sum(a.amount),0) into period_credits from public.allocations a join public.invoices i on i.id=a.invoice_id
    where a.tenant_id=p_tenant and a.entity_id=p_entity and i.lifecycle='posted' and a.note_id is not null
      and (a.created_at at time zone 'Asia/Dubai')::date between start_date and p_as_of;
  select coalesce(sum(open),0) into end_current from o2c_private.open_invoices(p_tenant,p_entity) where open>0 and due_date>=p_as_of;
  denominator:=begin_ar+period_sales+period_debits-period_credits-end_current;
  cei:=case when denominator>0 then round((begin_ar+period_sales+period_debits-period_credits-end_ar)/denominator*100,2) else null end;
  overview:=public.agent_ar_overview(p_tenant,p_entity,p_as_of);
  return overview||jsonb_build_object(
    'dso_countback_days',dso_text,
    'dso_basis','Countback over posted invoice gross by calendar month (24-month horizon); null when history is insufficient',
    'cei_30d_percent',cei::text,
    'cei_basis',jsonb_build_object('period_start',start_date,'period_end',p_as_of,'beginning_ar',begin_ar::text,'credit_sales',period_sales::text,
      'debit_notes',period_debits::text,'credit_notes',period_credits::text,'ending_ar',end_ar::text,'ending_current_ar',end_current::text));
end $$;

create or replace function public.agent_console(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  select jsonb_build_object(
    'agent_user',(select m.user_id from public.memberships m where m.tenant_id=p_tenant and m.role='agent' limit 1),
    'schedules',coalesce((select jsonb_object_agg(kind,cadence) from public.agent_schedules where tenant_id=p_tenant and entity_id=p_entity),'{}'),
    'policies',coalesce((select jsonb_agg(jsonb_build_object('id',id,'auto_execute',auto_execute,'per_item_limit',per_item_limit::text,'daily_limit',daily_limit::text,
      'status',status,'maker',maker,'checker',checker,'created_at',created_at,'decided_at',decided_at) order by created_at desc)
      from (select * from (select * from public.agent_policies where tenant_id=p_tenant and entity_id=p_entity and status='active'
        union all (select * from public.agent_policies where tenant_id=p_tenant and entity_id=p_entity and status='pending' order by created_at desc limit 10)) q order by created_at desc) p),'[]'),
    'auto_posted_today',(select coalesce(sum(j.amount),0)::text from public.journals j join public.approvals x on x.id=j.approval_id
      where j.tenant_id=p_tenant and j.entity_id=p_entity and x.checker_basis='policy' and (j.created_at at time zone 'Asia/Dubai')::date=o2c_private.dubai_today()),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'status',status,'trigger',trigger,'requested_by',requested_by,'as_of',as_of,
      'model',model,'input_tokens',input_tokens,'output_tokens',output_tokens,'cost_usd',cost_usd::text,'summary',summary,'error',error,'step_count',step_count,
      'created_at',created_at,'started_at',started_at,'finished_at',finished_at,
      'proposals',(select count(*) from public.approvals a where a.agent_run_id=r.id),
      'auto_posted',(select count(*) from public.approvals a where a.agent_run_id=r.id and a.checker_basis='policy' and a.status='posted')) order by created_at desc,id)
      from (select * from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and kind is not null order by created_at desc,id limit 30) r),'[]'))
  into result;
  return result;
end $$;

alter table public.customers drop constraint if exists customers_category_check, drop constraint if exists customers_region_check;
alter table public.customers
  add constraint customers_category_check check(category is null or (length(category) between 1 and 60 and lower(trim(category)) <> 'unassigned')),
  add constraint customers_region_check check(region is null or (length(region) between 1 and 60 and lower(trim(region)) <> 'unassigned'));

-- 11. The approvals list carries the agent origin, so the UI never infers it from free-text evidence.
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
      'evidence',a.evidence,'created_at',a.created_at,'version',a.version,'agent_run_id',a.agent_run_id,
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
