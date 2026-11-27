-- Sales reports as the till really writes them (SPEC 13.5): a summary per item for a
-- day, without a date and without a transaction number, and with lines that are not
-- stock at all (a general item, ear piercing, club membership).
--
--   * The user states which day the report sums up. One report per warehouse and day:
--     a second one would lower the same sales again.
--   * The fingerprint is now of the rows, not of the file: the till stamps the export
--     time into the file, so the same report exported twice is a different file.
--   * A wrong import can be cancelled (owner / manager): stock is put back by
--     documented adjustments, and the day can then be imported again.
--   * A code can be marked "not a stock item"; its lines are dropped now and in
--     every later report.
--   * The item name from the report is kept, so an unknown code can be recognised.

alter table public.sales_imports
  add column report_date date,
  add column ignored_count integer not null default 0,
  add column reverted_at timestamptz,
  add column reverted_by uuid references auth.users (id) on delete set null,
  drop constraint sales_imports_business_id_file_sha256_key;

create unique index sales_imports_fingerprint_key
  on public.sales_imports (business_id, file_sha256) where reverted_at is null;
create unique index sales_imports_report_date_key
  on public.sales_imports (warehouse_id, report_date) where reverted_at is null and report_date is not null;

alter table public.sales_lines
  add column item_name text;

create table public.sales_ignored_codes (
  business_id uuid not null references public.businesses (id) on delete cascade,
  code_norm text not null check (length(code_norm) between 1 and 64),
  -- As the report shows it, with the item name seen when it was marked.
  code text not null,
  item_name text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (business_id, code_norm)
);

alter table public.sales_ignored_codes enable row level security;
create policy "sales ignored codes: members read" on public.sales_ignored_codes
  for select to authenticated using (private.is_member(business_id));
revoke all on public.sales_ignored_codes from anon, authenticated;
grant select on public.sales_ignored_codes to authenticated;

-- ---------------------------------------------------------------------------
-- import_sales, replaced: report date, item names, ignored codes.
-- p_rows: [{ "code", "quantity", "item_name", "transaction_ref", "sold_at", "unit_price" }]
-- p_report_date: the day the report sums up, when its rows carry no date.
-- ---------------------------------------------------------------------------

drop function public.import_sales(uuid, text, text, jsonb);

