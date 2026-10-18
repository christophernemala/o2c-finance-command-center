-- Ledger corrections from review of credit and debit notes:
-- 1. An approved note that can no longer post (stale invoice, reference taken) can be withdrawn by a
--    human approver or admin other than the maker, with a reason, audited.
-- 2. Credit notes are not cash: statements show paid and credited separately, CEI nets credit notes out
--    of the AR roll-forward and labels debit notes, and a promise is kept only by cash.
-- 3. The agent's "CN-pending-" placeholder never posts: the approver enters the ERP document number.
-- 4. An account promise is judged only on the invoices that were open when it was made and due on or
--    before its date, so a kept promise stays kept when later invoices fall due.
-- 5. Single-customer segment edits keep a value whose key is absent instead of clearing it.
-- 6. A debit note can be the first note proposed in a session; open notes are never cut off by the history
--    limit; agent_finish_run counts pending notes and collection messages; guardrails can name get_short_payment_candidates;
--    add_trade_licence replays without archiving a later renewal or adding audit events.
begin;

-- 1 and 3. Notes ------------------------------------------------------------------------------------
create function o2c_private.placeholder_reference(p_reference text) returns boolean
language sql immutable set search_path='' as $$ select p_reference ~* '^(CN|DN)-pending-' $$;

-- Proposal: unchanged except that a debit note no longer reads the unassigned invoice record, which failed
-- when a debit note was the first note proposed in a database session.
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
    if prior.maker=auth.uid() and prior.kind=p_kind and prior.customer_id=p_customer and prior.amount=value and prior.reference=p_reference then
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

drop function public.decide_adjustment_note(uuid,uuid,uuid,integer,text);
-- Approval: a human approver or admin other than the maker; a credit note's invoice must be unchanged.
-- p_reference is the document number issued in the source system. It replaces the proposed reference and
-- is required when the proposal carries a placeholder.
create function public.decide_adjustment_note(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer,p_decision text,p_reference text default null) returns void
language plpgsql security definer set search_path='' as $$
declare n public.adjustment_notes; ref text := nullif(trim(coalesce(p_reference,'')),'');
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') or (select kind from auth.users where id=auth.uid())<>'human' then raise exception 'Forbidden'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into n from public.adjustment_notes where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or n.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if n.status=p_decision and n.checker=auth.uid() then return; end if;
  if n.status<>'pending' or n.version<>p_version then raise exception 'Stale proposal; refresh and review'; end if;
  if p_decision='approved' then
    ref:=coalesce(ref,n.reference);
    if length(ref)>60 then raise exception 'Invalid reference'; end if;
    if o2c_private.placeholder_reference(ref) then raise exception 'Enter the document number issued in your ERP before approving'; end if;
    if ref<>n.reference and exists(select 1 from public.adjustment_notes where tenant_id=p_tenant and entity_id=p_entity and kind=n.kind and reference=ref and status<>'rejected')
      then raise exception 'Reference already used by another note'; end if;
    if n.kind='debit' and exists(select 1 from public.invoices where tenant_id=p_tenant and entity_id=p_entity and number=ref) then raise exception 'Reference already used by a receivable'; end if;
    if n.kind='credit' and (select version from public.invoices where id=n.invoice_id)<>n.invoice_version then
      raise exception 'Stale evidence: the invoice changed after this note was proposed'; end if;
  else ref:=n.reference;
  end if;
  update public.adjustment_notes set status=p_decision,checker=auth.uid(),decided_at=now(),reference=ref,version=version+1 where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'adjustment_note.'||p_decision,p_id,
    jsonb_build_object('kind',n.kind,'amount',n.amount::text,'proposal_version',p_version,'reference',ref,
      'proposed_reference',case when ref<>n.reference then n.reference end));
end $$;

-- Withdrawal: an approved note that has not posted goes to rejected, which releases its reference.
-- Same independence as approval; the reason is kept in the audit trail. Replays return quietly.
create function public.withdraw_adjustment_note(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare n public.adjustment_notes;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') or (select kind from auth.users where id=auth.uid())<>'human' then raise exception 'Forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise exception 'Invalid reason'; end if;
  select * into n from public.adjustment_notes where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or n.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if n.status='rejected' and n.version=p_version+1 and exists(select 1 from public.audit_events where record_id=p_id and operation='adjustment_note.withdrawn' and actor=auth.uid())
    then return; end if;
  if n.status<>'approved' or n.version<>p_version then raise exception 'Only an approved, unposted note at its current version can be withdrawn'; end if;
  update public.adjustment_notes set status='rejected',version=version+1 where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'adjustment_note.withdrawn',p_id,
    jsonb_build_object('kind',n.kind,'amount',n.amount::text,'reference',n.reference,'approved_by',n.checker,'version',p_version,'reason',left(trim(p_reason),500)));
