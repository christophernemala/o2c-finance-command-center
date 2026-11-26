begin;

-- This price snapshot is deliberately private and migration-versioned. The application only
-- meters the listed models. Pre-call reservations use the highest cache-write rate (1h TTL)
-- as a conservative upper bound; settlement records the actual model-reported token buckets.
create table o2c_private.ai_model_prices (
  model text primary key check(length(model) between 3 and 64),
  input_usd_per_mtok numeric(12,6) not null check(input_usd_per_mtok>0),
  output_usd_per_mtok numeric(12,6) not null check(output_usd_per_mtok>0),
  cache_read_usd_per_mtok numeric(12,6) not null check(cache_read_usd_per_mtok>=0),
  cache_write_5m_usd_per_mtok numeric(12,6) not null check(cache_write_5m_usd_per_mtok>=0),
  cache_write_1h_usd_per_mtok numeric(12,6) not null check(cache_write_1h_usd_per_mtok>=cache_write_5m_usd_per_mtok)
);
insert into o2c_private.ai_model_prices values
  ('claude-opus-5-5',4,20,0.20,5,8),
  ('claude-sonnet-5-5',2,10,0.10,2.50,4);

-- A workspace cap is an administrator-selected USD allowance per Asia/Dubai day.
-- No default cap exists; missing or zero caps block all model requests.
create table o2c_private.ai_spend_caps (
  tenant_id uuid primary key references public.tenants(id),
  daily_limit_usd numeric(12,6) not null check(daily_limit_usd>=0),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Every model request reserves its worst-case priced cost before it leaves the server.
-- A failed/ambiguous provider call remains reserved for the remainder of that Dubai day.
create table o2c_private.ai_spend_reservations (
  tenant_id uuid not null,
  entity_id uuid not null,
  request_id uuid not null,
  call_no integer not null check(call_no between 1 and 32),
  actor_id uuid not null references auth.users(id),
  model text not null references o2c_private.ai_model_prices(model),
  input_bytes integer not null check(input_bytes between 1 and 2000000),
  max_output_tokens integer not null check(max_output_tokens between 1 and 16000),
  reserved_usd numeric(12,6) not null check(reserved_usd>0),
  actual_usd numeric(12,6) check(actual_usd>=0),
  actual_input_tokens integer,
  actual_output_tokens integer,
  actual_cache_read_tokens integer,
  actual_cache_write_tokens integer,
  status text not null default 'reserved' check(status in ('reserved','settled','released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  primary key(tenant_id,request_id,call_no),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id),
  check((status='settled' and actual_usd is not null and settled_at is not null)
     or (status<>'settled' and actual_usd is null and settled_at is null))
);
create index ai_spend_reservations_day on o2c_private.ai_spend_reservations(tenant_id,created_at,status);

-- Copilot requests are append-only per stable client request ID. Locking the conversation
-- serializes distinct turns and makes retries return the original result, never rerun a model.
create table o2c_private.copilot_turns (
  thread_id uuid not null references public.copilot_threads(id),
  tenant_id uuid not null,
  entity_id uuid not null,
  request_id uuid not null,
  user_id uuid not null references auth.users(id),
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
  request_payload jsonb not null check(jsonb_typeof(request_payload)='object' and octet_length(request_payload::text)<=4096),
  user_seq integer not null check(user_seq between 1 and 399),
  assistant_seq integer check(assistant_seq between 2 and 400),
  status text not null check(status in ('running','completed','failed')),
  response text check(response is null or length(response) between 1 and 100000),
  trace jsonb not null default '[]' check(octet_length(trace::text)<=262144),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(thread_id,request_id),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id),
  check((status='running' and response is null and assistant_seq is null and completed_at is null)
     or (status in ('completed','failed') and response is not null and assistant_seq is not null and completed_at is not null))
);
create index copilot_turns_thread_status on o2c_private.copilot_turns(thread_id,status,created_at);

create function public.ai_spend_status(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity);
  today date := o2c_private.dubai_today(); cap numeric(12,6); spent numeric(12,6); reserved numeric(12,6); pending integer;
begin
  select daily_limit_usd into cap from o2c_private.ai_spend_caps where tenant_id=p_tenant;
  select coalesce(sum(actual_usd) filter(where status='settled'),0),
    coalesce(sum(reserved_usd) filter(where status='reserved'),0),count(*) filter(where status='reserved')
    into spent,reserved,pending
    from o2c_private.ai_spend_reservations
    where tenant_id=p_tenant and (created_at at time zone 'Asia/Dubai')::date=today;
  return jsonb_build_object('date',today,'daily_limit_usd',cap::text,'spent_usd',spent::text,'reserved_usd',reserved::text,
    'remaining_usd',case when cap is null then null else greatest(cap-spent-reserved,0)::text end,
    'open_reservations',pending,'configured',cap is not null and cap>0,'paused',cap=0);
end $$;

create function public.set_ai_spend_cap(p_tenant uuid,p_entity uuid,p_daily_cap text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity); previous numeric(12,6); value numeric(12,6);
begin
  if membership_role<>'admin' then raise exception 'Forbidden'; end if;
  if p_daily_cap is null or p_daily_cap !~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,6})?$' then raise exception 'Invalid USD daily limit'; end if;
  value:=p_daily_cap::numeric(12,6);
  select daily_limit_usd into previous from o2c_private.ai_spend_caps where tenant_id=p_tenant for update;
  insert into o2c_private.ai_spend_caps(tenant_id,daily_limit_usd,updated_by,updated_at)
    values(p_tenant,value,auth.uid(),now())
    on conflict(tenant_id) do update set daily_limit_usd=excluded.daily_limit_usd,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail)
    values(p_tenant,p_entity,auth.uid(),'ai.spend_cap.changed',p_tenant,
      jsonb_build_object('previous_daily_usd',previous::text,'new_daily_usd',value::text,'period','Asia/Dubai calendar day'));
  return public.ai_spend_status(p_tenant,p_entity);
