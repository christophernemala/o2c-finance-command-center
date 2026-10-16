-- Agent operations: guardrails, incidents and the read models behind the operations screens.
-- Guardrails start in Monitor (record only). Every later stage change (Warn, Block, Rolled back)
-- is a new version that an independent approver must activate. Block-stage amount and deny rules
-- are enforced again here, on the approvals table, so a direct RPC by the agent cannot bypass them.
begin;

-- 1. Records ---------------------------------------------------------------------------------
alter table public.agent_steps drop constraint agent_steps_type_check;
alter table public.agent_steps add constraint agent_steps_type_check check(type in
  ('thinking','message','tool_call','tool_result','finding','proposal','auto_execution','error','guardrail'));

create table public.agent_guardrails (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null,
  name text not null check(length(name) between 3 and 120),
  kind text not null check(kind in ('deny_tool','max_amount','require_field','max_identical_calls')),
  agent_kind text check(agent_kind in ('collections','cash_application','credit_risk','reporting')),
  params jsonb not null check(jsonb_typeof(params)='object' and octet_length(params::text) <= 2048),
  created_by uuid not null references auth.users, created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create table public.agent_guardrail_versions (
  guardrail_id uuid not null references public.agent_guardrails, version integer not null check(version between 1 and 1000),
  tenant_id uuid not null, entity_id uuid not null,
  stage text not null check(stage in ('monitor','warn','block','rolled_back')),
  status text not null check(status in ('pending','active','rejected','superseded')),
  simulation jsonb check(simulation is null or octet_length(simulation::text) <= 8192),
  maker uuid not null references auth.users, checker uuid references auth.users,
  created_at timestamptz not null default now(), decided_at timestamptz,
  primary key(guardrail_id,version), check(checker is null or checker <> maker),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index agent_guardrail_one_active on public.agent_guardrail_versions(guardrail_id) where status='active';
create unique index agent_guardrail_one_pending on public.agent_guardrail_versions(guardrail_id) where status='pending';

create table public.agent_incidents (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, entity_id uuid not null,
  kind text not null check(kind in ('loop','tool_error_spike','stuck_run','model_stop','run_failed','guardrail_block')),
  severity text not null check(severity in ('critical','warning','info')),
  agent_kind text, run_id uuid not null references public.agent_runs, tool text,
  detail jsonb not null default '{}' check(octet_length(detail::text) <= 8192),
  cost_usd numeric(12,6), opened_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references auth.users,
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index agent_incidents_once on public.agent_incidents(tenant_id,entity_id,kind,run_id);
create index agent_incidents_open on public.agent_incidents(tenant_id,entity_id,opened_at desc) where resolved_at is null;
create index agent_steps_tool on public.agent_steps(tenant_id,entity_id,type,created_at);

alter table public.agent_guardrails enable row level security;
create policy scope_read on public.agent_guardrails for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.agent_guardrail_versions enable row level security;
create policy scope_read on public.agent_guardrail_versions for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.agent_incidents enable row level security;
create policy scope_read on public.agent_incidents for select to authenticated using(public.member_role(tenant_id) is not null);
revoke all on public.agent_guardrails,public.agent_guardrail_versions,public.agent_incidents from public,anon,authenticated;
grant select on public.agent_guardrails,public.agent_guardrail_versions,public.agent_incidents to authenticated;

-- 2. Rule validation and the active rule set -------------------------------------------------
create function o2c_private.check_guardrail(p_kind text,p_params jsonb) returns void language plpgsql immutable set search_path='' as $$
declare tools text[] := array['get_ar_overview','list_invoices','get_cash_match_candidates','get_ar_kpi_pack','propose_receipt',
  'propose_allocation','auto_post_if_policy_allows','record_finding','draft_collection_message'];
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

-- Rules in force for one agent kind, with the stage of their active version.
create function o2c_private.active_guardrails(p_tenant uuid,p_entity uuid,p_agent_kind text) returns table(
  id uuid, name text, kind text, params jsonb, stage text, version integer)
language sql stable security definer set search_path='' as $$
  select g.id,g.name,g.kind,g.params,v.stage,v.version from public.agent_guardrails g
  join public.agent_guardrail_versions v on v.guardrail_id=g.id and v.status='active'
  where g.tenant_id=p_tenant and g.entity_id=p_entity and v.stage<>'rolled_back'
    and (g.agent_kind is null or g.agent_kind=p_agent_kind)
$$;
revoke all on function o2c_private.check_guardrail(text,jsonb),o2c_private.active_guardrails(uuid,uuid,text) from public,anon,authenticated;

-- Defence in depth: block-stage deny and amount rules also stop agent proposals inserted by any path.
create function o2c_private.enforce_agent_guardrails() returns trigger language plpgsql security definer set search_path='' as $$
declare run public.agent_runs; tool text; rule record;
begin
  if new.agent_run_id is null then return new; end if;
  select * into run from public.agent_runs where id=new.agent_run_id;
  tool:=case new.kind when 'receipt' then 'propose_receipt' when 'allocation' then 'propose_allocation' end;
  for rule in select * from o2c_private.active_guardrails(new.tenant_id,new.entity_id,run.kind) where stage='block' loop
    if (rule.kind='deny_tool' and rule.params->>'tool'=tool)
      or (rule.kind='max_amount' and rule.params->>'tool'=tool and new.amount>(rule.params->>'limit')::numeric) then
      raise exception 'Blocked by guardrail: %', rule.name;
    end if;
  end loop;
  return new;
end $$;
create trigger approvals_agent_guardrails before insert on public.approvals for each row execute function o2c_private.enforce_agent_guardrails();
revoke all on function o2c_private.enforce_agent_guardrails() from public,anon,authenticated;

-- 3. Guardrail lifecycle ---------------------------------------------------------------------
create function public.propose_guardrail(p_tenant uuid,p_entity uuid,p_id uuid,p_name text,p_kind text,p_agent_kind text,p_params jsonb,p_simulation jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.agent_guardrails;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','approver','admin') then raise exception 'Forbidden'; end if;
  perform o2c_private.check_guardrail(p_kind,p_params);
  if p_agent_kind is not null and p_agent_kind not in ('collections','cash_application','credit_risk','reporting') then raise exception 'Invalid guardrail'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into prior from public.agent_guardrails where id=p_id;
  if found then
    if prior.tenant_id=p_tenant and prior.entity_id=p_entity and prior.created_by=auth.uid() and prior.kind=p_kind and prior.params=p_params
      and prior.agent_kind is not distinct from p_agent_kind then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  insert into public.agent_guardrails(id,tenant_id,entity_id,name,kind,agent_kind,params,created_by)
    values(p_id,p_tenant,p_entity,p_name,p_kind,p_agent_kind,p_params,auth.uid());
  -- Monitor only records; it starts active without a checker because it changes no outcome.
  insert into public.agent_guardrail_versions(guardrail_id,version,tenant_id,entity_id,stage,status,simulation,maker,decided_at)
    values(p_id,1,p_tenant,p_entity,'monitor','active',p_simulation,auth.uid(),now());
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'guardrail.created',p_id,
    jsonb_build_object('name',p_name,'kind',p_kind,'agent_kind',p_agent_kind,'params',p_params,'stage','monitor'));
  return p_id;
end $$;

create function public.propose_guardrail_stage(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer,p_stage text,p_simulation jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare current_v public.agent_guardrail_versions; prior public.agent_guardrail_versions;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','approver','admin') then raise exception 'Forbidden'; end if;
  if p_stage not in ('monitor','warn','block','rolled_back') then raise exception 'Invalid stage'; end if;
  perform 1 from public.agent_guardrails where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found then raise exception 'Guardrail unavailable'; end if;
  select * into prior from public.agent_guardrail_versions where guardrail_id=p_id and version=p_version;
  if found then
    if prior.maker=auth.uid() and prior.stage=p_stage then return p_version; end if;
    raise exception 'Idempotency key conflict';
  end if;
  select * into current_v from public.agent_guardrail_versions where guardrail_id=p_id and status='active';
  if p_version<>(select max(version)+1 from public.agent_guardrail_versions where guardrail_id=p_id) then raise exception 'Stale guardrail version'; end if;
  if exists(select 1 from public.agent_guardrail_versions where guardrail_id=p_id and status='pending') then raise exception 'A stage change is already pending'; end if;
  if current_v.stage=p_stage then raise exception 'Guardrail is already at this stage'; end if;
  insert into public.agent_guardrail_versions(guardrail_id,version,tenant_id,entity_id,stage,status,simulation,maker)
    values(p_id,p_version,p_tenant,p_entity,p_stage,'pending',p_simulation,auth.uid());
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'guardrail.stage_proposed',p_id,
    jsonb_build_object('version',p_version,'stage',p_stage,'from',current_v.stage));
  return p_version;
end $$;

create function public.decide_guardrail_stage(p_tenant uuid,p_entity uuid,p_id uuid,p_version integer,p_decision text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.agent_guardrail_versions;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if p_decision is null or p_decision not in ('active','rejected') then raise exception 'Invalid decision'; end if;
  select * into v from public.agent_guardrail_versions where guardrail_id=p_id and version=p_version and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or v.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if v.status=p_decision and v.checker=auth.uid() then return; end if;
  if v.status<>'pending' then raise exception 'Stage change is not pending'; end if;
  if p_decision='active' then
    update public.agent_guardrail_versions set status='superseded' where guardrail_id=p_id and status='active';
  end if;
  update public.agent_guardrail_versions set status=p_decision,checker=auth.uid(),decided_at=now() where guardrail_id=p_id and version=p_version;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'guardrail.stage_'||p_decision,p_id,
    jsonb_build_object('version',p_version,'stage',v.stage));
end $$;

-- 4. Simulation: deterministic replay of recorded tool calls, no model calls ---------------------
create function public.simulate_guardrail(p_tenant uuid,p_entity uuid,p_kind text,p_agent_kind text,p_params jsonb,p_days integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  perform o2c_private.check_guardrail(p_kind,p_params);
  if p_days is null or p_days not between 1 and 90 then raise exception 'Invalid window'; end if;
  with calls as (
    select s.run_id,s.seq,s.tool,s.detail->'input' as input,r.kind as agent_kind,r.cost_usd,
      row_number() over (partition by s.run_id,s.tool,s.detail->'input' order by s.seq) as nth,
      (select (res.detail->>'ok')::boolean from public.agent_steps res where res.run_id=s.run_id and res.seq>s.seq and res.type='tool_result'
        and res.tool=s.tool order by res.seq limit 1) as ok
    from public.agent_steps s join public.agent_runs r on r.id=s.run_id
    where s.tenant_id=p_tenant and s.entity_id=p_entity and s.type='tool_call' and s.created_at>now()-make_interval(days=>p_days)
      and (p_agent_kind is null or r.kind=p_agent_kind)
  ), hits as (
    select * from calls c where case p_kind
      when 'deny_tool' then c.tool=p_params->>'tool'
      when 'max_amount' then c.tool=p_params->>'tool' and coalesce(c.input->>'amount','') ~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$'
        and (c.input->>'amount')::numeric>(p_params->>'limit')::numeric
      when 'require_field' then c.tool=p_params->>'tool' and coalesce(nullif(c.input->>(p_params->>'field'),''),'')=''
      else c.nth>(p_params->>'limit')::integer end
  )
  select jsonb_build_object('days',p_days,'calls_replayed',(select count(*) from calls),'would_act_on',(select count(*) from hits),
    'failures_caught',(select count(*) from hits where ok is false),'false_positives',(select count(*) from hits where ok is true),
    'total_failures',(select count(*) from calls where ok is false),'runs_affected',(select count(distinct run_id) from hits),
    'cost_of_affected_runs_usd',(select coalesce(sum(cost_usd),0)::text from (select distinct run_id,cost_usd from hits) h))
  into result;
  return result;
end $$;

-- 5. Incident detectors ------------------------------------------------------------------------
create function o2c_private.detect_agent_incidents(p_tenant uuid,p_entity uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare added integer := 0; n integer;
begin
  insert into public.agent_incidents(tenant_id,entity_id,kind,severity,agent_kind,run_id,tool,detail,cost_usd)
    select distinct on (r.id) r.tenant_id,r.entity_id,'loop','warning',r.kind,r.id,s.tool,jsonb_build_object('calls',count(*),'input',s.detail->'input'),r.cost_usd
    from public.agent_runs r join public.agent_steps s on s.run_id=r.id and s.type='tool_call'
    where r.tenant_id=p_tenant and r.entity_id=p_entity and r.created_at>now()-interval '7 days'
    group by r.id,s.tool,s.detail->'input' having count(*)>=3 order by r.id,count(*) desc
    on conflict do nothing;
  get diagnostics n = row_count; added:=added+n;
  insert into public.agent_incidents(tenant_id,entity_id,kind,severity,agent_kind,run_id,detail,cost_usd)
    select r.tenant_id,r.entity_id,'tool_error_spike','warning',r.kind,r.id,
      jsonb_build_object('failed',count(*) filter (where s.detail->>'ok'='false'),'results',count(*)),r.cost_usd
    from public.agent_runs r join public.agent_steps s on s.run_id=r.id and s.type='tool_result'
    where r.tenant_id=p_tenant and r.entity_id=p_entity and r.created_at>now()-interval '7 days'
    group by r.id having count(*) filter (where s.detail->>'ok'='false')>=3 and count(*) filter (where s.detail->>'ok'='false')*2>=count(*)
    on conflict do nothing;
  get diagnostics n = row_count; added:=added+n;
  -- Stuck means no step recorded for 10 minutes while still running, not merely a long run.
  insert into public.agent_incidents(tenant_id,entity_id,kind,severity,agent_kind,run_id,detail,cost_usd)
    select tenant_id,entity_id,'stuck_run','critical',kind,id,jsonb_build_object('last_activity',updated_at,'steps',step_count),cost_usd
    from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and status='running' and updated_at<now()-interval '10 minutes'
    on conflict do nothing;
  get diagnostics n = row_count; added:=added+n;
  insert into public.agent_incidents(tenant_id,entity_id,kind,severity,agent_kind,run_id,detail,cost_usd)
    select tenant_id,entity_id,
      case when error ~* '(declined|output limit|model turns)' then 'model_stop' else 'run_failed' end,
      case when error ~* '(declined|output limit|model turns)' then 'warning' else 'critical' end,
      kind,id,jsonb_build_object('error',left(error,500)),cost_usd
    from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and kind is not null and status='failed' and created_at>now()-interval '7 days'
    on conflict do nothing;
  get diagnostics n = row_count; added:=added+n;
  insert into public.agent_incidents(tenant_id,entity_id,kind,severity,agent_kind,run_id,tool,detail,cost_usd)
    select distinct on (r.id) r.tenant_id,r.entity_id,'guardrail_block','info',r.kind,r.id,s.tool,
      jsonb_build_object('rule_id',s.detail->>'rule_id','rule',s.detail->>'rule','reason',s.detail->>'reason'),r.cost_usd
    from public.agent_runs r join public.agent_steps s on s.run_id=r.id and s.type='guardrail' and s.detail->>'action'='blocked'
    where r.tenant_id=p_tenant and r.entity_id=p_entity and r.created_at>now()-interval '7 days'
    order by r.id,s.seq
    on conflict do nothing;
  get diagnostics n = row_count; added:=added+n;
  return added;
end $$;

-- Cron sweep across every entity with recent runs (trusted server role only).
create function o2c_private.detect_all_agent_incidents() returns integer
language plpgsql security definer set search_path='' as $$
declare e record; total integer := 0;
begin
  for e in select distinct tenant_id,entity_id from public.agent_runs where kind is not null and created_at>now()-interval '7 days' loop
    total:=total+o2c_private.detect_agent_incidents(e.tenant_id,e.entity_id);
  end loop;
  return total;
end $$;
revoke all on function o2c_private.detect_agent_incidents(uuid,uuid),o2c_private.detect_all_agent_incidents() from public,anon,authenticated;
grant execute on function o2c_private.detect_all_agent_incidents() to o2c_app;

-- Finishing a run now also runs the detectors for its entity, before the agent session ends.
create or replace function public.agent_finish_run(p_tenant uuid,p_entity uuid,p_run uuid,p_status text,p_summary text,p_model text,
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
  perform o2c_private.detect_agent_incidents(p_tenant,p_entity);
  delete from auth.sessions where token_hash=current_setting('o2c.session_hash',true);
  return final;
end $$;

create function public.resolve_agent_incident(p_tenant uuid,p_entity uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  update public.agent_incidents set resolved_at=coalesce(resolved_at,now()),resolved_by=coalesce(resolved_by,auth.uid())
    where id=p_id and tenant_id=p_tenant and entity_id=p_entity;
  if not found then raise exception 'Incident unavailable'; end if;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'agent_incident.resolved',p_id,'{}');
end $$;

-- 6. Read models -------------------------------------------------------------------------------
create function public.agent_guardrails_active(p_tenant uuid,p_entity uuid,p_agent_kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'params',params,'stage',stage,'version',version) order by name,id)
    from o2c_private.active_guardrails(p_tenant,p_entity,p_agent_kind)),'[]');
end $$;

create function public.agent_guardrails_list(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'kind',g.kind,'agent_kind',g.agent_kind,'params',g.params,
      'created_by',g.created_by,'created_at',g.created_at,
      'versions',(select jsonb_agg(jsonb_build_object('version',v.version,'stage',v.stage,'status',v.status,'simulation',v.simulation,'maker',v.maker,
        'checker',v.checker,'created_at',v.created_at,'decided_at',v.decided_at) order by v.version) from public.agent_guardrail_versions v where v.guardrail_id=g.id))
      order by g.created_at desc,g.id)
    from public.agent_guardrails g where g.tenant_id=p_tenant and g.entity_id=p_entity),'[]');
