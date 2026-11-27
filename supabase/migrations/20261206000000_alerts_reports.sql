-- Low-stock thresholds and the two reports of SPEC 7: what is running out, and what
-- sold, by product and by supplier.
--
-- A threshold is set per item; an item without one uses the business default. An item
-- is only judged once it has stock history: a catalog entry that never received goods
-- is not "out of stock".
--
-- Both functions are SECURITY INVOKER: the caller's RLS decides what they see.

alter table public.businesses
  add column low_stock_default numeric(12, 3) check (low_stock_default >= 0);
alter table public.product_variants
  add column low_stock_threshold numeric(12, 3) check (low_stock_threshold >= 0);

-- The existing policies decide who: the owner for the business, any member for an item.
grant update (low_stock_default) on public.businesses to authenticated;
grant update (low_stock_threshold) on public.product_variants to authenticated;

create index sales_lines_business_sold_idx on public.sales_lines (business_id, sold_at)
  where applied_at is not null;

-- Every item with stock history: its balance over all warehouses, the threshold that
-- applies to it, and where it stands.
--   negative: more was sold than was ever received here; the records need attention.
--   out:      nothing left.
--   low:      at or under the threshold.
create function public.stock_overview(p_business_id uuid)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  variant_label text,
  supplier_id uuid,
  supplier_name text,
  quantity numeric,
  threshold numeric,
  own_threshold boolean,
  state text,
  sold_30_days numeric
)
language sql
stable
set search_path = ''
as $$
  with balance as (
    select l.variant_id, sum(l.quantity) as quantity
    from public.stock_levels l
    where l.business_id = p_business_id
    group by l.variant_id
  ),
  recent as (
    select s.variant_id, sum(s.quantity) as quantity
    from public.sales_lines s
    join public.sales_imports i on i.id = s.import_id
    where s.business_id = p_business_id
      and s.applied_at is not null
      and i.reverted_at is null
      and s.sold_at >= now() - interval '30 days'
    group by s.variant_id
  )
  select v.id, p.id, p.name, v.label, sup.id, sup.name,
         b.quantity,
         coalesce(v.low_stock_threshold, biz.low_stock_default),
         v.low_stock_threshold is not null,
         case
           when b.quantity < 0 then 'negative'
           when b.quantity = 0 then 'out'
           when b.quantity <= coalesce(v.low_stock_threshold, biz.low_stock_default) then 'low'
           else 'ok'
         end,
         coalesce(r.quantity, 0)
  from balance b
  join public.product_variants v on v.id = b.variant_id
  join public.products p on p.id = v.product_id
  join public.businesses biz on biz.id = p.business_id
  left join public.suppliers sup on sup.id = p.supplier_id
  left join recent r on r.variant_id = v.id
  where p.business_id = p_business_id;
$$;

-- Sales per item between two dates (inclusive, by the day in Israel). Only sales that
-- reached stock count: lines without a catalog item and cancelled imports are left out.
-- "amount" is quantity x the price the source reported, which for the till's summary
-- report is the list price, not necessarily what the customer paid.
create function public.sales_report(p_business_id uuid, p_from date, p_to date)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  variant_label text,
  supplier_id uuid,
  supplier_name text,
  units_sold numeric,
  units_returned numeric,
  till_units numeric,
  web_units numeric,
  amount numeric,
  priced boolean
)
language sql
stable
set search_path = ''
as $$
  select v.id, p.id, p.name, v.label, sup.id, sup.name,
         coalesce(sum(s.quantity) filter (where s.quantity > 0), 0),
         coalesce(-sum(s.quantity) filter (where s.quantity < 0), 0),
         coalesce(sum(s.quantity) filter (where i.source = 'pos_file'), 0),
         coalesce(sum(s.quantity) filter (where i.source = 'woocommerce'), 0),
         coalesce(sum(s.quantity * s.unit_price), 0),
         bool_and(s.unit_price is not null)
  from public.sales_lines s
  join public.sales_imports i on i.id = s.import_id
  join public.product_variants v on v.id = s.variant_id
  join public.products p on p.id = v.product_id
  left join public.suppliers sup on sup.id = p.supplier_id
  where s.business_id = p_business_id
    and s.applied_at is not null
    and i.reverted_at is null
    and (s.sold_at at time zone 'Asia/Jerusalem')::date between p_from and p_to
  group by v.id, p.id, p.name, v.label, sup.id, sup.name;
$$;

revoke all on function public.stock_overview(uuid) from public, anon;
revoke all on function public.sales_report(uuid, date, date) from public, anon;
grant execute on function public.stock_overview(uuid) to authenticated;
grant execute on function public.sales_report(uuid, date, date) to authenticated;
