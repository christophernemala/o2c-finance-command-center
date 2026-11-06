-- Collections workbench: structured remarks with next follow-up dates, a deterministic daily call list,
-- personal follow-up reminders and UAE trade-licence expiry tracking. Remarks are append-only evidence.
begin;

create table public.customer_remarks (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  invoice_id uuid references public.invoices,
  reason text not null check(reason in ('promised','payment_sent','partial_payment','dispute','no_answer','wrong_contact','escalated','other')),
  channel text not null check(channel in ('call','email','meeting','sms','whatsapp','other')),
  note text not null check(length(note) between 3 and 1000),
  next_follow_up date, promise_id uuid references public.payment_promises,
  created_by uuid not null references auth.users, created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create index customer_remarks_customer on public.customer_remarks(customer_id,created_at desc);
create index customer_remarks_follow_up on public.customer_remarks(tenant_id,entity_id,next_follow_up) where next_follow_up is not null;
create trigger customer_remarks_frozen before update or delete on public.customer_remarks for each row execute function public.reject_audit_mutation();

create table public.customer_trade_licences (
  id uuid primary key, tenant_id uuid not null, entity_id uuid not null, customer_id uuid not null references public.customers,
  licence_number text not null check(length(licence_number) between 1 and 60),
  authority text not null check(length(authority) between 2 and 80),
  expiry_date date not null, archived boolean not null default false,
  created_by uuid not null references auth.users, created_at timestamptz not null default now(),
  foreign key(tenant_id,entity_id) references public.entities(tenant_id,id)
);
create unique index customer_trade_licences_one on public.customer_trade_licences(customer_id,licence_number) where not archived;

alter table public.customer_remarks enable row level security;
create policy scope_read on public.customer_remarks for select to authenticated using(public.member_role(tenant_id) is not null);
alter table public.customer_trade_licences enable row level security;
create policy scope_read on public.customer_trade_licences for select to authenticated using(public.member_role(tenant_id) is not null);
revoke all on public.customer_remarks,public.customer_trade_licences from public,anon,authenticated;
grant select on public.customer_remarks,public.customer_trade_licences to authenticated;

-- A remark may record a promise in the same transaction, so the note and the promise never disagree.
create function public.add_customer_remark(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_invoice uuid,p_reason text,p_channel text,
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
    if prior.customer_id=p_customer and prior.created_by=auth.uid() and prior.note=p_note then return p_id; end if;
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

create function public.add_trade_licence(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_number text,p_authority text,p_expiry date) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_expiry is null or not isfinite(p_expiry) then raise exception 'Invalid expiry date'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  -- A renewal replaces the previous active record for the same licence number.
  update public.customer_trade_licences set archived=true where customer_id=p_customer and licence_number=p_number and not archived and id<>p_id;
  insert into public.customer_trade_licences(id,tenant_id,entity_id,customer_id,licence_number,authority,expiry_date,created_by)
    values(p_id,p_tenant,p_entity,p_customer,p_number,p_authority,p_expiry,auth.uid()) on conflict(id) do nothing;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'trade_licence.recorded',p_id,
    jsonb_build_object('customer_id',p_customer,'authority',p_authority,'expiry_date',p_expiry));
  return p_id;
end $$;

-- Customers whose latest follow-up date has arrived and who have had no remark since it was set.
create function public.my_follow_ups(p_tenant uuid,p_entity uuid,p_as_of date,p_all boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return coalesce((select jsonb_agg(jsonb_build_object('customer_id',r.customer_id,'customer',c.name,'account',c.account,'due',r.next_follow_up,
      'days_late',p_as_of-r.next_follow_up,'last_reason',r.reason,'last_note',r.note,'owner',r.created_by,'remark_id',r.id) order by r.next_follow_up,c.name)
    from (select distinct on (customer_id) * from public.customer_remarks where tenant_id=p_tenant and entity_id=p_entity order by customer_id,created_at desc,id) r
    join public.customers c on c.id=r.customer_id
    where r.next_follow_up is not null and r.next_follow_up<=p_as_of and (coalesce(p_all,false) or r.created_by=auth.uid())),'[]');
end $$;

-- Deterministic ranking, shown with its parts: overdue AED, weighted up by age and broken promises.
-- Customers with a future follow-up date are left out until that date.
create function public.daily_call_list(p_tenant uuid,p_entity uuid,p_as_of date,p_limit integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_as_of is null or not isfinite(p_as_of) or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid request'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('customer_id',x.customer_id,'customer',x.customer,'account',x.account,'overdue',x.overdue,
      'oldest_days',x.oldest_days,'broken_promises',x.broken_promises,'on_hold',x.on_hold,'contacts',x.contacts,'score',x.score::text,
      'why',concat_ws(' · ',x.oldest_days||' days overdue',case when x.broken_promises>0 then x.broken_promises||' broken promise(s)' end,
        case when x.on_hold then 'on credit hold' end,case when x.contacts=0 then 'no contact on file' end),
      'last_note',(select r.note from public.customer_remarks r where r.customer_id=x.customer_id order by r.created_at desc,r.id limit 1))
      order by x.score desc,x.customer) from (
    select w.customer_id,w.customer,w.account,w.overdue,coalesce(w.oldest_days,0) as oldest_days,w.broken_promises,w.on_hold,w.contacts,
      round(w.overdue::numeric*(1+least(coalesce(w.oldest_days,0),360)/90.0)*(1+least(w.broken_promises,3)*0.5),2) as score
    from jsonb_to_recordset(public.collections_worklist(p_tenant,p_entity,p_as_of)) as w(customer_id uuid,customer text,account text,overdue text,
      oldest_days integer,broken_promises integer,on_hold boolean,contacts integer)
    where w.overdue::numeric>0
      and not exists(select 1 from (select r.next_follow_up,r.created_at from public.customer_remarks r where r.customer_id=w.customer_id
          order by r.created_at desc,r.id limit 1) last
        where last.next_follow_up>p_as_of or (last.created_at at time zone 'Asia/Dubai')::date=p_as_of)
    order by score desc,w.customer limit p_limit) x),'[]');
