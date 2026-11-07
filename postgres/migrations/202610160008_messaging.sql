-- SMS and WhatsApp share the independently approved, ledger-checked collections outbox.
-- Twilio creates do not offer Resend's idempotency guarantee: never automatically retry phone sends.
begin;
alter table public.customer_contacts
  add column phone text check(phone ~ '^\+[1-9][0-9]{7,14}$'),
  add column sms_opt_in boolean not null default false,
  add column whatsapp_opt_in boolean not null default false,
  add column consent_note text check(length(consent_note) between 5 and 500),
  add constraint contact_messaging_consent check(not (sms_opt_in or whatsapp_opt_in) or (phone is not null and consent_note is not null));
alter table public.collection_messages
  add column channel text not null default 'email' check(channel in ('email','sms','whatsapp')),
  add column to_phone text,
  add constraint message_phone check(channel='email' or (to_phone is not null and to_phone ~ '^\+[1-9][0-9]{7,14}$' and not attach_statement and length(body)<=1600));
drop function public.add_customer_contact(uuid,uuid,uuid,uuid,text,text,text,boolean);
drop function public.propose_collection_message(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[],boolean);


create function public.add_customer_contact(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_name text,p_email text,p_role text,p_primary boolean,
  p_phone text default null,p_sms boolean default false,p_whatsapp boolean default false,p_consent text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare prior public.customer_contacts;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if not exists(select 1 from public.customers where id=p_customer and tenant_id=p_tenant and entity_id=p_entity) then raise exception 'Customer unavailable'; end if;
  p_phone:=nullif(trim(p_phone),'');
  if p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid phone: use E.164'; end if;
  if (coalesce(p_sms,false) or coalesce(p_whatsapp,false)) and (p_phone is null or length(trim(coalesce(p_consent,''))) not between 5 and 500) then raise exception 'Phone and consent evidence required'; end if;
  select * into prior from public.customer_contacts where id=p_id;
  if found then
    if prior.customer_id=p_customer and prior.email=lower(p_email) and prior.created_by=auth.uid() and prior.tenant_id=p_tenant and prior.entity_id=p_entity
      and prior.phone is not distinct from p_phone and prior.sms_opt_in=coalesce(p_sms,false)
      and prior.whatsapp_opt_in=coalesce(p_whatsapp,false) and prior.consent_note is not distinct from nullif(trim(p_consent),'') then return p_id; end if;
    raise exception 'Idempotency key conflict';
  end if;
  if coalesce(p_primary,false) then update public.customer_contacts set is_primary=false where customer_id=p_customer and is_primary; end if;
  insert into public.customer_contacts(id,tenant_id,entity_id,customer_id,name,email,role,is_primary,created_by,phone,sms_opt_in,whatsapp_opt_in,consent_note)
    values(p_id,p_tenant,p_entity,p_customer,p_name,lower(p_email),coalesce(p_role,'ar'),coalesce(p_primary,false),auth.uid(),p_phone,coalesce(p_sms,false),coalesce(p_whatsapp,false),nullif(trim(p_consent),''));
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'contact.added',p_id,
    jsonb_build_object('customer_id',p_customer,'role',coalesce(p_role,'ar'),'primary',coalesce(p_primary,false),'sms_opt_in',coalesce(p_sms,false),'whatsapp_opt_in',coalesce(p_whatsapp,false),'consent_note',nullif(trim(p_consent),'')));
  return p_id;
end $$;

create or replace function public.propose_collection_message(p_tenant uuid,p_entity uuid,p_id uuid,p_customer uuid,p_contact uuid,p_tone text,
  p_subject text,p_body text,p_invoices uuid[],p_attach boolean,p_channel text default 'email') returns jsonb
language plpgsql security definer set search_path='' as $$
declare role text := o2c_private.require_scope(p_tenant,p_entity); c public.customer_contacts; total numeric(15,2); matched integer;
  prior public.collection_messages; run uuid := o2c_private.current_agent_run();