end $$;

create function public.reserve_ai_spend(p_tenant uuid,p_entity uuid,p_request uuid,p_call integer,p_model text,p_input_bytes integer,p_max_output integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity); cap numeric(12,6); spent numeric(12,6); reserved numeric(12,6);
  price o2c_private.ai_model_prices; prior o2c_private.ai_spend_reservations; value numeric(12,6); today date := o2c_private.dubai_today();
begin
  if membership_role='agent' then perform o2c_private.require_run(p_tenant,p_entity,p_request); end if;
  if p_request is null or p_call not between 1 and 32 or p_input_bytes not between 1 and 2000000 or p_max_output not between 1 and 16000 then raise exception 'Invalid AI reservation'; end if;
  select daily_limit_usd into cap from o2c_private.ai_spend_caps where tenant_id=p_tenant for update;
  if not found then raise exception 'AI daily budget is not configured'; end if;
  if cap<=0 then raise exception 'AI daily budget is paused'; end if;
  select * into price from o2c_private.ai_model_prices where model=p_model;
  if not found then raise exception 'AI model has no configured price; request blocked'; end if;
  select * into prior from o2c_private.ai_spend_reservations where tenant_id=p_tenant and request_id=p_request and call_no=p_call for update;
  if found then
    if prior.entity_id<>p_entity or prior.actor_id<>auth.uid() or prior.model<>p_model or prior.input_bytes<>p_input_bytes or prior.max_output_tokens<>p_max_output then raise exception 'AI reservation key conflict'; end if;
    return jsonb_build_object('status',prior.status,'reserved_usd',prior.reserved_usd::text);
  end if;
  select coalesce(sum(actual_usd) filter(where status='settled'),0),
    coalesce(sum(reserved_usd) filter(where status='reserved'),0) into spent,reserved
    from o2c_private.ai_spend_reservations
    where tenant_id=p_tenant and (created_at at time zone 'Asia/Dubai')::date=today;
  -- UTF-8 bytes bound prompt tokens; add 1024 tokens for provider-side envelope. Reserve at
  -- the 1-hour cache-write rate (the highest listed rate) plus the request's full output limit.
  value:=ceil((((p_input_bytes::numeric+1024)*price.cache_write_1h_usd_per_mtok
      + p_max_output::numeric*price.output_usd_per_mtok)/1000000)*1000000)/1000000;
  if value<=0 then value:=0.000001; end if;
  if spent+reserved+value>cap then raise exception 'AI daily spend cap would be exceeded'; end if;
  insert into o2c_private.ai_spend_reservations(tenant_id,entity_id,request_id,call_no,actor_id,model,input_bytes,max_output_tokens,reserved_usd)
    values(p_tenant,p_entity,p_request,p_call,auth.uid(),p_model,p_input_bytes,p_max_output,value);
  return jsonb_build_object('status','reserved','reserved_usd',value::text,'remaining_usd',greatest(cap-spent-reserved-value,0)::text);