end $$;

create function public.licence_alerts(p_tenant uuid,p_entity uuid,p_as_of date,p_days integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_days is null or p_days not between 0 and 365 then raise exception 'Invalid window'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'customer_id',l.customer_id,'customer',c.name,'account',c.account,'licence_number',l.licence_number,
      'authority',l.authority,'expiry_date',l.expiry_date,'days_left',l.expiry_date-p_as_of,'expired',l.expiry_date<p_as_of) order by l.expiry_date,c.name)
    from public.customer_trade_licences l join public.customers c on c.id=l.customer_id
    where l.tenant_id=p_tenant and l.entity_id=p_entity and not l.archived and l.expiry_date<=p_as_of+p_days),'[]');
end $$;

create function public.customer_remarks_list(p_tenant uuid,p_entity uuid,p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return jsonb_build_object(
    'remarks',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'invoice_id',r.invoice_id,'reason',r.reason,'channel',r.channel,'note',r.note,
      'next_follow_up',r.next_follow_up,'promise_id',r.promise_id,'created_by',r.created_by,'created_at',r.created_at) order by r.created_at desc)
      from (select * from public.customer_remarks where customer_id=p_customer and tenant_id=p_tenant and entity_id=p_entity order by created_at desc limit 50) r),'[]'),
    'licences',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'licence_number',l.licence_number,'authority',l.authority,'expiry_date',l.expiry_date) order by l.expiry_date)
      from public.customer_trade_licences l where l.customer_id=p_customer and l.tenant_id=p_tenant and l.entity_id=p_entity and not l.archived),'[]'));
end $$;

-- Remarks logged on one Dubai business date, for the daily collection pack.
create function public.remarks_logged(p_tenant uuid,p_entity uuid,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_date is null or not isfinite(p_date) then raise exception 'Invalid date'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('customer',c.name,'account',c.account,'invoice',i.number,'reason',r.reason,'channel',r.channel,
      'note',r.note,'next_follow_up',r.next_follow_up,'promise_amount',p.amount::text,'promise_date',p.promised_date,'created_by',r.created_by,'created_at',r.created_at)
      order by r.created_at,r.id)
    from public.customer_remarks r join public.customers c on c.id=r.customer_id left join public.invoices i on i.id=r.invoice_id
      left join public.payment_promises p on p.id=r.promise_id
    where r.tenant_id=p_tenant and r.entity_id=p_entity and (r.created_at at time zone 'Asia/Dubai')::date=p_date),'[]');
end $$;

revoke all on function public.add_customer_remark(uuid,uuid,uuid,uuid,uuid,text,text,text,date,text,date),public.add_trade_licence(uuid,uuid,uuid,uuid,text,text,date),
  public.my_follow_ups(uuid,uuid,date,boolean),public.daily_call_list(uuid,uuid,date,integer),public.licence_alerts(uuid,uuid,date,integer),
  public.customer_remarks_list(uuid,uuid,uuid),public.remarks_logged(uuid,uuid,date) from public,anon;
grant execute on function public.add_customer_remark(uuid,uuid,uuid,uuid,uuid,text,text,text,date,text,date),public.add_trade_licence(uuid,uuid,uuid,uuid,text,text,date),
  public.my_follow_ups(uuid,uuid,date,boolean),public.daily_call_list(uuid,uuid,date,integer),public.licence_alerts(uuid,uuid,date,integer),
  public.customer_remarks_list(uuid,uuid,uuid),public.remarks_logged(uuid,uuid,date) to authenticated;
commit;
