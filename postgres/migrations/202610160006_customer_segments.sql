-- Customer segments: optional category and region on the customer master, set by makers (one record or
-- a CSV batch, all-or-nothing and audited), and an outstanding breakdown by category, region or customer
-- with the same aging buckets as the AR pack. Segments describe customers; they never change balances.
begin;

alter table public.customers
  add column category text check(category is null or (length(category) between 1 and 60 and category <> 'Unassigned')),
  add column region text check(region is null or (length(region) between 1 and 60 and region <> 'Unassigned'));

-- p_rows: [{account, category, region}], 1-2000 rows. An empty string clears a field. Every account must
-- exist in this entity or nothing changes. p_id makes a retried upload a no-op.
create function public.set_customer_segments(p_tenant uuid,p_entity uuid,p_id uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer; matched integer; prior public.audit_events;
begin
  if o2c_private.require_scope(p_tenant,p_entity) not in ('maker','admin') then raise exception 'Forbidden'; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 then raise exception 'Invalid segments'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
  select * into prior from public.audit_events where record_id=p_id and operation='customer_segments.set' and tenant_id=p_tenant and entity_id=p_entity;
  if found then
    if prior.actor=auth.uid() and prior.detail->>'digest'=md5(p_rows::text) then return (prior.detail->>'rows')::integer; end if;
    raise exception 'Idempotency key conflict';
  end if;
  select count(*),count(distinct trim(r.account)) into n,matched from jsonb_to_recordset(p_rows) as r(account text);
  if n<>matched or exists(select 1 from jsonb_to_recordset(p_rows) as r(account text) where coalesce(trim(r.account),'')='') then raise exception 'Each account must appear once'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) as r(account text)
    where not exists(select 1 from public.customers c where c.tenant_id=p_tenant and c.entity_id=p_entity and c.account=trim(r.account))) then raise exception 'Unknown customer account'; end if;
  update public.customers c set category=nullif(trim(coalesce(r.category,'')),''),region=nullif(trim(coalesce(r.region,'')),'')
    from jsonb_to_recordset(p_rows) as r(account text,category text,region text)
    where c.tenant_id=p_tenant and c.entity_id=p_entity and c.account=trim(r.account);
  insert into public.audit_events(tenant_id,entity_id,actor,operation,record_id,detail) values(p_tenant,p_entity,auth.uid(),'customer_segments.set',p_id,
    jsonb_build_object('rows',n,'digest',md5(p_rows::text)));
  return n;
end $$;

-- Outstanding by dimension ('category', 'region' or 'customer'), optionally filtered to one category and/or
-- region ('Unassigned' selects customers without one). Amounts are decimal strings.
create function public.outstanding_breakdown(p_tenant uuid,p_entity uuid,p_as_of date,p_dimension text,p_category text,p_region text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  if p_as_of is null or not isfinite(p_as_of) or p_dimension is null or p_dimension not in ('category','region','customer') then raise exception 'Invalid request'; end if;
  return (with o as (
      select c.id as customer_id,c.name,c.account,coalesce(c.category,'Unassigned') as category,coalesce(c.region,'Unassigned') as region,
        i.open,i.dispute,p_as_of-i.due_date as days
      from o2c_private.open_invoices(p_tenant,p_entity) i join public.customers c on c.id=i.customer_id
      where i.open>0 and (p_category is null or coalesce(c.category,'Unassigned')=p_category) and (p_region is null or coalesce(c.region,'Unassigned')=p_region)
    ), g as (
      select case p_dimension when 'category' then category when 'region' then region else name end as label,
        case when p_dimension='customer' then min(account) end as account,
        case when p_dimension='customer' then (array_agg(customer_id))[1] end as customer_id,
        count(distinct customer_id) as customers,count(*) as invoices,sum(open) as open,
        coalesce(sum(open) filter (where days<=0),0.00) as current,coalesce(sum(open) filter (where days between 1 and 30),0.00) as d1_30,
        coalesce(sum(open) filter (where days between 31 and 60),0.00) as d31_60,coalesce(sum(open) filter (where days between 61 and 90),0.00) as d61_90,
        coalesce(sum(open) filter (where days>90),0.00) as d90_plus,coalesce(sum(open) filter (where dispute='open'),0.00) as disputed
      from o group by case p_dimension when 'category' then category when 'region' then region else customer_id::text end,
        case p_dimension when 'category' then category when 'region' then region else name end
    ), t as (select coalesce(sum(open),0.00) as total from g)
    select jsonb_build_object('dimension',p_dimension,'as_of',p_as_of,'category',p_category,'region',p_region,
      'total',jsonb_build_object('customers',(select count(distinct customer_id) from o),'invoices',(select count(*) from o),'open',(select total from t)::text,
        'current',(select coalesce(sum(current),0.00) from g)::text,'d1_30',(select coalesce(sum(d1_30),0.00) from g)::text,'d31_60',(select coalesce(sum(d31_60),0.00) from g)::text,
        'd61_90',(select coalesce(sum(d61_90),0.00) from g)::text,'d90_plus',(select coalesce(sum(d90_plus),0.00) from g)::text,'disputed',(select coalesce(sum(disputed),0.00) from g)::text),
      'rows',coalesce((select jsonb_agg(jsonb_build_object('label',g.label,'account',g.account,'customer_id',g.customer_id,'customers',g.customers,'invoices',g.invoices,
        'open',g.open::text,'current',g.current::text,'d1_30',g.d1_30::text,'d31_60',g.d31_60::text,'d61_90',g.d61_90::text,'d90_plus',g.d90_plus::text,
        'disputed',g.disputed::text,'share_percent',case when t.total>0 then round(g.open*100/t.total,2)::text end) order by g.open desc,g.label)
        from g cross join t),'[]')));
end $$;

-- Segment values in use, for filters and the edit form.
create function public.customer_segments(p_tenant uuid,p_entity uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform o2c_private.require_scope(p_tenant,p_entity);
  return jsonb_build_object(
    'categories',coalesce((select jsonb_agg(distinct category order by category) from public.customers where tenant_id=p_tenant and entity_id=p_entity and category is not null),'[]'),
    'regions',coalesce((select jsonb_agg(distinct region order by region) from public.customers where tenant_id=p_tenant and entity_id=p_entity and region is not null),'[]'),
    'unassigned',(select count(*) from public.customers where tenant_id=p_tenant and entity_id=p_entity and (category is null or region is null)),
    'customers',(select count(*) from public.customers where tenant_id=p_tenant and entity_id=p_entity));
end $$;

revoke all on function public.set_customer_segments(uuid,uuid,uuid,jsonb),public.outstanding_breakdown(uuid,uuid,date,text,text,text),
  public.customer_segments(uuid,uuid) from public,anon;
grant execute on function public.set_customer_segments(uuid,uuid,uuid,jsonb),public.outstanding_breakdown(uuid,uuid,date,text,text,text),
  public.customer_segments(uuid,uuid) to authenticated;
commit;
