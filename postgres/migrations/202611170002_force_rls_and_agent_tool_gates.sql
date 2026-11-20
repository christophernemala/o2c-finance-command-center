-- Force row policies even for table owners; normal sessions are tenant + selected-entity scoped.
-- A dedicated NOLOGIN worker owns only reviewed system-wide routines. It is not granted to the runtime login.
-- Agent tool authorization and write-gate consumption are persisted by PostgreSQL before any tool effect.
begin;

-- The worker principal must be installed by the database administrator before this migration.
do $$
declare r pg_roles%rowtype; current_is_super boolean;
begin
  select * into r from pg_roles where rolname='o2c_worker';
  select rolsuper into current_is_super from pg_roles where rolname=current_user;
  if r.rolname is null or r.rolcanlogin or r.rolsuper or not r.rolbypassrls then
    raise exception 'Create o2c_worker as NOLOGIN NOSUPERUSER BYPASSRLS before this migration';
  end if;
  if not coalesce(current_is_super,false) and current_user<>'o2c_worker' and not pg_has_role(current_user,'o2c_worker','MEMBER') then
    raise exception 'Grant o2c_worker to the schema migration role before this migration';
  end if;
  if exists(select 1 from pg_roles where rolname='o2c_app') then
    if pg_has_role('o2c_app','o2c_worker','MEMBER') then raise exception 'Do not grant o2c_worker to o2c_app or the runtime role'; end if;
  end if;
  if exists(select 1 from pg_roles where rolname='o2c_runtime') then
    if pg_has_role('o2c_runtime','o2c_worker','MEMBER') then raise exception 'Do not grant o2c_worker to o2c_runtime'; end if;
  end if;
end $$;

-- FORCE RLS applies to table owners. Only the selected entity is visible in a normal user transaction.
create or replace function public.source_entity_access(p_tenant uuid,p_entity uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null
    and current_setting('o2c.tenant_id',true)=p_tenant::text
    and current_setting('o2c.entity_id',true)=p_entity::text
    and public.member_role(p_tenant) is not null
    and exists(select 1 from public.entities e where e.tenant_id=p_tenant and e.id=p_entity)
$$;
revoke all on function public.source_entity_access(uuid,uuid) from public,anon;
grant execute on function public.source_entity_access(uuid,uuid) to authenticated;

-- All ordinary tenant/entity business tables share one strict predicate. The original cashflow and
-- agent-job policies were membership-only; selected-entity scoping is now the intended boundary.
do $$
declare t record; pol record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='tenant_id' and a.attnum>0 and not a.attisdropped)
      and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='entity_id' and a.attnum>0 and not a.attisdropped)
      and c.relname not in ('source_files','copilot_threads','copilot_files')
  loop
    execute format('alter table public.%I enable row level security',t.relname);
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t.relname loop
      execute format('drop policy %I on public.%I',pol.policyname,t.relname);
    end loop;
    execute format(
      'create policy selected_entity_scope on public.%I for all to public using ('||
      'tenant_id=nullif(current_setting(''o2c.tenant_id'',true),'''')::uuid '||
      'and entity_id=nullif(current_setting(''o2c.entity_id'',true),'''')::uuid '||
      'and public.member_role(tenant_id) is not null) with check ('||
      'tenant_id=nullif(current_setting(''o2c.tenant_id'',true),'''')::uuid '||
      'and entity_id=nullif(current_setting(''o2c.entity_id'',true),'''')::uuid '||
      'and public.member_role(tenant_id) is not null)',t.relname);
  end loop;
end $$;

-- Tenant and entity discovery remains membership-based so users can switch entities;
-- finance records remain scoped to exactly one selected entity. Writes are available only to the worker.
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='tenants' loop
    execute format('drop policy %I on public.tenants',pol.policyname);
  end loop;
  for pol in select policyname from pg_policies where schemaname='public' and tablename='memberships' loop
    execute format('drop policy %I on public.memberships',pol.policyname);
  end loop;
  for pol in select policyname from pg_policies where schemaname='public' and tablename='entities' loop
    execute format('drop policy %I on public.entities',pol.policyname);
  end loop;
end $$;
alter table public.tenants enable row level security;
alter table public.memberships enable row level security;
alter table public.entities enable row level security;
create policy tenant_member_read on public.tenants for select to public
  using(public.member_role(id) is not null);
create policy tenant_worker_write on public.tenants for all to public
  using(current_user='o2c_worker') with check(current_user='o2c_worker');
