-- Sales from the till, imported from a report file (SPEC 6: file-based adapter).
--
-- The till has no known API, so the user uploads its sales report. The browser reads
-- the file and sends plain rows; nothing here depends on one report layout.
--
--   * sales_imports: one row per uploaded report. The file fingerprint is unique, so
--     the same report never lowers stock twice.
--   * sales_lines: one row per sold (or returned) item. When the report carries a
--     transaction number, the line gets a key that is unique in the business, so the
--     same sale inside a second, overlapping report is skipped too.
--   * A line whose code is not in the catalog is kept without a stock movement and
--     shown for handling; rematch_sales_lines applies it once the code exists.
--
-- Nobody writes these tables directly: only the SECURITY DEFINER functions below.

create table public.sales_imports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid not null,
  source text not null default 'pos_file' check (source in ('pos_file')),
  file_name text,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null,
  -- Rows that an earlier report had already brought in.
  skipped_count integer not null default 0,
  -- Period the report covers, when its rows carry dates.
  first_sold_at timestamptz,
  last_sold_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, file_sha256),
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id)
);

create index sales_imports_business_created_idx on public.sales_imports (business_id, created_at desc);

create table public.sales_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  import_id uuid not null,
  warehouse_id uuid not null,
  position integer not null,
  -- The item code exactly as the report shows it.
  code text not null check (length(code) between 1 and 64),
  transaction_ref text,
  -- transaction, code and its occurrence within the transaction; null without a transaction number.
  external_key text,
  sold_at timestamptz,
  -- Positive: sold. Negative: returned or cancelled.
  quantity numeric(12, 3) not null check (quantity <> 0),
  unit_price numeric(12, 2),
  variant_id uuid,
  -- Set when the stock movement was written.
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (import_id, business_id) references public.sales_imports (id, business_id) on delete cascade,
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id),
  foreign key (variant_id, business_id) references public.product_variants (id, business_id),
  constraint sales_lines_applied_has_variant check (applied_at is null or variant_id is not null)
);

create unique index sales_lines_external_key on public.sales_lines (business_id, external_key)
  where external_key is not null;
create index sales_lines_import_idx on public.sales_lines (import_id, position);
create index sales_lines_unmatched_idx on public.sales_lines (business_id) where applied_at is null;
create index sales_lines_variant_idx on public.sales_lines (variant_id, sold_at desc);

alter table public.stock_movements
  -- A sales line moves stock at most once.
  add column sales_line_id uuid unique references public.sales_lines (id),
  add constraint stock_movements_sale_has_line
    check ((kind in ('sale', 'return')) = (sales_line_id is not null));

alter table public.sales_imports enable row level security;
alter table public.sales_lines enable row level security;

create policy "sales imports: members read" on public.sales_imports
  for select to authenticated using (private.is_member(business_id));
create policy "sales lines: members read" on public.sales_lines
  for select to authenticated using (private.is_member(business_id));

revoke all on public.sales_imports, public.sales_lines from anon, authenticated;
grant select on public.sales_imports, public.sales_lines to authenticated;

-- ---------------------------------------------------------------------------
-- Internals
-- ---------------------------------------------------------------------------

