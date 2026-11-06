-- Credit and debit notes as AR ledger adjustments. Each note mirrors a document issued in the source
-- system (its reference is required); this application does not issue tax credit notes or e-invoices.
-- Lifecycle: proposed (maker, admin, or the agent within a run) -> decided by an independent human
-- approver -> posted as a separate step. A posted credit note is a non-cash allocation against one
-- invoice, so every open-balance calculation includes it; a posted debit note is a new receivable.
begin;

create table public.adjustment_notes (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null,
  kind text not null check(kind in ('credit','debit')),
  invoice_id uuid, invoice_version integer,
  amount numeric(15,2) not null check(amount > 0),
  reason text not null check(reason in ('short_payment','bank_charges','pricing','discount','returns','damaged','late_payment_fee','other')),
  memo text not null check(length(memo) between 10 and 1000),
  reference text not null check(length(reference) between 1 and 60),
  due_date date,
  status text not null default 'pending' check(status in ('pending','approved','rejected','posted')),
  maker uuid not null references auth.users, checker uuid references auth.users, poster uuid references auth.users,
  agent_run_id uuid references public.agent_runs, debit_invoice_id uuid,
  version integer not null default 1, created_at timestamptz not null default now(), decided_at timestamptz, posted_at timestamptz,
  check(checker is null or checker <> maker),
  check((kind='credit' and invoice_id is not null and invoice_version is not null and due_date is null)
     or (kind='debit' and due_date is not null)),
  unique(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id),
  foreign key(tenant_id,entity_id,invoice_id) references public.invoices(tenant_id,entity_id,id)
);
create unique index adjustment_notes_reference on public.adjustment_notes(tenant_id,entity_id,kind,reference) where status<>'rejected';
create index adjustment_notes_queue on public.adjustment_notes(tenant_id,entity_id,status,created_at desc);

create table public.adjustment_journals (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  note_id uuid not null unique, amount numeric(15,2) not null check(amount > 0),
  debit_account text not null check(debit_account in ('sales_adjustments','accounts_receivable')),
  credit_account text not null check(credit_account in ('sales_adjustments','accounts_receivable')),
  created_at timestamptz not null default now(), check(debit_account <> credit_account),
  foreign key(tenant_id,entity_id,note_id) references public.adjustment_notes(tenant_id,entity_id,id)
);
create trigger adjustment_journals_frozen before update or delete on public.adjustment_journals for each row execute function public.reject_audit_mutation();

-- A credit note settles part of one invoice without cash: an allocation row with a note instead of a receipt.
alter table public.allocations alter column receipt_id drop not null, alter column approval_id drop not null,
  add column note_id uuid unique,
  add constraint allocations_note_fk foreign key(tenant_id,entity_id,note_id) references public.adjustment_notes(tenant_id,entity_id,id),
  add constraint allocations_source check((receipt_id is not null and approval_id is not null and note_id is null)
    or (receipt_id is null and approval_id is null and note_id is not null));

-- A debit note becomes a receivable of its own, marked as such.
alter table public.invoices add column document_type text not null default 'invoice' check(document_type in ('invoice','debit_note')),
  add column source_note_id uuid unique;

alter table public.adjustment_notes enable row level security;
create policy scope_read on public.adjustment_notes for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.adjustment_journals enable row level security;
create policy scope_read on public.adjustment_journals for select to authenticated using(public.member_role(tenant_id) is not null);
revoke all on public.adjustment_notes,public.adjustment_journals from public,anon,authenticated;
grant select on public.adjustment_notes,public.adjustment_journals to authenticated;

-- Guardrails can now name the credit note tool, including an amount cap enforced again in SQL.
create or replace function o2c_private.check_guardrail(p_kind text,p_params jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare tools text[] := array['get_ar_overview','list_invoices','get_cash_match_candidates','get_ar_kpi_pack','propose_receipt',
  'propose_allocation','auto_post_if_policy_allows','record_finding','propose_collection_message','get_collections_worklist',
  'get_customer_account','place_credit_hold','get_outstanding_breakdown','propose_credit_note'];
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

create function o2c_private.assert_agent_amount_allowed(p_tenant uuid,p_entity uuid,p_run uuid,p_tool text,p_amount numeric) returns void
language plpgsql stable security definer set search_path='' as $$
declare agent_kind text; rule record;
begin
  perform o2c_private.assert_agent_tool_allowed(p_tenant,p_entity,p_run,p_tool);
  select kind into agent_kind from public.agent_runs where id=p_run;
  for rule in select * from o2c_private.active_guardrails(p_tenant,p_entity,agent_kind)
    where stage='block' and kind='max_amount' and params->>'tool'=p_tool and p_amount>(params->>'limit')::numeric loop
    raise exception 'Blocked by guardrail: %', rule.name;
  end loop;
end $$;

create function public.propose_adjustment_note(p_tenant uuid,p_entity uuid,p_id uuid,p_kind text,p_customer uuid,p_invoice uuid,
  p_amount text,p_reason text,p_memo text,p_reference text,p_due date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); run uuid := o2c_private.current_agent_run();
  prior public.adjustment_notes; inv record; value numeric(15,2);
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
    values(p_id,p_tenant,p_entity,p_customer,p_kind,p_invoice,case when p_kind='credit' then inv.invoice_version end,value,p_reason,p_memo,p_reference,p_due,auth.uid(),run);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'adjustment_note.proposed',p_id,
    jsonb_build_object('kind',p_kind,'customer_id',p_customer,'invoice_id',p_invoice,'amount',p_amount,'reason',p_reason,'reference',p_reference,'agent_run_id',run));
  return jsonb_build_object('id',p_id,'status','pending','version',1);