create policy membership_self_or_scoped_read on public.memberships for select to public using(
  user_id=auth.uid() or (auth.uid() is not null and tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
    and current_user<>'authenticated'));
create policy membership_worker_write on public.memberships for all to public
  using(current_user='o2c_worker') with check(current_user='o2c_worker');
create policy entity_member_read on public.entities for select to public using(
  tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
  and public.member_role(tenant_id) is not null);
create policy entity_worker_write on public.entities for all to public
  using(current_user='o2c_worker') with check(current_user='o2c_worker');

-- User-owned Copilot records remain private and are additionally limited to the selected entity.
do $$ declare t text; pol record; begin
  foreach t in array array['copilot_threads','copilot_messages','copilot_files'] loop
    for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I',pol.policyname,t);
    end loop;
  end loop;
end $$;
create policy copilot_threads_owner_scope on public.copilot_threads for all to public
  using(user_id=auth.uid() and tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
    and entity_id=nullif(current_setting('o2c.entity_id',true),'')::uuid)
  with check(user_id=auth.uid() and tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
    and entity_id=nullif(current_setting('o2c.entity_id',true),'')::uuid);
create policy copilot_messages_owner_scope on public.copilot_messages for all to public
  using(exists(select 1 from public.copilot_threads t where t.id=thread_id and t.user_id=auth.uid()
    and t.tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
    and t.entity_id=nullif(current_setting('o2c.entity_id',true),'')::uuid))
  with check(exists(select 1 from public.copilot_threads t where t.id=thread_id and t.user_id=auth.uid()
    and t.tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
    and t.entity_id=nullif(current_setting('o2c.entity_id',true),'')::uuid));
create policy copilot_files_owner_scope on public.copilot_files for all to public
  using(user_id=auth.uid() and tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
    and entity_id=nullif(current_setting('o2c.entity_id',true),'')::uuid)
  with check(user_id=auth.uid() and tenant_id=nullif(current_setting('o2c.tenant_id',true),'')::uuid
    and entity_id=nullif(current_setting('o2c.entity_id',true),'')::uuid);

-- Source originals have a distinct maker/admin insert contract.
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='source_files' loop
    execute format('drop policy %I on public.source_files',pol.policyname);
  end loop;
end $$;
create policy source_read_selected_entity on public.source_files for select to public
  using(public.source_entity_access(tenant_id,entity_id));
create policy source_insert_selected_entity on public.source_files for insert to public
  with check(uploaded_by=auth.uid() and public.member_role(tenant_id) in ('maker','admin')
    and public.source_entity_access(tenant_id,entity_id));

-- Profile access remains per-user. Enable and force RLS on every public table,
-- including any future table without entity columns or an existing policy.
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='profiles' loop
    execute format('drop policy %I on public.profiles',pol.policyname);
  end loop;
end $$;
create policy profiles_read_self on public.profiles for select to public using(id=auth.uid());
create policy profiles_update_self on public.profiles for update to public
  using(id=auth.uid()) with check(id=auth.uid());
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') loop
    execute format('alter table public.%I enable row level security',t.relname);
    execute format('alter table public.%I force row level security',t.relname);
  end loop;
end $$;

-- The NOLOGIN worker owns only trusted background routines and restricted provisioning procedures.
-- It has no membership granted to the runtime login; public execution remains revoked.
grant usage on schema public,o2c_private,auth to o2c_worker;
grant all privileges on all tables in schema public,o2c_private,auth to o2c_worker;
grant all privileges on all sequences in schema public,o2c_private,auth to o2c_worker;
grant execute on all functions in schema public,o2c_private,auth to o2c_worker;

create function o2c_private.provision_tenant(p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_name is null or length(trim(p_name)) not between 1 and 200 then raise exception 'Invalid tenant name'; end if;
  insert into public.tenants(name) values(trim(p_name)) returning id into result;
  return result;
end $$;
create function o2c_private.provision_entity(p_tenant uuid,p_name text,p_currency text default 'AED') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if p_name is null or length(trim(p_name)) not between 1 and 200 or p_currency<>'AED' then raise exception 'Invalid legal entity'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant) then raise exception 'Tenant unavailable'; end if;
  insert into public.entities(tenant_id,name,currency) values(p_tenant,trim(p_name),p_currency) returning id into result;
  return result;
