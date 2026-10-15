-- Security hardening (red-team review 2026-10-16).
-- The policy daily auto-execution limit counted approvals by proposal date, so a proposal created on an
-- earlier day and auto-posted today escaped today's limit. Count by journal posting date instead.
begin;
create or replace function public.agent_auto_post(p_tenant uuid,p_entity uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.approvals; p public.agent_policies; b public.bank_lines; r public.receipts; posted_today numeric; journal uuid; exact boolean;
begin
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
end $$;

create or replace function public.agent_console(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  select jsonb_build_object(
    'agent_user',(select m.user_id from public.memberships m where m.tenant_id=p_tenant and m.role='agent' limit 1),
    'schedules',coalesce((select jsonb_object_agg(kind,cadence) from public.agent_schedules where tenant_id=p_tenant and entity_id=p_entity),'{}'),
    'policies',coalesce((select jsonb_agg(jsonb_build_object('id',id,'auto_execute',auto_execute,'per_item_limit',per_item_limit::text,'daily_limit',daily_limit::text,
      'status',status,'maker',maker,'checker',checker,'created_at',created_at,'decided_at',decided_at) order by created_at desc)
      from (select * from public.agent_policies where tenant_id=p_tenant and entity_id=p_entity and status in ('pending','active') order by created_at desc limit 10) p),'[]'),
    'auto_posted_today',(select coalesce(sum(j.amount),0)::text from public.journals j join public.approvals x on x.id=j.approval_id
      where j.tenant_id=p_tenant and j.entity_id=p_entity and x.checker_basis='policy' and (j.created_at at time zone 'Asia/Dubai')::date=o2c_private.dubai_today()),
    'runs',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'name',name,'status',status,'trigger',trigger,'requested_by',requested_by,'as_of',as_of,
      'model',model,'input_tokens',input_tokens,'output_tokens',output_tokens,'cost_usd',cost_usd::text,'summary',summary,'error',error,'step_count',step_count,
      'created_at',created_at,'started_at',started_at,'finished_at',finished_at,
      'proposals',(select count(*) from public.approvals a where a.agent_run_id=r.id),
      'auto_posted',(select count(*) from public.approvals a where a.agent_run_id=r.id and a.checker_basis='policy' and a.status='posted')) order by created_at desc,id)
      from (select * from public.agent_runs where tenant_id=p_tenant and entity_id=p_entity and kind is not null order by created_at desc,id limit 30) r),'[]'))
  into result;
  return result;
end $$;
commit;