end $$;

-- Posting refuses placeholder references (also for notes approved before this migration).
create or replace function public.post_adjustment_note(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare n public.adjustment_notes; i public.invoices; open_amount numeric; journal uuid; new_invoice uuid;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','approver','admin') or (select kind from auth.users where id=auth.uid())<>'human' then raise exception 'Forbidden'; end if;
  select * into n from public.adjustment_notes where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found then raise exception 'Forbidden'; end if;
  if n.status='posted' then return (select id from public.adjustment_journals where note_id=n.id); end if;
  if n.status<>'approved' or n.version<>p_version or n.checker is null or n.checker=n.maker then raise exception 'Approved current note required'; end if;
  if o2c_private.placeholder_reference(n.reference) then raise exception 'Placeholder reference: withdraw this note and propose it with the ERP document number'; end if;
  if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=n.checker and role in ('approver','admin')) then raise exception 'Approval authority revoked'; end if;
  if n.kind='credit' then
    select * into i from public.invoices where id=n.invoice_id for update;
    if i.version<>n.invoice_version or i.lifecycle<>'posted' then raise exception 'Stale evidence: the invoice changed after this note was approved'; end if;
    open_amount:=i.gross-coalesce((select sum(amount) from public.allocations where invoice_id=i.id),0);
    if n.amount>open_amount then raise exception 'Credit note exceeds the invoice open amount'; end if;
    insert into public.allocations(tenant_id,entity_id,invoice_id,note_id,amount) values(n.tenant_id,n.entity_id,i.id,n.id,n.amount);
    update public.invoices set version=version+1 where id=i.id;
    insert into public.adjustment_journals(tenant_id,entity_id,note_id,amount,debit_account,credit_account)
      values(n.tenant_id,n.entity_id,n.id,n.amount,'sales_adjustments','accounts_receivable') returning id into journal;
  else
    if exists(select 1 from public.invoices where tenant_id=p_tenant and entity_id=p_entity and number=n.reference) then raise exception 'Reference already used by a receivable'; end if;
    insert into public.invoices(tenant_id,entity_id,customer_id,number,issued_at,due_date,gross,document_type,source_note_id)
      values(n.tenant_id,n.entity_id,n.customer_id,n.reference,o2c_private.dubai_today(),n.due_date,n.amount,'debit_note',n.id) returning id into new_invoice;
    insert into public.adjustment_journals(tenant_id,entity_id,note_id,amount,debit_account,credit_account)
      values(n.tenant_id,n.entity_id,n.id,n.amount,'accounts_receivable','sales_adjustments') returning id into journal;
  end if;
  update public.adjustment_notes set status='posted',poster=auth.uid(),posted_at=now(),debit_invoice_id=new_invoice,version=version+1 where id=n.id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'adjustment_note.posted',journal,
    jsonb_build_object('note_id',n.id,'kind',n.kind,'amount',n.amount::text,'invoice_id',coalesce(n.invoice_id,new_invoice)));
  return journal;
end $$;

-- The queue lists every open note; only the posted and rejected history is limited to the last 100, so an
-- open note can never fall off the screen behind newer history.
create or replace function public.adjustment_notes_list(p_tenant uuid,p_entity uuid,p_status text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_status is null or p_status not in ('open','all') then raise exception 'Invalid request'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'customer_id',n.customer_id,'customer',c.name,'account',c.account,
      'invoice_id',n.invoice_id,'invoice',i.number,'invoice_open',(select o.open::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.id=n.invoice_id),
      'invoice_current',n.invoice_id is null or i.version=n.invoice_version,'amount',n.amount::text,'reason',n.reason,'memo',n.memo,'reference',n.reference,
      'due_date',n.due_date,'status',n.status,'maker',n.maker,'checker',n.checker,'poster',n.poster,'agent_run_id',n.agent_run_id,'version',n.version,
      'created_at',n.created_at,'decided_at',n.decided_at,'posted_at',n.posted_at) order by n.created_at desc)
    from (select * from public.adjustment_notes where tenant_id=p_tenant and entity_id=p_entity and status in ('pending','approved')
      union all
      (select * from public.adjustment_notes where tenant_id=p_tenant and entity_id=p_entity and p_status='all' and status in ('posted','rejected')
        order by created_at desc limit 100)) n
    join public.customers c on c.id=n.customer_id left join public.invoices i on i.id=n.invoice_id),'[]');