begin
  if role not in ('maker','admin','agent') then raise exception 'Forbidden'; end if;
  if role='agent' and run is null then raise exception 'Forbidden'; end if;
  if role='agent' then perform o2c_private.assert_agent_tool_allowed(p_tenant,p_entity,run,'propose_collection_message'); end if;
  p_channel:=coalesce(p_channel,'email');
  if p_channel not in ('email','sms','whatsapp') then raise exception 'Invalid channel'; end if;
  if p_channel<>'email' and coalesce(p_attach,false) then raise exception 'Phone channels do not support statement attachments'; end if;
  if p_channel<>'email' and length(p_body)>1600 then raise exception 'Phone message exceeds 1600 characters'; end if;
  if p_tone not in ('reminder','firm','final_notice') or p_invoices is null or cardinality(p_invoices) not between 1 and 30 then raise exception 'Invalid message'; end if;
  select * into prior from public.collection_messages where id=p_id;
  if found then
    if prior.customer_id=p_customer and prior.maker=auth.uid() and prior.subject=p_subject and prior.body=p_body
      and prior.tenant_id=p_tenant and prior.entity_id=p_entity and prior.channel=p_channel and prior.contact_id=p_contact
      and prior.tone=p_tone and prior.invoice_ids=p_invoices and prior.attach_statement=coalesce(p_attach,false) then
      return jsonb_build_object('id',prior.id,'status',prior.status,'total_overdue',prior.total_overdue::text); end if;
    raise exception 'Idempotency key conflict';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer::text,1));
  if exists(select 1 from public.collection_messages where customer_id=p_customer and status in ('pending','approved','sending')) then
    raise exception 'This customer already has a message awaiting approval or sending'; end if;
  select * into c from public.customer_contacts where id=p_contact and customer_id=p_customer and tenant_id=p_tenant and entity_id=p_entity and not archived;
  if not found then raise exception 'Contact required: add an AR contact for this customer first'; end if;
  if p_channel<>'email' and (c.phone is null or (p_channel='sms' and not c.sms_opt_in) or (p_channel='whatsapp' and not c.whatsapp_opt_in)) then
    raise exception 'Contact phone and channel consent required'; end if;
  select count(*),coalesce(sum(o.open),0) into matched,total from o2c_private.open_invoices(p_tenant,p_entity) o
    where o.id=any(p_invoices) and o.customer_id=p_customer and o.open>0 and o.due_date<o2c_private.dubai_today() and o.dispute<>'open';
  if matched<>cardinality(p_invoices) then raise exception 'Every invoice must be an overdue, undisputed open invoice of this customer'; end if;
  insert into public.collection_messages(id,tenant_id,entity_id,customer_id,contact_id,to_email,tone,subject,body,invoice_ids,total_overdue,attach_statement,maker,agent_run_id,channel,to_phone)
    values(p_id,p_tenant,p_entity,p_customer,p_contact,c.email,p_tone,p_subject,p_body,p_invoices,total,coalesce(p_attach,false),auth.uid(),run,p_channel,case when p_channel<>'email' then c.phone end);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'collection_message.proposed',p_id,
    jsonb_build_object('customer_id',p_customer,'tone',p_tone,'channel',p_channel,'to',case when p_channel='email' then c.email else c.phone end,'total_overdue',total::text,'invoices',cardinality(p_invoices),'agent_run_id',run));
  return jsonb_build_object('id',p_id,'status','pending','total_overdue',total::text,'to',case when p_channel='email' then c.email else c.phone end,'channel',p_channel);
end $$;

create or replace function public.decide_collection_message(p_tenant uuid,p_entity uuid,p_id uuid,p_decision text) returns void
language plpgsql security definer set search_path='' as $$
declare m public.collection_messages;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('approver','admin') then raise exception 'Forbidden'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into m from public.collection_messages where id=p_id and tenant_id=p_tenant and entity_id=p_entity for update;
  if not found or m.maker=auth.uid() then raise exception 'Independent checker required'; end if;
  if m.status=p_decision and m.checker=auth.uid() then return; end if;
  if m.status<>'pending' then raise exception 'Message is not pending'; end if;
  -- The checker approves what the ledger says now, not what it said when the message was drafted.
  if p_decision='approved' and not o2c_private.message_evidence_current(p_id) then
    raise exception 'Stale evidence: an invoice was paid, disputed or changed, or the contact was removed. Reject this message and propose a new one'; end if;
  update public.collection_messages set status=p_decision,checker=auth.uid(),decided_at=now() where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'collection_message.'||p_decision,p_id,
    jsonb_build_object('channel',m.channel,'to',case when m.channel='email' then m.to_email else m.to_phone end,'total_overdue',m.total_overdue::text));