create function public.import_sales(
  p_warehouse_id uuid,
  p_file_name text,
  p_fingerprint text,
  p_rows jsonb,
  p_report_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_import uuid;
  v_line uuid;
  v_key text;
  v_skipped integer := 0;
  v_ignored integer := 0;
  -- Midday in Israel, so the sale lands on the right day in any report.
  v_default_time timestamptz := (p_report_date + time '12:00') at time zone 'Asia/Jerusalem';
  r record;
begin
  select w.business_id into v_business from public.warehouses w where w.id = p_warehouse_id;
  if v_business is null or private.is_member(v_business) is not true then
    raise exception 'warehouse_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no_rows' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'too_many_rows' using errcode = 'P0001';
  end if;
  if p_report_date > (now() at time zone 'Asia/Jerusalem')::date then
    raise exception 'future_date' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.sales_imports i
    where i.business_id = v_business and i.file_sha256 = p_fingerprint and i.reverted_at is null
  ) then
    raise exception 'already_imported' using errcode = 'P0001';
  end if;
  if p_report_date is not null and exists (
    select 1 from public.sales_imports i
    where i.warehouse_id = p_warehouse_id and i.report_date = p_report_date and i.reverted_at is null
  ) then
    raise exception 'date_already_imported' using errcode = 'P0001';
  end if;

  insert into public.sales_imports (business_id, warehouse_id, file_name, file_sha256, row_count, report_date)
  values (v_business, p_warehouse_id, left(nullif(btrim(p_file_name), ''), 200), p_fingerprint,
          jsonb_array_length(p_rows), p_report_date)
  returning id into v_import;

  for r in
    select t.ord::integer as position,
           left(btrim(t.row ->> 'code'), 64) as code,
           nullif(left(btrim(t.row ->> 'item_name'), 200), '') as item_name,
           nullif(left(btrim(t.row ->> 'transaction_ref'), 64), '') as transaction_ref,
           (t.row ->> 'quantity')::numeric as quantity,
           (t.row ->> 'unit_price')::numeric as unit_price,
           coalesce((t.row ->> 'sold_at')::timestamptz, v_default_time) as sold_at,
           row_number() over (
             partition by t.row ->> 'transaction_ref', upper(btrim(t.row ->> 'code')),
                          sign((t.row ->> 'quantity')::numeric)
             order by t.ord
           ) as occurrence
    from jsonb_array_elements(p_rows) with ordinality as t(row, ord)
    order by t.ord
  loop
    if r.code is null or r.code = '' or r.quantity is null or r.quantity = 0 then
      raise exception 'bad_row' using errcode = 'P0001', detail = 'row ' || r.position;
    end if;
    if exists (
      select 1 from public.sales_ignored_codes g
      where g.business_id = v_business and g.code_norm = upper(r.code)
    ) then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    v_key := case when r.transaction_ref is not null
      then r.transaction_ref || '|' || upper(r.code) || '|' || (case when r.quantity > 0 then 's' else 'r' end) || r.occurrence
    end;
    if v_key is not null and exists (
      select 1 from public.sales_lines s where s.business_id = v_business and s.external_key = v_key
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.sales_lines (
      business_id, import_id, warehouse_id, position, code, item_name, transaction_ref, external_key,
      sold_at, quantity, unit_price, variant_id
    )
    values (
      v_business, v_import, p_warehouse_id, r.position, r.code, r.item_name, r.transaction_ref, v_key,
      r.sold_at, r.quantity, r.unit_price, private.variant_for_till_code(v_business, r.code)
    )
    returning id into v_line;
    perform private.apply_sales_line(v_line);
  end loop;

  update public.sales_imports i
  set skipped_count = v_skipped,
      ignored_count = v_ignored,
      first_sold_at = (select min(s.sold_at) from public.sales_lines s where s.import_id = v_import),
      last_sold_at = (select max(s.sold_at) from public.sales_lines s where s.import_id = v_import)
  where i.id = v_import;
  return v_import;
end;
$$;

-- ---------------------------------------------------------------------------
-- Not a stock item: drops the waiting lines of this code and skips it from now on.
-- Lines that already moved stock are not touched.
-- ---------------------------------------------------------------------------

create function public.ignore_sales_code(p_business_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_norm text := upper(btrim(coalesce(p_code, '')));
begin
  if private.is_member(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_norm = '' or length(v_norm) > 64 then
    raise exception 'bad_code' using errcode = 'P0001';
  end if;
  insert into public.sales_ignored_codes (business_id, code_norm, code, item_name)
  values (
    p_business_id, v_norm, btrim(p_code),
    (select s.item_name from public.sales_lines s
      where s.business_id = p_business_id and upper(s.code) = v_norm and s.item_name is not null
      order by s.created_at desc limit 1)
  )
  on conflict do nothing;
  delete from public.sales_lines s
  where s.business_id = p_business_id and upper(s.code) = v_norm and s.applied_at is null;
end;
$$;

create function public.unignore_sales_code(p_business_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_member(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.sales_ignored_codes g
  where g.business_id = p_business_id and g.code_norm = upper(btrim(coalesce(p_code, '')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancels an import (owner / manager). The ledger stays append-only: every sale it
-- lowered is put back by an adjustment that names the report. Its transaction keys
-- are released and its waiting lines dropped, so the report can be imported again.
-- ---------------------------------------------------------------------------

create function public.revert_sales_import(p_import_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.sales_imports%rowtype;
  r record;
  v_count integer := 0;
begin
  select * into i from public.sales_imports where id = p_import_id for update;
  if not found or private.is_member(i.business_id) is not true then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;
  if private.can_manage(i.business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if i.reverted_at is not null then
    return 0;
  end if;

  for r in
    select s.variant_id, s.warehouse_id, sum(s.quantity) as quantity
    from public.sales_lines s
    where s.import_id = i.id and s.applied_at is not null
    group by s.variant_id, s.warehouse_id
    having sum(s.quantity) <> 0
  loop
    insert into public.stock_movements (business_id, warehouse_id, variant_id, kind, quantity, reason)
    values (i.business_id, r.warehouse_id, r.variant_id, 'adjustment', r.quantity,
            'ביטול ייבוא דוח מכירות' || coalesce(' ' || i.file_name, ''));
    insert into public.stock_levels (business_id, warehouse_id, variant_id, quantity)
    values (i.business_id, r.warehouse_id, r.variant_id, r.quantity)
    on conflict (warehouse_id, variant_id) do update
      set quantity = public.stock_levels.quantity + excluded.quantity, updated_at = now();
    v_count := v_count + 1;
  end loop;

  delete from public.sales_lines s where s.import_id = i.id and s.applied_at is null;
  update public.sales_lines set external_key = null where import_id = i.id;
  update public.sales_imports set reverted_at = now(), reverted_by = auth.uid() where id = i.id;
  return v_count;
end;
$$;

revoke all on function public.import_sales(uuid, text, text, jsonb, date) from public, anon;
revoke all on function public.ignore_sales_code(uuid, text) from public, anon;
revoke all on function public.unignore_sales_code(uuid, text) from public, anon;
revoke all on function public.revert_sales_import(uuid) from public, anon;
grant execute on function public.import_sales(uuid, text, text, jsonb, date) to authenticated;
grant execute on function public.ignore_sales_code(uuid, text) to authenticated;
grant execute on function public.unignore_sales_code(uuid, text) to authenticated;
grant execute on function public.revert_sales_import(uuid) to authenticated;