end $$;

-- 2. Cash versus credits ----------------------------------------------------------------------------
-- Statement lines: paid is cash (receipt allocations), credited is posted credit notes; debit notes are labelled.
create or replace function o2c_private.statement_data(p_tenant uuid,p_entity uuid,p_customer uuid,p_as_of date,p_invoices uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  return (select jsonb_build_object('as_of',p_as_of,'entity',e.name,'customer',c.name,'account',c.account,
    'lines',coalesce((select jsonb_agg(jsonb_build_object('number',o.number,'document_type',i.document_type,'issued_at',o.issued_at,'due_date',o.due_date,'gross',o.gross::text,
      'paid',coalesce((select sum(a.amount) from public.allocations a where a.invoice_id=o.id and a.receipt_id is not null),0)::numeric(15,2)::text,
      'credited',coalesce((select sum(a.amount) from public.allocations a where a.invoice_id=o.id and a.note_id is not null),0)::numeric(15,2)::text,
      'open',o.open::text,'days_overdue',greatest(p_as_of-o.due_date,0)) order by o.due_date,o.number)
      from o2c_private.open_invoices(p_tenant,p_entity) o join public.invoices i on i.id=o.id
      where o.customer_id=c.id and o.open>0 and (p_invoices is null or o.id=any(p_invoices))),'[]'),
    'total_open',(select coalesce(sum(o.open),0)::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0 and (p_invoices is null or o.id=any(p_invoices))),
    'total_overdue',(select coalesce(sum(o.open),0)::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.customer_id=c.id and o.open>0 and o.due_date<p_as_of
      and (p_invoices is null or o.id=any(p_invoices))))
    from public.customers c join public.entities e on e.tenant_id=c.tenant_id and e.id=c.entity_id
    where c.id=p_customer and c.tenant_id=p_tenant and c.entity_id=p_entity);
end $$;
create or replace function o2c_private.statement_data(p_tenant uuid,p_entity uuid,p_customer uuid,p_as_of date) returns jsonb
language sql stable security definer set search_path='' as $$ select o2c_private.statement_data(p_tenant,p_entity,p_customer,p_as_of,null::uuid[]) $$;

-- Promises (2 and 4). Only cash allocated on or after the promise was recorded can keep it.
-- Invoice promise: void invoice -> cancelled; invoice settled with such cash -> kept; settled by credit
-- notes alone -> cancelled. Account promise: judged on the invoices open when it was recorded and due on
-- or before the promised date; this set never grows, so a kept promise cannot turn broken later.
create function o2c_private.promise_state(p_tenant uuid,p_entity uuid,p_customer uuid,p_invoice uuid,p_status text,p_date date,p_as_of date,p_since timestamptz) returns text
language plpgsql stable security definer set search_path='' as $$
declare scope uuid[]; still_open boolean; cash numeric;
begin
  if p_status<>'open' then return p_status; end if;
  if p_invoice is not null then
    select array_agg(o.id),bool_or(o.open>0) into scope,still_open from o2c_private.open_invoices(p_tenant,p_entity) o where o.id=p_invoice;
    if scope is null then return 'cancelled'; end if;
  else
    select array_agg(o.id),coalesce(bool_or(o.open>0),false) into scope,still_open from o2c_private.open_invoices(p_tenant,p_entity) o
      where o.customer_id=p_customer and o.due_date<=p_date
        and o.gross-coalesce((select sum(a.amount) from public.allocations a where a.invoice_id=o.id and a.created_at<p_since),0)>0;
    if scope is null then return 'kept'; end if;
  end if;
  if still_open then return case when p_date<p_as_of then 'broken' else 'open' end; end if;
  select coalesce(sum(a.amount),0) into cash from public.allocations a where a.invoice_id=any(scope) and a.receipt_id is not null and a.created_at>=p_since;
  return case when cash>0 then 'kept' else 'cancelled' end;
end $$;

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
        and o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of,p.created_at)='broken') as broken_promises,
      (select count(*) from public.payment_promises p where p.customer_id=c.id
        and o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of,p.created_at)='open') as open_promises,
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
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',k.id,'name',k.name,'email',k.email,'phone',k.phone,'sms_opt_in',k.sms_opt_in,'whatsapp_opt_in',k.whatsapp_opt_in,'role',k.role,'is_primary',k.is_primary) order by k.is_primary desc,k.name)
      from public.customer_contacts k where k.customer_id=c.id and not k.archived),'[]'),
    'promises',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',p.invoice_id,'amount',p.amount::text,'promised_date',p.promised_date,
      'status',o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of,p.created_at),'resolvable',p.status='open','note',p.note) order by p.promised_date desc)
      from public.payment_promises p where p.customer_id=c.id),'[]'),
    'hold',(select jsonb_build_object('id',h.id,'reason',h.reason,'placed_by_kind',h.placed_by_kind,'placed_by',h.placed_by,'placed_at',h.placed_at)
      from public.customer_holds h where h.customer_id=c.id and h.released_at is null),
    'credit_limit',(select jsonb_build_object('id',l.id,'limit',l.credit_limit::text,'decided_at',l.decided_at) from public.credit_limits l where l.customer_id=c.id and l.status='active'),
    'pending_limit',(select jsonb_build_object('id',l.id,'limit',l.credit_limit::text,'reason',l.reason,'maker',l.maker) from public.credit_limits l where l.customer_id=c.id and l.status='pending'),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'tone',m.tone,'subject',m.subject,'body',m.body,'to',case when m.channel='email' then m.to_email else m.to_phone end,'channel',m.channel,'provider_id',m.provider_id,'total_overdue',m.total_overdue::text,
      'invoice_ids',m.invoice_ids,'attach_statement',m.attach_statement,'status',m.status,'maker',m.maker,'checker',m.checker,'agent_run_id',m.agent_run_id,
      'error',m.error,'created_at',m.created_at,'sent_at',m.sent_at) order by m.created_at desc) from (select * from public.collection_messages where customer_id=c.id order by created_at desc limit 20) m),'[]'))
  into result from public.customers c where c.id=p_customer and c.tenant_id=p_tenant and c.entity_id=p_entity;
  if result is null then raise exception 'Customer unavailable'; end if;
  return result;