end $$;

create or replace function o2c_private.message_evidence_current(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare m public.collection_messages; matched integer; total numeric(15,2);
begin
  select * into m from public.collection_messages where id=p_id;
  if not found or not exists(select 1 from public.customer_contacts k where k.id=m.contact_id and k.tenant_id=m.tenant_id and k.entity_id=m.entity_id and k.customer_id=m.customer_id and not k.archived
    and (case m.channel when 'email' then k.email=m.to_email when 'sms' then k.phone=m.to_phone and k.sms_opt_in
      when 'whatsapp' then k.phone=m.to_phone and k.whatsapp_opt_in else false end)) then return false; end if;
  select count(*),coalesce(sum(o.open),0) into matched,total from o2c_private.open_invoices(m.tenant_id,m.entity_id) o
    where o.id=any(m.invoice_ids) and o.customer_id=m.customer_id and o.open>0 and o.due_date<o2c_private.dubai_today() and o.dispute<>'open';
  return matched=cardinality(m.invoice_ids) and total=m.total_overdue;
end $$;

create function o2c_private.claim_collection_messages(p_limit integer,p_channels text[]) returns jsonb
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
  into result from updated u join public.customers c on c.id=u.customer_id;
  return result;
end $$;

create or replace function o2c_private.claim_collection_messages(p_limit integer) returns jsonb
language sql security definer set search_path='' as $$
  select o2c_private.claim_collection_messages(p_limit,array['email']::text[])
$$;

create or replace function o2c_private.complete_collection_message(p_id uuid,p_attempt integer,p_ok boolean,p_provider_id text,p_error text) returns text
language plpgsql security definer set search_path='' as $$
declare m public.collection_messages; final text;
begin
  select * into m from public.collection_messages where id=p_id for update;
  -- A late worker whose attempt was reclaimed must not overwrite the newer attempt.
  if not found or m.status<>'sending' or m.attempts<>p_attempt then raise exception 'Message is not sending'; end if;
  final:=case when p_ok then 'sent' when m.channel='email' and m.attempts<3 then 'approved' else 'failed' end;
  update public.collection_messages set status=final,provider_id=case when p_ok then left(p_provider_id,200) else provider_id end,
    error=case when p_ok then null else left(p_error,1000) end,sent_at=case when p_ok then now() else sent_at end where id=p_id;
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(m.tenant_id,m.entity_id,m.checker,'collection_message.'||final,p_id,
    jsonb_build_object('channel',m.channel,'to',case when m.channel='email' then m.to_email else m.to_phone end,'attempt',m.attempts,'provider_id',p_provider_id,'error',left(p_error,300)));
  return final;
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
      'status',o2c_private.promise_state(p_tenant,p_entity,p.customer_id,p.invoice_id,p.status,p.promised_date,p_as_of),'resolvable',p.status='open','note',p.note) order by p.promised_date desc)
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

revoke all on function public.add_customer_contact(uuid,uuid,uuid,uuid,text,text,text,boolean,text,boolean,boolean,text),
  public.propose_collection_message(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[],boolean,text) from public,anon;
grant execute on function public.add_customer_contact(uuid,uuid,uuid,uuid,text,text,text,boolean,text,boolean,boolean,text),
  public.propose_collection_message(uuid,uuid,uuid,uuid,uuid,text,text,text,uuid[],boolean,text) to authenticated;
revoke all on function o2c_private.claim_collection_messages(integer,text[]) from public,anon,authenticated;
grant execute on function o2c_private.claim_collection_messages(integer,text[]) to o2c_app;
commit;
