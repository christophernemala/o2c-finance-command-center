-- Governed deterministic analysis; no ledger writes, email delivery or fabricated inputs.
begin;
create table public.agent_jobs (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null,
  agent text not null check(agent in ('ar','collections','treasury')),
  requested_by uuid not null references auth.users(id),
  status text not null default 'queued' check(status in ('queued','completed')),
  as_of date not null, result jsonb,
  created_at timestamptz not null default now(), completed_at timestamptz,
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id),
  check((status='queued' and result is null and completed_at is null) or (status='completed' and result is not null and completed_at is not null))
);
create index agent_jobs_scope on public.agent_jobs(tenant_id,entity_id,created_at desc,id);
alter table public.agent_jobs enable row level security;
create policy agent_job_read on public.agent_jobs for select to authenticated using(public.member_role(tenant_id) is not null);
revoke all on public.agent_jobs from public,anon,authenticated;
grant select on public.agent_jobs to authenticated;
create function public.enqueue_agent_job(p_tenant uuid,p_entity uuid,p_id uuid,p_agent text,p_as_of date) returns uuid
language plpgsql security definer set search_path='' as $$
declare prior public.agent_jobs;
begin
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
end $$;
create function public.run_agent_job(p_tenant uuid,p_entity uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.agent_jobs; output jsonb;
begin
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
end $$;
revoke all on function public.enqueue_agent_job(uuid,uuid,uuid,text,date),public.run_agent_job(uuid,uuid,uuid) from public,anon;
grant execute on function public.enqueue_agent_job(uuid,uuid,uuid,text,date),public.run_agent_job(uuid,uuid,uuid) to authenticated;
commit;