-- The one variant a till code points at: the till barcode first, then a supplier barcode.
create function private.variant_for_till_code(p_business_id uuid, p_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(distinct c.variant_id) = 1 then min(c.variant_id::text)::uuid end
  from public.variant_codes c
  where c.business_id = p_business_id
    and c.code_norm = upper(btrim(p_code))
    and c.kind = (
      select c2.kind from public.variant_codes c2
      where c2.business_id = p_business_id
        and c2.code_norm = upper(btrim(p_code))
        and c2.kind in ('pos', 'barcode')
      order by (c2.kind = 'pos') desc
      limit 1
    );
$$;

-- Writes the stock movement of a matched line, once, and moves the balance with it.
create function private.apply_sales_line(p_line_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.sales_lines%rowtype;
begin
  select * into l from public.sales_lines where id = p_line_id for update;
  if not found or l.applied_at is not null or l.variant_id is null then
    return false;
  end if;

  insert into public.stock_movements (business_id, warehouse_id, variant_id, kind, quantity, sales_line_id, created_at)
  values (
    l.business_id, l.warehouse_id, l.variant_id,
    (case when l.quantity > 0 then 'sale' else 'return' end)::public.movement_kind,
    -l.quantity, l.id, coalesce(l.sold_at, now())
  );

  insert into public.stock_levels (business_id, warehouse_id, variant_id, quantity)
  values (l.business_id, l.warehouse_id, l.variant_id, -l.quantity)
  on conflict (warehouse_id, variant_id) do update
    set quantity = public.stock_levels.quantity + excluded.quantity, updated_at = now();

  update public.sales_lines set applied_at = now() where id = l.id;
  return true;
end;
$$;

revoke all on function private.variant_for_till_code(uuid, text) from public, anon, authenticated;
revoke all on function private.apply_sales_line(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Brings in one sales report.
-- p_rows: [{ "code", "quantity", "transaction_ref", "sold_at", "unit_price" }], in file order.
-- Returns the import id. Raises 'already_imported' for a file that was imported before.
create function public.import_sales(
  p_warehouse_id uuid,
  p_file_name text,
  p_file_sha256 text,
  p_rows jsonb
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
  if exists (
    select 1 from public.sales_imports i
    where i.business_id = v_business and i.file_sha256 = p_file_sha256
  ) then
    raise exception 'already_imported' using errcode = 'P0001';
  end if;

  insert into public.sales_imports (business_id, warehouse_id, file_name, file_sha256, row_count)
  values (v_business, p_warehouse_id, left(nullif(btrim(p_file_name), ''), 200), p_file_sha256, jsonb_array_length(p_rows))
  returning id into v_import;

  for r in
    select t.ord::integer as position,
           left(btrim(t.row ->> 'code'), 64) as code,
           nullif(left(btrim(t.row ->> 'transaction_ref'), 64), '') as transaction_ref,
           (t.row ->> 'quantity')::numeric as quantity,
           (t.row ->> 'unit_price')::numeric as unit_price,
           (t.row ->> 'sold_at')::timestamptz as sold_at,
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
      business_id, import_id, warehouse_id, position, code, transaction_ref, external_key,
      sold_at, quantity, unit_price, variant_id
    )
    values (
      v_business, v_import, p_warehouse_id, r.position, r.code, r.transaction_ref, v_key,
      r.sold_at, r.quantity, r.unit_price, private.variant_for_till_code(v_business, r.code)
    )
    returning id into v_line;
    perform private.apply_sales_line(v_line);
  end loop;

  update public.sales_imports i
  set skipped_count = v_skipped,
      first_sold_at = (select min(s.sold_at) from public.sales_lines s where s.import_id = v_import),
      last_sold_at = (select max(s.sold_at) from public.sales_lines s where s.import_id = v_import)
  where i.id = v_import;
  return v_import;
end;
$$;

-- Tries again to find the catalog item of every line that has none, and moves stock
-- for the ones it finds. Returns how many lines were applied.
create function public.rematch_sales_lines(p_business_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_variant uuid;
  v_count integer := 0;
begin
  if private.is_member(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for r in
    select s.id, s.code from public.sales_lines s
    where s.business_id = p_business_id and s.applied_at is null
    order by s.created_at, s.position
    for update
  loop
    v_variant := private.variant_for_till_code(p_business_id, r.code);
    if v_variant is not null then
      update public.sales_lines set variant_id = v_variant where id = r.id;
      if private.apply_sales_line(r.id) then
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.import_sales(uuid, text, text, jsonb) from public, anon;
revoke all on function public.rematch_sales_lines(uuid) from public, anon;
grant execute on function public.import_sales(uuid, text, text, jsonb) to authenticated;
grant execute on function public.rematch_sales_lines(uuid) to authenticated;