end $$;

-- Approval: a human approver or admin other than the maker; a credit note's invoice must be unchanged.
create function public.decide_adjustment_note(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare n public.adjustment_notes;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') or (select kind from auth.users where id=auth.uid())<>'human' then raise exception 'Forbidden'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into n from public.adjustment_notes where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or n.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if n.status=p_decision and n.checker=auth.uid() then return; end if;
  if n.status<>'pending' or n.version<>p_version then raise exception 'Stale proposal; refresh and review'; end if;
  if p_decision='approved' and n.kind='credit' and (select version from public.invoices where id=n.invoice_id)<>n.invoice_version then
    raise exception 'Stale evidence: the invoice changed after this note was proposed'; end if;
  update public.adjustment_notes set status=p_decision,checker=auth.uid(),decided_at=now(),version=version+1 where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'adjustment_note.'||p_decision,p_id,
    jsonb_build_object('kind',n.kind,'amount',n.amount::text,'proposal_version',p_version));
end $$;

-- Posting is a separate step on an approved, current note. Replays return the same journal.
create function public.post_adjustment_note(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare n public.adjustment_notes; i public.invoices; open_amount numeric; journal uuid; new_invoice uuid;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','approver','admin') or (select kind from auth.users where id=auth.uid())<>'human' then raise exception 'Forbidden'; end if;
  select * into n from public.adjustment_notes where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found then raise exception 'Forbidden'; end if;
  if n.status='posted' then return (select id from public.adjustment_journals where note_id=n.id); end if;
  if n.status<>'approved' or n.version<>p_version or n.checker is null or n.checker=n.maker then raise exception 'Approved current note required'; end if;
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

create function public.adjustment_notes_list(p_tenant uuid,p_entity uuid,p_status text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_status is null or p_status not in ('open','all') then raise exception 'Invalid request'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'customer_id',n.customer_id,'customer',c.name,'account',c.account,
      'invoice_id',n.invoice_id,'invoice',i.number,'invoice_open',(select o.open::text from o2c_private.open_invoices(p_tenant,p_entity) o where o.id=n.invoice_id),
      'invoice_current',n.invoice_id is null or i.version=n.invoice_version,'amount',n.amount::text,'reason',n.reason,'memo',n.memo,'reference',n.reference,
      'due_date',n.due_date,'status',n.status,'maker',n.maker,'checker',n.checker,'poster',n.poster,'agent_run_id',n.agent_run_id,'version',n.version,
      'created_at',n.created_at,'decided_at',n.decided_at,'posted_at',n.posted_at) order by n.created_at desc)
    from (select * from public.adjustment_notes where tenant_id=p_tenant and entity_id=p_entity and (p_status='all' or status in ('pending','approved'))
      order by created_at desc limit 100) n
    join public.customers c on c.id=n.customer_id left join public.invoices i on i.id=n.invoice_id),'[]');
end $$;

-- Short-payment candidates for the agent and the screen: an invoice with a small open remainder after a
-- payment was allocated to it. The tolerance is the caller's; nothing is proposed here.
create function public.short_payment_candidates(p_tenant uuid,p_entity uuid,p_tolerance text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare tolerance numeric(15,2);
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_tolerance is null or p_tolerance !~ '^(0|[1-9][0-9]{0,6})(\.[0-9]{1,2})?$' then raise exception 'Invalid tolerance'; end if;
  tolerance:=p_tolerance::numeric;
  return coalesce((select jsonb_agg(jsonb_build_object('invoice_id',o.id,'invoice',o.number,'customer_id',o.customer_id,'customer',o.customer,'account',o.account,
      'gross',o.gross::text,'open',o.open::text,'paid',(o.gross-o.open)::text) order by o.open desc,o.number)
    from o2c_private.open_invoices(p_tenant,p_entity) o
    where o.open>0 and o.open<=tolerance and o.open<o.gross and o.dispute<>'open'
      and exists(select 1 from public.allocations a where a.invoice_id=o.id and a.receipt_id is not null)
      and not exists(select 1 from public.adjustment_notes n where n.invoice_id=o.id and n.status in ('pending','approved'))),'[]');
end $$;

revoke all on function o2c_private.assert_agent_amount_allowed(uuid,uuid,uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.propose_adjustment_note(uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,date),public.decide_adjustment_note(uuid,uuid,uuid,integer,text),
  public.post_adjustment_note(uuid,uuid,uuid,integer),public.adjustment_notes_list(uuid,uuid,text),public.short_payment_candidates(uuid,uuid,text) from public,anon;
grant execute on function public.propose_adjustment_note(uuid,uuid,uuid,text,uuid,uuid,text,text,text,text,date),public.decide_adjustment_note(uuid,uuid,uuid,integer,text),
  public.post_adjustment_note(uuid,uuid,uuid,integer),public.adjustment_notes_list(uuid,uuid,text),public.short_payment_candidates(uuid,uuid,text) to authenticated;
commit;