end $$;

create function public.settle_ai_spend(p_tenant uuid,p_entity uuid,p_request uuid,p_call integer,p_model text,
  p_input_tokens integer,p_output_tokens integer,p_cache_read_tokens integer,p_cache_write_tokens integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity); reservation o2c_private.ai_spend_reservations;
  price o2c_private.ai_model_prices; value numeric(12,6);
begin
  if membership_role='agent' then perform o2c_private.require_run(p_tenant,p_entity,p_request); end if;
  if p_call not between 1 and 32 or least(p_input_tokens,p_output_tokens,p_cache_read_tokens,p_cache_write_tokens)<0
    or greatest(p_input_tokens,p_output_tokens,p_cache_read_tokens,p_cache_write_tokens)>2000000 then raise exception 'Invalid AI usage'; end if;
  select * into reservation from o2c_private.ai_spend_reservations where tenant_id=p_tenant and entity_id=p_entity and request_id=p_request and call_no=p_call and actor_id=auth.uid() for update;
  if not found then raise exception 'AI reservation unavailable'; end if;
  if reservation.model<>p_model then raise exception 'AI model changed after reservation; reservation remains held'; end if;
  if reservation.status='settled' then
    if reservation.actual_input_tokens<>p_input_tokens or reservation.actual_output_tokens<>p_output_tokens
      or reservation.actual_cache_read_tokens<>p_cache_read_tokens or reservation.actual_cache_write_tokens<>p_cache_write_tokens then raise exception 'AI settlement key conflict'; end if;
    return jsonb_build_object('status','settled','actual_usd',reservation.actual_usd::text,'reserved_usd',reservation.reserved_usd::text);
  end if;
  if reservation.status<>'reserved' then raise exception 'AI reservation was released'; end if;
  select * into price from o2c_private.ai_model_prices where model=p_model;
  if not found then raise exception 'AI model price unavailable; reservation remains held'; end if;
  value:=ceil(((p_input_tokens::numeric*price.input_usd_per_mtok+p_output_tokens::numeric*price.output_usd_per_mtok
    +p_cache_read_tokens::numeric*price.cache_read_usd_per_mtok+p_cache_write_tokens::numeric*price.cache_write_5m_usd_per_mtok)/1000000)*1000000)/1000000;
  update o2c_private.ai_spend_reservations set status='settled',actual_usd=value,actual_input_tokens=p_input_tokens,actual_output_tokens=p_output_tokens,
    actual_cache_read_tokens=p_cache_read_tokens,actual_cache_write_tokens=p_cache_write_tokens,settled_at=now()
    where tenant_id=p_tenant and request_id=p_request and call_no=p_call;
  return jsonb_build_object('status','settled','actual_usd',value::text,'reserved_usd',reservation.reserved_usd::text);
