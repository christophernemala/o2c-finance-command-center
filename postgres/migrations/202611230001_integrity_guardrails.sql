-- Composite scope/customer references protect new writes while NOT VALID preserves legacy rows for later review.
-- Related read models also scope every join so legacy mismatches are not surfaced under another customer.
begin;

-- Parent keys for the composite relationships. IDs are already primary keys; these indexes provide
-- explicit referenced keys whose tenant, entity and customer columns must also match.
create unique index if not exists customer_contacts_scope_customer_id_key
  on public.customer_contacts(tenant_id,entity_id,customer_id,id);
create unique index if not exists payment_promises_scope_customer_id_key
  on public.payment_promises(tenant_id,entity_id,customer_id,id);
create unique index if not exists invoices_scope_customer_id_key
  on public.invoices(tenant_id,entity_id,customer_id,id);

alter table public.customer_contacts add constraint customer_contacts_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;
alter table public.collection_messages add constraint collection_messages_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;
alter table public.collection_messages add constraint collection_messages_contact_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id,contact_id) references public.customer_contacts(tenant_id,entity_id,customer_id,id) not valid;
alter table public.payment_promises add constraint payment_promises_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;
alter table public.payment_promises add constraint payment_promises_invoice_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id,invoice_id) references public.invoices(tenant_id,entity_id,customer_id,id) not valid;
alter table public.credit_limits add constraint credit_limits_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;
alter table public.customer_holds add constraint customer_holds_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;
alter table public.customer_remarks add constraint customer_remarks_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;
alter table public.customer_remarks add constraint customer_remarks_invoice_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id,invoice_id) references public.invoices(tenant_id,entity_id,customer_id,id) not valid;
alter table public.customer_remarks add constraint customer_remarks_promise_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id,promise_id) references public.payment_promises(tenant_id,entity_id,customer_id,id) not valid;
alter table public.customer_trade_licences add constraint customer_trade_licences_customer_scope_fk
  foreign key(tenant_id,entity_id,customer_id) references public.customers(tenant_id,entity_id,id) not valid;

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
      (select count(*) from public.payment_promises p where p.tenant_id=p_tenant and p.entity_id=p_entity and p.customer_id=c.id
        and o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of,p.created_at)='broken') as broken_promises,
      (select count(*) from public.payment_promises p where p.tenant_id=p_tenant and p.entity_id=p_entity and p.customer_id=c.id
        and o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of,p.created_at)='open') as open_promises,
      exists(select 1 from public.customer_holds h where h.tenant_id=p_tenant and h.entity_id=p_entity and h.customer_id=c.id and h.released_at is null) as on_hold,
      (select count(*) from public.customer_contacts k where k.tenant_id=p_tenant and k.entity_id=p_entity and k.customer_id=c.id and not k.archived) as contacts,
      (select l.credit_limit::text from public.credit_limits l where l.tenant_id=p_tenant and l.entity_id=p_entity and l.customer_id=c.id and l.status='active') as credit_limit,
      (select m.status from public.collection_messages m where m.tenant_id=p_tenant and m.entity_id=p_entity and m.customer_id=c.id order by m.created_at desc limit 1) as last_message
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
      from public.customer_contacts k where k.tenant_id=p_tenant and k.entity_id=p_entity and k.customer_id=c.id and not k.archived),'[]'),
    'promises',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'invoice_id',p.invoice_id,'amount',p.amount::text,'promised_date',p.promised_date,
      'status',o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of,p.created_at),'resolvable',p.status='open','note',p.note) order by p.promised_date desc)
      from public.payment_promises p where p.tenant_id=p_tenant and p.entity_id=p_entity and p.customer_id=c.id),'[]'),
    'hold',(select jsonb_build_object('id',h.id,'reason',h.reason,'placed_by_kind',h.placed_by_kind,'placed_by',h.placed_by,'placed_at',h.placed_at)
      from public.customer_holds h where h.tenant_id=p_tenant and h.entity_id=p_entity and h.customer_id=c.id and h.released_at is null),
    'credit_limit',(select jsonb_build_object('id',l.id,'limit',l.credit_limit::text,'decided_at',l.decided_at) from public.credit_limits l where l.tenant_id=p_tenant and l.entity_id=p_entity and l.customer_id=c.id and l.status='active'),
    'pending_limit',(select jsonb_build_object('id',l.id,'limit',l.credit_limit::text,'reason',l.reason,'maker',l.maker) from public.credit_limits l where l.tenant_id=p_tenant and l.entity_id=p_entity and l.customer_id=c.id and l.status='pending'),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'tone',m.tone,'subject',m.subject,'body',m.body,'to',case when m.channel='email' then m.to_email else m.to_phone end,'channel',m.channel,'provider_id',m.provider_id,'total_overdue',m.total_overdue::text,
      'invoice_ids',m.invoice_ids,'attach_statement',m.attach_statement,'status',m.status,'maker',m.maker,'checker',m.checker,'agent_run_id',m.agent_run_id,
      'error',m.error,'created_at',m.created_at,'sent_at',m.sent_at) order by m.created_at desc) from (select * from public.collection_messages where tenant_id=p_tenant and entity_id=p_entity and customer_id=c.id order by created_at desc limit 20) m),'[]'))
  into result from public.customers c where c.id=p_customer and c.tenant_id=p_tenant and c.entity_id=p_entity;
  if result is null then raise exception 'Customer unavailable'; end if;
  return result;