end $$;
create function o2c_private.provision_membership(p_tenant uuid,p_user uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_role not in ('viewer','maker','approver','admin') then raise exception 'Invalid membership role'; end if;
  if not exists(select 1 from public.tenants where id=p_tenant)
    or not exists(select 1 from auth.users where id=p_user) then raise exception 'Tenant or user unavailable'; end if;
  insert into public.memberships(tenant_id,user_id,role) values(p_tenant,p_user,p_role)
    on conflict(tenant_id,user_id) do update set role=excluded.role;
end $$;

-- Set the dedicated BYPASSRLS owner only on the enumerated system-wide routines.
-- The membership lookup also needs to read the authenticated user's membership when no entity
-- context exists (for the workspace/entity switcher), while returning only that user's role.
grant create on schema public,o2c_private,auth to o2c_worker;
do $$ declare f record; begin
  for f in
    select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='public' and p.proname='member_role')
      or (n.nspname='o2c_private' and (p.proname=any(array[
      'claim_agent_run','schedule_due_runs','expire_stale_runs','skip_agent_runs','detect_all_agent_incidents',
      'claim_collection_messages','complete_collection_message','message_statement','sync_auth_profile'])
      or p.proname in ('provision_tenant','provision_entity','provision_membership')))
  loop
    execute format('alter function %s owner to o2c_worker',f.signature);
  end loop;
end $$;
revoke create on schema public,o2c_private,auth from o2c_worker;

revoke all on function o2c_private.provision_tenant(text),o2c_private.provision_entity(uuid,text,text),
  o2c_private.provision_membership(uuid,uuid,text) from public,anon,authenticated,o2c_app;
do $$ begin
  execute format('grant execute on function o2c_private.provision_tenant(text),o2c_private.provision_entity(uuid,text,text),o2c_private.provision_membership(uuid,uuid,text) to %I',current_user);
end $$;

-- Each agent run can authorize tools only through this SQL gate. Calls and guardrail outcomes are
-- written to the same immutable run-step sequence before the application executes a tool.
create table o2c_private.agent_tool_gate_consumptions (
  run_id uuid not null, seq integer not null, consumer text not null,
  consumed_at timestamptz not null default now(), primary key(run_id,seq),
  foreign key(run_id,seq) references public.agent_steps(run_id,seq)
);