end $$;

create function public.release_ai_spend(p_tenant uuid,p_entity uuid,p_request uuid,p_call integer) returns text
language plpgsql security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity);
begin
  if membership_role='agent' then perform o2c_private.require_run(p_tenant,p_entity,p_request); end if;
  update o2c_private.ai_spend_reservations set status='released'
    where tenant_id=p_tenant and entity_id=p_entity and request_id=p_request and call_no=p_call and actor_id=auth.uid() and status='reserved';
  if not found then raise exception 'AI reservation cannot be released'; end if;
  return 'released';
end $$;

create function public.copilot_start_turn(p_tenant uuid,p_entity uuid,p_thread uuid,p_request uuid,p_fingerprint text,p_content text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity); thread_row public.copilot_threads; prior o2c_private.copilot_turns;
  next_seq integer; active_request uuid; history jsonb;
begin
  if membership_role='agent' then raise exception 'Forbidden'; end if;
  if p_request is null or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_content is null or length(btrim(p_content)) not between 1 and 8000
    or p_payload is null or coalesce(jsonb_typeof(p_payload->'files'),'')<>'array' or jsonb_array_length(p_payload->'files')>5
    or coalesce(jsonb_typeof(p_payload->'allowProposals'),'')<>'boolean' or octet_length(p_payload::text)>4096
    or exists(select 1 from jsonb_array_elements(p_payload->'files') as item(value) where jsonb_typeof(value)<>'object' or coalesce(jsonb_typeof(value->'id'),'')<>'string'
      or (value->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or coalesce(jsonb_typeof(value->'name'),'')<>'string' or length(value->>'name') not between 1 and 200) then raise exception 'Invalid Copilot turn'; end if;
  insert into public.copilot_threads(id,tenant_id,entity_id,user_id,title)
    values(p_thread,p_tenant,p_entity,auth.uid(),left(regexp_replace(p_content,'\s+',' ','g'),120)) on conflict(id) do nothing;
  select * into thread_row from public.copilot_threads where id=p_thread for update;
  if not found or thread_row.user_id<>auth.uid() or thread_row.tenant_id<>p_tenant or thread_row.entity_id<>p_entity then raise exception 'Conversation unavailable'; end if;
  select * into prior from o2c_private.copilot_turns where thread_id=p_thread and request_id=p_request for update;
  if found then
    if prior.user_id<>auth.uid() or prior.fingerprint<>p_fingerprint then raise exception 'Copilot idempotency key conflict'; end if;
    return jsonb_build_object('status',prior.status,'response',prior.response);
  end if;
  select request_id into active_request from o2c_private.copilot_turns where thread_id=p_thread and status='running' order by created_at limit 1 for update;
  if active_request is not null then return jsonb_build_object('status','busy'); end if;
  select coalesce(max(seq),0)+1 into next_seq from public.copilot_messages where thread_id=p_thread;
  if next_seq>399 then raise exception 'Conversation is full; start a new conversation'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('seq',seq,'role',role,'content',content) order by seq),'[]') into history
    from (select seq,role,content from public.copilot_messages where thread_id=p_thread and seq<next_seq order by seq desc limit 40) existing;
  insert into o2c_private.copilot_turns(thread_id,tenant_id,entity_id,request_id,user_id,fingerprint,request_payload,user_seq,status)
    values(p_thread,p_tenant,p_entity,p_request,auth.uid(),p_fingerprint,p_payload,next_seq,'running');
  insert into public.copilot_messages(thread_id,seq,role,content,trace) values(p_thread,next_seq,'user',p_content,'[]');
  update public.copilot_threads set updated_at=now() where id=p_thread;
  return jsonb_build_object('status','started','history',history);
end $$;

