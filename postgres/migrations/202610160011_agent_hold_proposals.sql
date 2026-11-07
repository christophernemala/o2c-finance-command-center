-- Agent credit holds become proposals. AGENTS.md: agents read, propose and record findings; they never
-- execute without a human checker. place_customer_hold called by the agent identity now records a pending
-- proposal; a human approver or admin activates it (which places the hold, still marked placed_by_kind
-- 'agent' and carrying the approver) or rejects it. Human-placed holds are unchanged.
begin;

alter table public.customer_holds add column approved_by uuid references auth.users;

create table public.customer_hold_proposals (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  reason text not null check(length(reason) between 5 and 500),
  proposed_by uuid not null references auth.users, agent_run_id uuid not null references public.agent_runs,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  decided_by uuid references auth.users, decided_at timestamptz, decision_note text check(length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  check((status='pending') = (decided_by is null)), check((decided_by is null) = (decided_at is null)),
  check(decided_by is null or decided_by <> proposed_by),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index customer_hold_proposals_one_pending on public.customer_hold_proposals(customer_id) where status='pending';
create index customer_hold_proposals_run on public.customer_hold_proposals(agent_run_id);
alter table public.customer_hold_proposals enable row level security;
create policy scope_read on public.customer_hold_proposals for select to authenticated using(public.member_role(tenant_id) is not null);
revoke all on public.customer_hold_proposals from public,anon,authenticated;
grant select on public.customer_hold_proposals to authenticated;

-- The agent proposes; people place. Returns the open hold or pending proposal when one already exists.
create or replace function public.place_customer_hold(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); run uuid := o2c_private.current_agent_run(); prior uuid;
begin
  if role not in ('maker','approver','admin','agent') or (role='agent' and run is null) then raise exception 'Forbidden'; end if;
  if role='agent' then perform o2c_private.assert_agent_tool_allowed(p_tenant,p_entity,run,'place_credit_hold'); end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  select id into prior from public.customer_holds where customer_id=p_customer and released_at is null;
  if found then return prior; end if;
  if role='agent' then
    select id into prior from public.customer_hold_proposals where customer_id=p_customer and status='pending';
    if found then return prior; end if;
    if exists(select 1 from public.customer_hold_proposals where id=p_id) then raise exception 'Idempotency key conflict'; end if;
    insert into public.customer_hold_proposals(id,tenant_id,entity_id,customer_id,reason,proposed_by,agent_run_id)
      values(p_id,p_tenant,p_entity,p_customer,p_reason,auth.uid(),run);
    insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_hold.proposed',p_id,
      jsonb_build_object('customer_id',p_customer,'agent_run_id',run,'reason',p_reason));
    return p_id;
  end if;
  insert into public.customer_holds(id,tenant_id,entity_id,customer_id,reason,placed_by,placed_by_kind)
    values(p_id,p_tenant,p_entity,p_customer,p_reason,auth.uid(),'human');
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_hold.placed',p_id,
    jsonb_build_object('customer_id',p_customer,'by','human','reason',p_reason));
  return p_id;
end $$;

-- A human approver or admin decides. Approval places the hold unless one is already open; a replay of the
-- same decision returns quietly.
create function public.decide_hold_proposal(p_tenant uuid,p_entity uuid,p_id uuid,p_decision text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.customer_hold_proposals;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if (select kind from auth.users where id=auth.uid())<>'human' then raise exception 'Forbidden'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  if p_decision='rejected' and (p_note is null or length(trim(p_note))<5) then raise exception 'A rejection reason is required'; end if;
  select * into p from public.customer_hold_proposals where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or p.proposed_by=auth.uid() then raise exception 'Independent checker required'; end if;
  if p.status=p_decision then return; end if;
  if p.status<>'pending' then raise exception 'Proposal already decided'; end if;
  update public.customer_hold_proposals set status=p_decision,decided_by=auth.uid(),decided_at=now(),decision_note=left(p_note,500) where id=p_id;
  if p_decision='approved' and not exists(select 1 from public.customer_holds where customer_id=p.customer_id and released_at is null) then
    insert into public.customer_holds(id,tenant_id,entity_id,customer_id,reason,placed_by,placed_by_kind,agent_run_id,approved_by)
      values(p.id,p_tenant,p_entity,p.customer_id,p.reason,p.proposed_by,'agent',p.agent_run_id,auth.uid());
  end if;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'credit_hold.proposal_'||p_decision,p_id,
    jsonb_build_object('customer_id',p.customer_id,'agent_run_id',p.agent_run_id,'note',p_note));
end $$;

create function public.hold_proposals_list(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'customer_id',p.customer_id,'customer',c.name,'account',c.account,'reason',p.reason,
      'agent_run_id',p.agent_run_id,'proposed_by',p.proposed_by,'created_at',p.created_at) order by p.created_at)
    from public.customer_hold_proposals p join public.customers c on c.id=p.customer_id
    where p.tenant_id=p_tenant and p.entity_id=p_entity and p.status='pending'),'[]');
end $$;

-- Pending hold proposals keep the run awaiting approval, like other agent proposals.
create or replace function public.agent_finish_run(p_tenant uuid,p_entity uuid,p_run uuid,p_status text,p_summary text,p_model text,
  p_input_tokens integer,p_output_tokens integer,p_cache_read_tokens integer,p_cost text,p_error text) returns text
language plpgsql security definer set search_path='' as $$
declare run public.agent_runs := o2c_private.require_run(p_tenant,p_entity,p_run); final text;
begin
  if p_status not in ('succeeded','failed') then raise exception 'Invalid status'; end if;
  if p_cost is not null and p_cost !~ '^[0-9]{1,6}(\.[0-9]{1,6})?$' then raise exception 'Invalid cost'; end if;
  final:=case when p_status='succeeded' and (exists(select 1 from public.approvals where agent_run_id=p_run and status='pending')
    or exists(select 1 from public.adjustment_notes where agent_run_id=p_run and status='pending')
    or exists(select 1 from public.collection_messages where agent_run_id=p_run and status='pending')
    or exists(select 1 from public.customer_hold_proposals where agent_run_id=p_run and status='pending')) then 'awaiting_approval' else p_status end;
  update public.agent_runs set status=final,summary=left(p_summary,20000),model=left(p_model,100),input_tokens=greatest(coalesce(p_input_tokens,0),0),
    output_tokens=greatest(coalesce(p_output_tokens,0),0),cache_read_tokens=greatest(coalesce(p_cache_read_tokens,0),0),cost_usd=p_cost::numeric,
    error=left(p_error,2000),finished_at=now(),updated_at=now() where id=p_run;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent.run.'||final,p_run,
    jsonb_build_object('kind',run.kind,'model',p_model,'steps',run.step_count,'cost_usd',p_cost));
  perform o2c_private.detect_agent_incidents(p_tenant,p_entity);
  delete from auth.sessions where token_hash=current_setting('o2c.session_hash',true);
  return final;
end $$;

revoke all on function public.decide_hold_proposal(uuid,uuid,uuid,text,text),public.hold_proposals_list(uuid,uuid) from public,anon;
grant execute on function public.decide_hold_proposal(uuid,uuid,uuid,text,text),public.hold_proposals_list(uuid,uuid) to authenticated;

commit;
