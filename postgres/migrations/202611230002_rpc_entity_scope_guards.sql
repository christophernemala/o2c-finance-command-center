-- Authenticated definer RPCs must operate only on the transaction's selected tenant and entity.
-- The server-side finance client sets these transaction-local scope values from the same routine arguments.
begin;

create or replace function o2c_private.require_scope(p_tenant uuid,p_entity uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare r text := public.member_role(p_tenant);
begin
  if auth.uid() is null or r is null or not exists(select 1 from public.entities where tenant_id=p_tenant and id=p_entity) then raise exception 'Forbidden'; end if;
  if nullif(current_setting('o2c.tenant_id',true),'') is distinct from p_tenant::text
    or nullif(current_setting('o2c.entity_id',true),'') is distinct from p_entity::text then raise exception 'Scope mismatch'; end if;
  if r='agent' and not exists(select 1 from public.agent_runs where id=o2c_private.current_agent_run() and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Forbidden'; end if;
  return r;
end $$;
revoke all on function o2c_private.require_scope(uuid,uuid) from public,anon,authenticated;

create or replace function o2c_private.require_run(p_tenant uuid,p_entity uuid,p_run uuid) returns public.agent_runs
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if coalesce(public.member_role(p_tenant),'')<>'agent' or o2c_private.current_agent_run() is distinct from p_run then raise exception 'Forbidden'; end if;
  select * into run from public.agent_runs where id=p_run and tenant_id=p_tenant and entity_id=p_entity and agent_user=auth.uid() for update;
  if not found or run.status<>'running' then raise exception 'Run is not active'; end if;
  return run;
end $$;

CREATE OR REPLACE FUNCTION public.agent_auto_post(p_tenant uuid, p_entity uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.approvals; p public.agent_policies; b public.bank_lines; r public.receipts; posted_today numeric; journal uuid; exact boolean;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if coalesce(public.member_role(p_tenant),'') <> 'agent' then raise exception 'Forbidden'; end if;
  select * into a from public.approvals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or a.maker<>auth.uid() then raise exception 'Forbidden'; end if;
  if a.status='posted' then return jsonb_build_object('status','posted','journal_id',(select id from public.journals where approval_id=a.id)); end if;
  if a.status<>'pending' then raise exception 'Proposal is not pending'; end if;
  select * into p from public.agent_policies where tenant_id=p_tenant and entity_id=p_entity and status='active' for update;
  if not found or not p.auto_execute then return jsonb_build_object('status','awaiting_approval','reason','Auto-execution disabled for this entity'); end if;
  if a.amount>p.per_item_limit then return jsonb_build_object('status','awaiting_approval','reason','Amount above the per-item auto-execution limit'); end if;
  select coalesce(sum(j.amount),0) into posted_today from public.journals j join public.approvals x on x.id=j.approval_id
    where j.tenant_id=p_tenant and j.entity_id=p_entity and x.checker_basis='policy'
      and (j.created_at at time zone 'Asia/Dubai')::date=o2c_private.dubai_today();
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
end $function$;

CREATE OR REPLACE FUNCTION public.commit_import(p_tenant uuid, p_entity uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare batch public.import_batches; entry jsonb; customer uuid;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
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
end $function$;

CREATE OR REPLACE FUNCTION public.decide_action(p_tenant uuid, p_entity uuid, p_id uuid, p_version integer, p_decision text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.approvals;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if public.member_role(p_tenant) not in ('approver','admin') or public.member_role(p_tenant) is null then raise exception 'Forbidden'; end if;
  select * into a from public.approvals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or a.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if p_decision not in ('approved','rejected') or p_decision is null then raise exception 'Invalid decision'; end if;
  if a.status=p_decision and a.approver=auth.uid() then return; end if;
  if a.status<>'pending' or a.version<>p_version then raise exception 'Stale proposal; refresh and review'; end if;
  update public.approvals set status=p_decision,approver=auth.uid(),version=version+1 where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'proposal.'||p_decision,p_id,jsonb_build_object('proposal_version',p_version,'amount',a.amount::text));
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_agent_job(p_tenant uuid, p_entity uuid, p_id uuid, p_agent text, p_as_of date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prior public.agent_jobs;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if coalesce(public.member_role(p_tenant),'') not in ('maker','admin') or not exists(select 1 from public.entities where id=p_entity and tenant_id=p_tenant) then raise exception 'Forbidden'; end if;
  if p_id is null or p_agent is null or p_agent not in ('ar','collections','treasury') or p_as_of is null or not isfinite(p_as_of) then raise exception 'Invalid job'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into prior from public.agent_jobs where id=p_id;
  if found then
    if prior.tenant_id=p_tenant and prior.entity_id=p_entity and prior.requested_by=auth.uid() and prior.agent=p_agent and prior.as_of=p_as_of then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  insert into public.agent_jobs(id,tenant_id,entity_id,agent,requested_by,as_of) values(p_id,p_tenant,p_entity,p_agent,auth.uid(),p_as_of);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent.queued',p_id,jsonb_build_object('agent',p_agent,'as_of',p_as_of));
  return p_id;
end $function$;

CREATE OR REPLACE FUNCTION public.execute_action(p_tenant uuid, p_entity uuid, p_id uuid, p_version integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.approvals; journal_id uuid;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if coalesce(public.member_role(p_tenant),'') not in ('maker','approver','admin') then raise exception 'Forbidden'; end if;
  select * into a from public.approvals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found then raise exception 'Forbidden'; end if;
  if a.status='posted' then select id into journal_id from public.journals where approval_id=p_id; return journal_id; end if;
  if a.status<>'approved' or a.version<>p_version or a.approver=a.maker or a.checker_basis<>'human' then raise exception 'Approved current proposal required'; end if;
  if not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=a.approver and role in ('approver','admin'))
    or not exists(select 1 from public.memberships where tenant_id=p_tenant and user_id=a.maker and role in ('maker','admin','agent')) then raise exception 'Approval authority revoked'; end if;
  return o2c_private.post_approved(a.id);
end $function$;

CREATE OR REPLACE FUNCTION public.propose_action(p_tenant uuid, p_entity uuid, p_id uuid, p_kind text, p_amount text, p_evidence text, p_invoice uuid DEFAULT NULL::uuid, p_receipt uuid DEFAULT NULL::uuid, p_bank uuid DEFAULT NULL::uuid, p_customer uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public.invoices; r public.receipts; b public.bank_lines; prior public.approvals; value numeric(15,2); run uuid := o2c_private.current_agent_run();
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
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
end $function$;

CREATE OR REPLACE FUNCTION public.run_agent_job(p_tenant uuid, p_entity uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare job public.agent_jobs; output jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if coalesce(public.member_role(p_tenant),'') not in ('maker','admin') then raise exception 'Forbidden'; end if;
  select * into job from public.agent_jobs where id=p_id and tenant_id=p_tenant and entity_id=p_entity and requested_by=auth.uid() for update;
  if not found then raise exception 'Forbidden'; end if;
  if job.status='completed' then return job.result; end if;
  with inv as (
    select i.*,c.name as customer,c.account,i.gross-coalesce((select sum(amount) from public.allocations where invoice_id=i.id),0) as open
    from public.invoices i join public.customers c on c.id=i.customer_id
    where i.tenant_id=p_tenant and i.entity_id=p_entity and i.lifecycle='posted'
  ) select case job.agent
    when 'ar' then jsonb_build_object('open',(select coalesce(sum(open),0)::text from inv),'overdue',(select coalesce(sum(open),0)::text from inv where due_date<job.as_of),'aging',(
      select jsonb_agg(jsonb_build_object('bucket',bucket,'amount',amount::text) order by rank) from (
        select bucket,rank,coalesce(sum(i.open),0) as amount from (values ('Current',0),('1–30',1),('31–60',2),('61–90',3),('90+',4)) b(bucket,rank)
        left join inv i on rank=case when i.due_date>=job.as_of then 0 when job.as_of-i.due_date<=30 then 1 when job.as_of-i.due_date<=60 then 2 when job.as_of-i.due_date<=90 then 3 else 4 end group by bucket,rank
      ) s),'dso',null,'credit_limits',null)
    when 'collections' then jsonb_build_object('candidate_count',(select count(*) from inv where open>0 and due_date<job.as_of and dispute='none'),
      'candidates',coalesce((select jsonb_agg(jsonb_build_object('invoice_id',id,'invoice',number,'customer',customer,'account',account,'open',open::text,'due_date',due_date,'version',version,'draft',
        'Please review the outstanding balance of AED '||open::text||' on invoice '||number||' due '||due_date::text||'. Please confirm the payment date or advise any dispute.') order by due_date,id)
        from (select * from inv where open>0 and due_date<job.as_of and dispute='none' order by due_date,id limit 100) s),'[]'::jsonb),'delivery','not sent','detail_limit',100)
    else jsonb_build_object('unposted_credits',(select count(*) from public.bank_lines b where tenant_id=p_tenant and entity_id=p_entity and direction='credit' and not exists(select 1 from public.receipts where bank_line_id=b.id)),
      'unapplied',(select coalesce(sum(r.amount-coalesce((select sum(amount) from public.allocations where receipt_id=r.id),0)),0)::text from public.receipts r where tenant_id=p_tenant and entity_id=p_entity),
      'candidates',coalesce((select jsonb_agg(jsonb_build_object('bank_line',b.id,'bank_reference',b.reference,'bank_amount',b.amount::text,'bank_version',b.version,'invoice',i.id,'invoice_number',i.number,'invoice_version',i.version,'customer',i.customer,'account',i.account,'basis','exact reference and amount; independent review required'))
        from (select * from public.bank_lines where tenant_id=p_tenant and entity_id=p_entity and direction='credit' order by booked_at,id limit 100) b join inv i on i.number=b.reference and i.open=b.amount
        where not exists(select 1 from public.receipts where bank_line_id=b.id)),'[]'::jsonb),'forecast','governed source runs only','detail_limit',100)
    end into output;
  output:=output||jsonb_build_object('agent',job.agent,'tenant_id',p_tenant,'entity_id',p_entity,'as_of',job.as_of,'observed_at',now(),'engine','deterministic-v1','ledger_posted',false,'requires_human_review',true);
  update public.agent_jobs set status='completed',result=output,completed_at=now() where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent.analyzed',p_id,jsonb_build_object('agent',job.agent,'engine','deterministic-v1','ledger_posted',false));
  return output;
end $function$;

CREATE OR REPLACE FUNCTION public.stage_import(p_tenant uuid, p_entity uuid, p_kind text, p_name text, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare entry jsonb; total_value numeric:=0; batch_id uuid; digest_value text;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
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
end $function$;

commit;