create function public.copilot_pending_turn(p_tenant uuid,p_entity uuid,p_thread uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity); value jsonb;
begin
  if membership_role='agent' then raise exception 'Forbidden'; end if;
  select jsonb_build_object('requestId',t.request_id,'message',m.content,'files',t.request_payload->'files',
    'allowProposals',t.request_payload->'allowProposals') into value
    from o2c_private.copilot_turns t join public.copilot_messages m on m.thread_id=t.thread_id and m.seq=t.user_seq
    where t.thread_id=p_thread and t.tenant_id=p_tenant and t.entity_id=p_entity and t.user_id=auth.uid() and t.status='running'
    order by t.created_at desc limit 1;
  return value;
end $$;

create function public.copilot_finish_turn(p_tenant uuid,p_entity uuid,p_thread uuid,p_request uuid,p_status text,p_content text,p_trace jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity); thread_row public.copilot_threads; turn_row o2c_private.copilot_turns; next_seq integer; value_trace jsonb:=coalesce(p_trace,'[]');
begin
  if membership_role='agent' then raise exception 'Forbidden'; end if;
  if p_status not in ('completed','failed') or p_content is null or length(p_content) not between 1 and 100000 or octet_length(value_trace::text)>262144 then raise exception 'Invalid Copilot result'; end if;
  select * into thread_row from public.copilot_threads where id=p_thread for update;
  if not found or thread_row.user_id<>auth.uid() or thread_row.tenant_id<>p_tenant or thread_row.entity_id<>p_entity then raise exception 'Conversation unavailable'; end if;
  select * into turn_row from o2c_private.copilot_turns where thread_id=p_thread and tenant_id=p_tenant and entity_id=p_entity and request_id=p_request and user_id=auth.uid() for update;
  if not found then raise exception 'Copilot turn unavailable'; end if;
  if turn_row.status<>'running' then
    if turn_row.status=p_status and turn_row.response=p_content and turn_row.trace=value_trace then return jsonb_build_object('status',turn_row.status,'response',turn_row.response); end if;
    raise exception 'Copilot result key conflict';
  end if;
  select coalesce(max(seq),0)+1 into next_seq from public.copilot_messages where thread_id=p_thread;
  if next_seq>400 then raise exception 'Conversation is full; start a new conversation'; end if;
  insert into public.copilot_messages(thread_id,seq,role,content,trace) values(p_thread,next_seq,'assistant',p_content,value_trace);
  update o2c_private.copilot_turns set status=p_status,response=p_content,trace=value_trace,assistant_seq=next_seq,completed_at=now()
    where thread_id=p_thread and request_id=p_request;
  update public.copilot_threads set updated_at=now() where id=p_thread;
  return jsonb_build_object('status',p_status,'response',p_content);
end $$;

revoke all on function public.ai_spend_status(uuid,uuid),public.set_ai_spend_cap(uuid,uuid,text),
  public.reserve_ai_spend(uuid,uuid,uuid,integer,text,integer,integer),public.settle_ai_spend(uuid,uuid,uuid,integer,text,integer,integer,integer,integer),
  public.release_ai_spend(uuid,uuid,uuid,integer),public.copilot_start_turn(uuid,uuid,uuid,uuid,text,text,jsonb),
  public.copilot_pending_turn(uuid,uuid,uuid),public.copilot_finish_turn(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.ai_spend_status(uuid,uuid),public.set_ai_spend_cap(uuid,uuid,text),
  public.reserve_ai_spend(uuid,uuid,uuid,integer,text,integer,integer),public.settle_ai_spend(uuid,uuid,uuid,integer,text,integer,integer,integer,integer),
  public.release_ai_spend(uuid,uuid,uuid,integer),public.copilot_start_turn(uuid,uuid,uuid,uuid,text,text,jsonb),
  public.copilot_pending_turn(uuid,uuid,uuid),public.copilot_finish_turn(uuid,uuid,uuid,uuid,text,text,jsonb) to authenticated;

commit;