end $$;

create function public.agent_incidents_list(p_tenant uuid,p_entity uuid,p_status text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_status not in ('open','resolved','all') then raise exception 'Invalid filter'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'severity',severity,'agent_kind',agent_kind,'run_id',run_id,'tool',tool,
      'detail',detail,'cost_usd',cost_usd::text,'opened_at',opened_at,'resolved_at',resolved_at,'resolved_by',resolved_by) order by opened_at desc,id)
    from (select * from public.agent_incidents where tenant_id=p_tenant and entity_id=p_entity
      and (p_status='all' or (p_status='open')=(resolved_at is null)) order by opened_at desc,id limit 200) i),'[]');
end $$;

-- Headline figures and health inputs for a window. Health is null until one run has finished.
create function public.agent_ops_overview(p_tenant uuid,p_entity uuid,p_hours integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz; finished integer; succeeded integer; results integer; errors integer; oldest_hours numeric;
  crit integer; warn integer; s_run numeric; s_age numeric; s_inc numeric; s_tool numeric;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_hours is null or p_hours not between 1 and 2160 then raise exception 'Invalid window'; end if;
  since:=now()-make_interval(hours=>p_hours);
  select count(*) filter (where status in ('succeeded','awaiting_approval','failed')),count(*) filter (where status in ('succeeded','awaiting_approval'))
    into finished,succeeded from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and kind is not null and created_at>since;
  select count(*),count(*) filter (where detail->>'ok'='false') into results,errors
    from public.agent_steps where tenant_id=p_tenant and entity_id=p_entity and type='tool_result' and created_at>since;
  select extract(epoch from now()-min(created_at))/3600 into oldest_hours from public.approvals where tenant_id=p_tenant and entity_id=p_entity and status='pending';
  select count(*) filter (where severity='critical'),count(*) filter (where severity='warning') into crit,warn
    from public.agent_incidents where tenant_id=p_tenant and entity_id=p_entity and resolved_at is null;
  if finished>0 then
    s_run:=100.0*succeeded/finished;
    s_age:=case when oldest_hours is null or oldest_hours<=4 then 100 else greatest(0,100-(oldest_hours-4)*100/44) end;
    s_inc:=greatest(0,100-40*crit-15*warn);
    s_tool:=case when results=0 then 100 else 100.0*(results-errors)/results end;
  end if;
  return jsonb_build_object('window_hours',p_hours,
    'runs',jsonb_build_object('finished',finished,'succeeded',succeeded,
      'running',(select count(*) from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and status in ('queued','running')),
      'median_seconds',(select round(percentile_cont(0.5) within group (order by extract(epoch from finished_at-started_at))::numeric,1)
        from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and kind is not null and created_at>since and finished_at is not null and started_at is not null),
      'p95_seconds',(select round(percentile_cont(0.95) within group (order by extract(epoch from finished_at-started_at))::numeric,1)
        from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and kind is not null and created_at>since and finished_at is not null and started_at is not null)),
    'approvals',jsonb_build_object('pending',(select count(*) from public.approvals where tenant_id=p_tenant and entity_id=p_entity and status='pending'),
      'oldest_hours',round(oldest_hours,1)),
    'auto_posted_today',(select coalesce(sum(j.amount),0)::text from public.journals j join public.approvals x on x.id=j.approval_id
      where j.tenant_id=p_tenant and j.entity_id=p_entity and x.checker_basis='policy' and (j.created_at at time zone 'Asia/Dubai')::date=o2c_private.dubai_today()),
    'cost_usd',(select coalesce(sum(cost_usd),0)::text from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and created_at>since),
    'cost_by_agent',coalesce((select jsonb_object_agg(kind,cost) from (select kind,coalesce(sum(cost_usd),0)::text as cost from public.agent_runs
      where tenant_id=p_tenant and entity_id=p_entity and kind is not null and created_at>since group by kind) c),'{}'),
    'tools',jsonb_build_object('results',results,'errors',errors),
    'incidents',jsonb_build_object('open_critical',crit,'open_warning',warn),
    -- Send success joins the formula when outbound email ships; until then the weights are renormalised over 85.
    'health',case when finished=0 then null else jsonb_build_object(
      'score',round((30*s_run+20*s_age+20*s_inc+15*s_tool)/85),
      'inputs',jsonb_build_object('run_success',round(s_run,1),'approval_age',round(s_age,1),'incidents',round(s_inc,1),'tool_errors',round(s_tool,1)),
      'weights',jsonb_build_object('run_success',30,'approval_age',20,'incidents',20,'tool_errors',15)) end);
end $$;

-- Agent-to-tool handoffs with volume, success and median latency.
create function public.agent_edges(p_tenant uuid,p_entity uuid,p_hours integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_hours is null or p_hours not between 1 and 2160 then raise exception 'Invalid window'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('agent',kind,'tool',tool,'calls',calls,'ok',ok,'failed',calls-ok,'p50_ms',p50) order by kind,tool)
    from (select r.kind,s.tool,count(*) as calls,count(*) filter (where s.detail->>'ok'='true') as ok,
        round(percentile_cont(0.5) within group (order by s.duration_ms)) as p50
      from public.agent_steps s join public.agent_runs r on r.id=s.run_id
      where s.tenant_id=p_tenant and s.entity_id=p_entity and s.type='tool_result' and s.created_at>now()-make_interval(hours=>p_hours)
      group by r.kind,s.tool) e),'[]');