end $$;

drop function o2c_private.promise_state(uuid,uuid,uuid,uuid,text,date,date);

-- CEI: collections are cash. The 30-day roll-forward is
--   beginning AR + credit sales (invoices) + debit notes - credit notes posted - ending AR = cash collected,
-- and the denominator replaces ending AR with ending current AR. Debit notes are not credit sales.
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
        and issued_at between month_start and period_end;
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

-- 5. Segments: a row without a category or region key keeps the current value; an empty string clears it.
create or replace function public.set_customer_segments(p_tenant uuid,p_entity uuid,p_id uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; matched integer; prior public.audit_events;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 then raise exception 'Invalid segments'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
  select * into prior from public.audit_events where record_id=p_id and operation='customer_segments.set' and tenant_id=p_tenant and entity_id=p_entity;
  if found then
    if prior.actor=auth.uid() and prior.detail->>'digest'=md5(p_rows::text) then return (prior.detail->>'rows')::integer; end if;
    raise exception 'Idempotency key conflict';
  end if;
  select count(*),count(distinct trim(r.account)) into n,matched from jsonb_to_recordset(p_rows) as r(account text);
  if n<>matched or exists(select 1 from jsonb_to_recordset(p_rows) as r(account text) where coalesce(trim(r.account),'')='') then raise exception 'Each account must appear once'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(account text)
    where not exists(select 1 from public.customers c where c.tenant_id=p_tenant and c.entity_id=p_entity and c.account=trim(r.account))) then raise exception 'Unknown customer account'; end if;
  update public.customers c
    set category=case when r.value ? 'category' then nullif(trim(coalesce(r.value->>'category','')),'') else c.category end,
        region=case when r.value ? 'region' then nullif(trim(coalesce(r.value->>'region','')),'') else c.region end
    from jsonb_array_elements(p_rows) as r(value)
    where c.tenant_id=p_tenant and c.entity_id=p_entity and c.account=trim(r.value->>'account');
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'customer_segments.set',p_id,
    jsonb_build_object('rows',n,'digest',md5(p_rows::text)));
  return n;
end $$;