end $$;

create or replace function public.my_follow_ups(p_tenant uuid,p_entity uuid,p_as_of date,p_all boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return coalesce((select jsonb_agg(jsonb_build_object('customer_id',r.customer_id,'customer',c.name,'account',c.account,'due',r.next_follow_up,
      'days_late',p_as_of-r.next_follow_up,'last_reason',r.reason,'last_note',r.note,'owner',r.created_by,'remark_id',r.id) order by r.next_follow_up,c.name)
    from (select distinct on (customer_id) * from public.customer_remarks where tenant_id=p_tenant and entity_id=p_entity order by customer_id,created_at desc,id) r
    join public.customers c on c.id=r.customer_id and c.tenant_id=r.tenant_id and c.entity_id=r.entity_id
    where r.next_follow_up is not null and r.next_follow_up<=p_as_of and (coalesce(p_all,false) or r.created_by=auth.uid())),'[]');
end $$;

create or replace function public.daily_call_list(p_tenant uuid,p_entity uuid,p_as_of date,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_as_of is null or not isfinite(p_as_of) or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid request'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('customer_id',x.customer_id,'customer',x.customer,'account',x.account,'overdue',x.overdue,
      'oldest_days',x.oldest_days,'broken_promises',x.broken_promises,'on_hold',x.on_hold,'contacts',x.contacts,'score',x.score::text,
      'why',concat_ws(' · ',x.oldest_days||' days overdue',case when x.broken_promises>0 then x.broken_promises||' broken promise(s)' end,
        case when x.on_hold then 'on credit hold' end,case when x.contacts=0 then 'no contact on file' end),
      'last_note',(select r.note from public.customer_remarks r where r.tenant_id=p_tenant and r.entity_id=p_entity and r.customer_id=x.customer_id order by r.created_at desc,r.id limit 1))
      order by x.score desc,x.customer) from (
    select w.customer_id,w.customer,w.account,w.overdue,coalesce(w.oldest_days,0) as oldest_days,w.broken_promises,w.on_hold,w.contacts,
      round(w.overdue::numeric*(1+least(coalesce(w.oldest_days,0),360)/90.0)*(1+least(w.broken_promises,3)*0.5),2) as score
    from jsonb_to_recordset(public.collections_worklist(p_tenant,p_entity,p_as_of)) as w(customer_id uuid,customer text,account text,overdue text,
      oldest_days integer,broken_promises integer,on_hold boolean,contacts integer)
    where w.overdue::numeric>0
      and not exists(select 1 from (select r.next_follow_up,r.created_at from public.customer_remarks r where r.tenant_id=p_tenant and r.entity_id=p_entity and r.customer_id=w.customer_id
          order by r.created_at desc,r.id limit 1) last
        where last.next_follow_up>p_as_of or (last.created_at at time zone 'Asia/Dubai')::date=p_as_of)
    order by score desc,w.customer limit p_limit) x),'[]');
end $$;

create or replace function public.licence_alerts(p_tenant uuid,p_entity uuid,p_as_of date,p_days integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_days is null or p_days not between 0 and 365 then raise exception 'Invalid window'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'customer_id',l.customer_id,'customer',c.name,'account',c.account,'licence_number',l.licence_number,
      'authority',l.authority,'expiry_date',l.expiry_date,'days_left',l.expiry_date-p_as_of,'expired',l.expiry_date<p_as_of) order by l.expiry_date,c.name)
    from public.customer_trade_licences l join public.customers c on c.id=l.customer_id and c.tenant_id=l.tenant_id and c.entity_id=l.entity_id
    where l.tenant_id=p_tenant and l.entity_id=p_entity and not l.archived and l.expiry_date<=p_as_of+p_days),'[]');
end $$;