end $$;

-- Recent failed handoffs on one edge with the input the agent sent, for the context comparison.
create function public.edge_failures(p_tenant uuid,p_entity uuid,p_agent_kind text,p_tool text,p_hours integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_hours is null or p_hours not between 1 and 2160 then raise exception 'Invalid window'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('run_id',run_id,'seq',seq,'at',created_at,'error',output,'input',input) order by created_at desc)
    from (select s.run_id,s.seq,s.created_at,s.detail->>'output' as output,
        (select c.detail->'input' from public.agent_steps c where c.run_id=s.run_id and c.seq<s.seq and c.type='tool_call' and c.tool=s.tool order by c.seq desc limit 1) as input
      from public.agent_steps s join public.agent_runs r on r.id=s.run_id
      where s.tenant_id=p_tenant and s.entity_id=p_entity and s.type='tool_result' and s.tool=p_tool and r.kind=p_agent_kind
        and s.detail->>'ok'='false' and s.created_at>now()-make_interval(hours=>p_hours)
      order by s.created_at desc limit 20) f),'[]');
end $$;

-- 7. Grants --------------------------------------------------------------------------------------
revoke all on function public.propose_guardrail(uuid,uuid,uuid,text,text,text,jsonb,jsonb),public.propose_guardrail_stage(uuid,uuid,uuid,integer,text,jsonb),
  public.decide_guardrail_stage(uuid,uuid,uuid,integer,text),public.simulate_guardrail(uuid,uuid,text,text,jsonb,integer),
  public.resolve_agent_incident(uuid,uuid,uuid),public.agent_guardrails_active(uuid,uuid,text),public.agent_guardrails_list(uuid,uuid),
  public.agent_incidents_list(uuid,uuid,text),public.agent_ops_overview(uuid,uuid,integer),public.agent_edges(uuid,uuid,integer),
  public.edge_failures(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.propose_guardrail(uuid,uuid,uuid,text,text,text,jsonb,jsonb),public.propose_guardrail_stage(uuid,uuid,uuid,integer,text,jsonb),
  public.decide_guardrail_stage(uuid,uuid,uuid,integer,text),public.simulate_guardrail(uuid,uuid,text,text,jsonb,integer),
  public.resolve_agent_incident(uuid,uuid,uuid),public.agent_guardrails_active(uuid,uuid,text),public.agent_guardrails_list(uuid,uuid),
  public.agent_incidents_list(uuid,uuid,text),public.agent_ops_overview(uuid,uuid,integer),public.agent_edges(uuid,uuid,integer),
  public.edge_failures(uuid,uuid,text,text,integer) to authenticated;
commit;