create function public.agent_authorize_tool(p_tenant uuid,p_entity uuid,p_run uuid,p_tool text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.agent_runs := o2c_private.require_run(p_tenant,p_entity,p_run);
  allowed_tools text[] := array['get_ar_overview','list_invoices','get_cash_match_candidates','get_ar_kpi_pack','propose_receipt',
    'propose_allocation','auto_post_if_policy_allows','record_finding','propose_collection_message','get_collections_worklist',
    'get_customer_account','place_credit_hold','get_outstanding_breakdown','get_short_payment_candidates','propose_credit_note'];
  next_seq integer; call_seq integer; identical integer; rule record; reason text; action text; input_hash text;
  hits jsonb:='[]'::jsonb; block jsonb:=null; hit jsonb;
begin
  if p_tool is null or not (p_tool=any(allowed_tools)) or p_input is null or jsonb_typeof(p_input)<>'object'
    or octet_length(p_input::text)>32768 then
    raise exception 'Invalid agent tool call';
  end if;
  perform 1 from public.agent_runs where id=p_run for update;
  input_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_tool||pg_catalog.chr(10)||p_input::text,'UTF8')),'hex');
  select count(*)::integer+1 into identical from public.agent_steps
    where run_id=p_run and tenant_id=p_tenant and entity_id=p_entity and type='tool_call'
      and tool=p_tool and detail->'input'=p_input;
  next_seq:=run.step_count+1; call_seq:=next_seq;
  insert into public.agent_steps(run_id,seq,tenant_id,entity_id,type,tool,detail)
    values(p_run,call_seq,p_tenant,p_entity,'tool_call',p_tool,jsonb_build_object('input',p_input,'input_hash',input_hash));
  for rule in select * from o2c_private.active_guardrails(p_tenant,p_entity,run.kind)
    where stage in ('monitor','warn','block') order by version,id loop
    reason:=null;
    if rule.kind='deny_tool' and rule.params->>'tool'=p_tool then reason:='Tool denied by an active rule';
    elsif rule.kind='max_amount' and rule.params->>'tool'=p_tool then
      if coalesce(p_input->>'amount','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$'
        or (p_input->>'amount')::numeric>(rule.params->>'limit')::numeric then reason:='Amount exceeds an active rule'; end if;
    elsif rule.kind='require_field' and rule.params->>'tool'=p_tool then
      if p_input->(rule.params->>'field') is null or p_input->(rule.params->>'field')='null'::jsonb
        or p_input->(rule.params->>'field')='""'::jsonb
        or (jsonb_typeof(p_input->(rule.params->>'field'))='string' and btrim(p_input->>(rule.params->>'field'))='') then reason:='Required field is missing'; end if;
    elsif rule.kind='max_identical_calls' then
      if identical>(rule.params->>'limit')::integer then reason:='Repeated identical tool call exceeded the active limit'; end if;
    end if;
    if reason is not null then
      action:=case when rule.stage='block' then 'blocked' when rule.stage='warn' then 'warned' else 'monitored' end;
      hit:=jsonb_build_object('rule',jsonb_build_object('id',rule.id,'name',rule.name,'kind',rule.kind,'params',rule.params,'stage',rule.stage,'version',rule.version),
        'reason',reason,'action',action);
      hits:=hits||jsonb_build_array(hit);
      insert into public.agent_steps(run_id,seq,tenant_id,entity_id,type,tool,detail)
        values(p_run,next_seq+jsonb_array_length(hits),p_tenant,p_entity,'guardrail',p_tool,
          jsonb_build_object('rule_id',rule.id,'rule',rule.name,'kind',rule.kind,'stage',rule.stage,'version',rule.version,'action',action,'reason',reason,'tool_call_seq',call_seq));
      if rule.stage='block' and block is null then block:=jsonb_build_object('blocked_by',rule.name,'reason',reason,'rule_id',rule.id); end if;
    end if;
  end loop;
  update public.agent_runs set step_count=next_seq+jsonb_array_length(hits),updated_at=now() where id=p_run;
  return jsonb_build_object('allowed',block is null,'call_seq',call_seq,'hits',hits,'block',block);
end $$;

create or replace function public.agent_record_step(p_tenant uuid,p_entity uuid,p_run uuid,p_type text,p_tool text,p_detail jsonb,p_duration integer)
returns integer language plpgsql security definer set search_path='' as $$
declare run public.agent_runs := o2c_private.require_run(p_tenant,p_entity,p_run); next_seq integer;
begin
  if p_type in ('tool_call','guardrail') then raise exception 'Tool calls and guardrail decisions require agent_authorize_tool'; end if;
  next_seq:=run.step_count+1;
  insert into public.agent_steps(run_id,seq,tenant_id,entity_id,type,tool,detail,duration_ms) values(p_run,next_seq,p_tenant,p_entity,p_type,p_tool,p_detail,p_duration);
  update public.agent_runs set step_count=next_seq,updated_at=now() where id=p_run;
  return next_seq;
end $$;

-- A write must consume the exact latest authorized tool call. Amounts are compared numerically because
-- the app normalizes monetary inputs to two decimals before calling the finance routine.
create function o2c_private.consume_agent_tool_gate(p_tenant uuid,p_entity uuid,p_run uuid,p_tool text,p_expected jsonb,p_amount numeric default null)
returns void language plpgsql security definer set search_path='' as $$
declare call_step public.agent_steps; call_input jsonb; blocked record;
begin
  if o2c_private.current_agent_run() is distinct from p_run then raise exception 'Agent tool gate is not bound to this run'; end if;
  select * into call_step from public.agent_steps where run_id=p_run and tenant_id=p_tenant and entity_id=p_entity
    and type='tool_call' and tool=p_tool order by seq desc limit 1;
  if not found then raise exception 'Agent tool authorization is required'; end if;
  call_input:=call_step.detail->'input';
  if (call_input-'amount') is distinct from p_expected then raise exception 'Agent tool input does not match the authorized call'; end if;
  if p_amount is not null and (coalesce(call_input->>'amount','') !~ '^(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?$'
    or (call_input->>'amount')::numeric is distinct from p_amount) then raise exception 'Agent tool amount does not match the authorized call'; end if;
  select detail into blocked from public.agent_steps where run_id=p_run and seq>call_step.seq and type='guardrail'
    and tool=p_tool and detail->>'tool_call_seq'=call_step.seq::text and detail->>'action'='blocked' order by seq limit 1;
  if found then raise exception 'Blocked by guardrail: %',blocked.detail->>'rule'; end if;
  insert into o2c_private.agent_tool_gate_consumptions(run_id,seq,consumer) values(p_run,call_step.seq,p_tool);
end $$;

create or replace function o2c_private.enforce_agent_guardrails() returns trigger language plpgsql security definer set search_path='' as $$
declare run public.agent_runs; tool text; rule record; prefix text; evidence_text text; expected jsonb;
begin
  if new.agent_run_id is null then return new; end if;
  select * into run from public.agent_runs where id=new.agent_run_id;
  tool:=case new.kind when 'receipt' then 'propose_receipt' when 'allocation' then 'propose_allocation' end;
  prefix:='AI agent run '||run.id::text||': ';
  if left(new.evidence,length(prefix))<>prefix then raise exception 'Agent evidence does not match this run'; end if;
  evidence_text:=substr(new.evidence,length(prefix)+1);
  expected:=case when new.kind='receipt' then jsonb_build_object('bank_line_id',new.bank_line_id,'customer_id',new.customer_id,'evidence',evidence_text)
    else jsonb_build_object('invoice_id',new.invoice_id,'receipt_id',new.receipt_id,'evidence',evidence_text) end;
  perform o2c_private.consume_agent_tool_gate(new.tenant_id,new.entity_id,new.agent_run_id,tool,expected,new.amount);
  for rule in select * from o2c_private.active_guardrails(new.tenant_id,new.entity_id,run.kind) where stage='block' loop
    if (rule.kind='deny_tool' and rule.params->>'tool'=tool)
      or (rule.kind='max_amount' and rule.params->>'tool'=tool and new.amount>(rule.params->>'limit')::numeric) then
      raise exception 'Blocked by guardrail: %',rule.name;
    end if;
  end loop;
  return new;
end $$;

create function o2c_private.enforce_agent_note_tool_gate() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.agent_run_id is not null then
    perform o2c_private.consume_agent_tool_gate(new.tenant_id,new.entity_id,new.agent_run_id,'propose_credit_note',
      jsonb_build_object('customer_id',new.customer_id,'invoice_id',new.invoice_id,'reason',new.reason,'memo',new.memo,'reference',new.reference),new.amount);
  end if;
  return new;
end $$;
create trigger adjustment_notes_agent_tool_gate before insert on public.adjustment_notes for each row execute function o2c_private.enforce_agent_note_tool_gate();

create function o2c_private.enforce_agent_message_tool_gate() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.agent_run_id is not null then
    perform o2c_private.consume_agent_tool_gate(new.tenant_id,new.entity_id,new.agent_run_id,'propose_collection_message',
      jsonb_build_object('customer_id',new.customer_id,'contact_id',new.contact_id,'invoice_ids',to_jsonb(new.invoice_ids),
        'tone',new.tone,'subject',new.subject,'body',new.body,'attach_statement',new.attach_statement));
  end if;
  return new;
end $$;
create trigger collection_messages_agent_tool_gate before insert on public.collection_messages for each row execute function o2c_private.enforce_agent_message_tool_gate();

create function o2c_private.enforce_agent_hold_tool_gate() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.agent_run_id is not null then
    perform o2c_private.consume_agent_tool_gate(new.tenant_id,new.entity_id,new.agent_run_id,'place_credit_hold',
      jsonb_build_object('customer_id',new.customer_id,'reason',new.reason));
  end if;
  return new;
end $$;
create trigger customer_hold_proposals_agent_tool_gate before insert on public.customer_hold_proposals for each row execute function o2c_private.enforce_agent_hold_tool_gate();

create function o2c_private.enforce_agent_auto_post_tool_gate() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.agent_run_id is not null and old.status='pending' and new.status='approved' and new.checker_basis='policy'
    and old.checker_basis is distinct from 'policy' then
    perform o2c_private.consume_agent_tool_gate(old.tenant_id,old.entity_id,old.agent_run_id,'auto_post_if_policy_allows',
      jsonb_build_object('approval_id',old.id));
  end if;
  return new;
end $$;
create trigger approvals_agent_auto_post_tool_gate before update on public.approvals for each row execute function o2c_private.enforce_agent_auto_post_tool_gate();

revoke all on function public.agent_authorize_tool(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.agent_authorize_tool(uuid,uuid,uuid,text,jsonb) to authenticated;
revoke all on function o2c_private.consume_agent_tool_gate(uuid,uuid,uuid,text,jsonb,numeric),
  o2c_private.enforce_agent_note_tool_gate(),o2c_private.enforce_agent_message_tool_gate(),
  o2c_private.enforce_agent_hold_tool_gate(),o2c_private.enforce_agent_auto_post_tool_gate()
  from public,anon,authenticated,o2c_app;
revoke all on function public.agent_record_step(uuid,uuid,uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.agent_record_step(uuid,uuid,uuid,text,text,jsonb,integer) to authenticated;

commit;