-- 6. Small fixes ------------------------------------------------------------------------------------
create or replace function public.agent_finish_run(p_tenant uuid,p_entity uuid,p_run uuid,p_status text,p_summary text,p_model text,
  p_input_tokens integer,p_output_tokens integer,p_cache_read_tokens integer,p_cost text,p_error text) returns text
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs := o2c_private.require_run(p_tenant,p_entity,p_run); final text;
begin
  if p_status not in ('succeeded','failed') then raise exception 'Invalid status'; end if;
  if p_cost is not null and p_cost !~ '^[0-9]{1,6}(\.[0-9]{1,6})?$' then raise exception 'Invalid cost'; end if;
  final:=case when p_status='succeeded' and (exists(select 1 from public.approvals where agent_run_id=p_run and status='pending')
    or exists(select 1 from public.adjustment_notes where agent_run_id=p_run and status='pending')
    or exists(select 1 from public.collection_messages where agent_run_id=p_run and status='pending')) then 'awaiting_approval' else p_status end;
  update public.agent_runs set status=final,summary=left(p_summary,20000),model=left(p_model,100),input_tokens=greatest(coalesce(p_input_tokens,0),0),
    output_tokens=greatest(coalesce(p_output_tokens,0),0),cache_read_tokens=greatest(coalesce(p_cache_read_tokens,0),0),cost_usd=p_cost::numeric,
    error=left(p_error,2000),finished_at=now(),updated_at=now() where id=p_run;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent.run.'||final,p_run,
    jsonb_build_object('kind',run.kind,'model',p_model,'steps',run.step_count,'cost_usd',p_cost));
  perform o2c_private.detect_agent_incidents(p_tenant,p_entity);
  delete from auth.sessions where token_hash=current_setting('o2c.session_hash',true);
  return final;
end $$;

create or replace function o2c_private.check_guardrail(p_kind text,p_params jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare tools text[] := array['get_ar_overview','list_invoices','get_cash_match_candidates','get_ar_kpi_pack','propose_receipt',
  'propose_allocation','auto_post_if_policy_allows','record_finding','propose_collection_message','get_collections_worklist',
  'get_customer_account','place_credit_hold','get_outstanding_breakdown','get_short_payment_candidates','propose_credit_note'];
begin
  if p_params is null or jsonb_typeof(p_params)<>'object' then raise exception 'Invalid guardrail'; end if;
  if p_kind='deny_tool' then
    if not (p_params->>'tool' = any(tools)) then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='max_amount' then
    if not (p_params->>'tool' = any(array['propose_receipt','propose_allocation','propose_credit_note']))
      or coalesce(p_params->>'limit','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$' then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='require_field' then
    if not (p_params->>'tool' = any(tools)) or coalesce(p_params->>'field','') !~ '^[a-z_]{1,40}$' then raise exception 'Invalid guardrail'; end if;
  elsif p_kind='max_identical_calls' then
    if coalesce(p_params->>'limit','') !~ '^([1-9]|1[0-9]|20)$' then raise exception 'Invalid guardrail'; end if;
  else raise exception 'Invalid guardrail'; end if;
end $$;

-- A replay returns before archiving anything, so it cannot archive a later renewal; a different payload
-- under the same id is a key conflict.
create or replace function public.add_trade_licence(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_number text,p_authority text,p_expiry date) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.customer_trade_licences;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_expiry is null or not isfinite(p_expiry) then raise exception 'Invalid expiry date'; end if;
  select * into prior from public.customer_trade_licences where id=p_id;
  if found then
    if prior.tenant_id=p_tenant and prior.entity_id=p_entity and prior.customer_id=p_customer and prior.licence_number=p_number
      and prior.authority=p_authority and prior.expiry_date=p_expiry and prior.created_by=auth.uid() then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer::text,3));
  -- A renewal replaces the previous active record for the same licence number.
  update public.customer_trade_licences set archived=true where customer_id=p_customer and licence_number=p_number and not archived;
  insert into public.customer_trade_licences(id,tenant_id,entity_id,customer_id,licence_number,authority,expiry_date,created_by)
    values(p_id,p_tenant,p_entity,p_customer,p_number,p_authority,p_expiry,auth.uid());
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'trade_licence.recorded',p_id,
    jsonb_build_object('customer_id',p_customer,'authority',p_authority,'expiry_date',p_expiry));
  return p_id;
end $$;

-- Grants -------------------------------------------------------------------------------------------
revoke all on function o2c_private.placeholder_reference(text),o2c_private.promise_state(uuid,uuid,uuid,uuid,text,date,date,timestamptz) from public,anon,authenticated;
revoke all on function public.decide_adjustment_note(uuid,uuid,uuid,integer,text,text),public.withdraw_adjustment_note(uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function public.decide_adjustment_note(uuid,uuid,uuid,integer,text,text),public.withdraw_adjustment_note(uuid,uuid,uuid,integer,text) to authenticated;
commit;