create or replace function public.remarks_logged(p_tenant uuid,p_entity uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_date is null or not isfinite(p_date) then raise exception 'Invalid date'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('customer',c.name,'account',c.account,'invoice',i.number,'reason',r.reason,'channel',r.channel,
      'note',r.note,'next_follow_up',r.next_follow_up,'promise_amount',p.amount::text,'promise_date',p.promised_date,'created_by',r.created_by,'created_at',r.created_at)
      order by r.created_at,r.id)
    from public.customer_remarks r join public.customers c on c.id=r.customer_id and c.tenant_id=r.tenant_id and c.entity_id=r.entity_id
      left join public.invoices i on i.id=r.invoice_id and i.tenant_id=r.tenant_id and i.entity_id=r.entity_id and i.customer_id=r.customer_id
      left join public.payment_promises p on p.id=r.promise_id and p.tenant_id=r.tenant_id and p.entity_id=r.entity_id and p.customer_id=r.customer_id
    where r.tenant_id=p_tenant and r.entity_id=p_entity and (r.created_at at time zone 'Asia/Dubai')::date=p_date),'[]');
end $$;

create or replace function o2c_private.claim_collection_messages(p_limit integer,p_channels text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; stale record;
begin
  update public.collection_messages set status=case when channel='email' and attempts<3 then 'approved' else 'failed' end,
    error=case when channel<>'email' then 'Twilio outcome unknown: reconcile in Twilio before proposing again; automatic retry disabled'
      when attempts<3 then error else 'Sender stopped during the final attempt' end
    where status='sending' and sending_at<now()-interval '15 minutes';
  for stale in select id,tenant_id,entity_id,checker from public.collection_messages where status='approved' and attempts<3 for update skip locked loop
    if not o2c_private.message_evidence_current(stale.id) then
      update public.collection_messages set status='failed',error='Stale evidence at send time: an invoice was paid, disputed or changed, or the contact was removed' where id=stale.id;
      insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(stale.tenant_id,stale.entity_id,stale.checker,'collection_message.failed',stale.id,
        jsonb_build_object('error','stale evidence'));
    end if;
  end loop;
  with claimed as (
    select id from public.collection_messages where status='approved' and attempts<3 and channel=any(p_channels) order by decided_at,id
    for update skip locked limit greatest(1,least(coalesce(p_limit,10),25))
  ), updated as (
    update public.collection_messages m set status='sending',sending_at=now(),attempts=m.attempts+1 from claimed where m.id=claimed.id returning m.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'tenant_id',u.tenant_id,'entity_id',u.entity_id,'customer_id',u.customer_id,'to',case when u.channel='email' then u.to_email else u.to_phone end,'channel',u.channel,
    'subject',u.subject,'body',u.body,'attach_statement',u.attach_statement,'attempts',u.attempts,'customer',c.name,'account',c.account)),'[]')
  into result from updated u join public.customers c on c.id=u.customer_id and c.tenant_id=u.tenant_id and c.entity_id=u.entity_id;
  return result;
end $$;

-- Settlement is confined to the request's pre-call reservation. On overage, the exception rolls
-- back this statement and leaves the full reservation held for reconciliation; it is never silently released.
create or replace function public.settle_ai_spend(p_tenant uuid,p_entity uuid,p_request uuid,p_call integer,p_model text,
  p_input_tokens integer,p_output_tokens integer,p_cache_read_tokens integer,p_cache_write_tokens integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare membership_role text := o2c_private.require_scope(p_tenant,p_entity); reservation o2c_private.ai_spend_reservations;
  price o2c_private.ai_model_prices; value numeric(12,6);
begin
  if membership_role='agent' then perform o2c_private.require_run(p_tenant,p_entity,p_request); end if;
  if p_call is null or p_call not between 1 and 32 or p_input_tokens is null or p_output_tokens is null
    or p_cache_read_tokens is null or p_cache_write_tokens is null
    or least(p_input_tokens,p_output_tokens,p_cache_read_tokens,p_cache_write_tokens)<0
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
  if p_output_tokens>reservation.max_output_tokens then raise exception 'AI output usage exceeded reservation; reservation remains held'; end if;
  select * into price from o2c_private.ai_model_prices where model=p_model;
  if not found then raise exception 'AI model price unavailable; reservation remains held'; end if;
  value:=ceil(((p_input_tokens::numeric*price.input_usd_per_mtok+p_output_tokens::numeric*price.output_usd_per_mtok
    +p_cache_read_tokens::numeric*price.cache_read_usd_per_mtok+p_cache_write_tokens::numeric*price.cache_write_5m_usd_per_mtok)/1000000)*1000000)/1000000;
  if value>reservation.reserved_usd then raise exception 'AI actual usage exceeded reservation; reservation remains held'; end if;
  update o2c_private.ai_spend_reservations set status='settled',actual_usd=value,actual_input_tokens=p_input_tokens,actual_output_tokens=p_output_tokens,
    actual_cache_read_tokens=p_cache_read_tokens,actual_cache_write_tokens=p_cache_write_tokens,settled_at=now()
    where tenant_id=p_tenant and request_id=p_request and call_no=p_call;
  return jsonb_build_object('status','settled','actual_usd',value::text,'reserved_usd',reservation.reserved_usd::text);
end $$;

commit;
