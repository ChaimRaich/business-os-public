-- Export to the till (POS): everything the Excel template needs that a supplier
-- document does not carry (SPEC 6, 13.4).
--
--   * per supplier: which barcode goes to the till and how the selling price is set;
--   * per business: the till's departments;
--   * per product: its department and its name in the till;
--   * per variant: club price and selling price;
--   * pos_exports: a frozen copy of every file that was produced.

-- ---------------------------------------------------------------------------
-- Supplier rules
-- ---------------------------------------------------------------------------

alter table public.suppliers
  -- 'internal': the shop assigns its own barcode (a prefix and a running number).
  -- 'supplier': the till uses the supplier's barcode, or its item code when it prints none.
  add column pos_barcode_source text not null default 'internal'
    check (pos_barcode_source in ('internal', 'supplier')),
  -- The next internal barcode to hand out, e.g. "N12000101". The trailing digits count up.
  add column pos_next_barcode text
    check (pos_next_barcode ~ '^[^[:space:]]{0,16}[0-9]{1,12}$'),
  -- 'multiplier': club price = cost x price_multiplier.
  -- 'retail': the supplier's printed consumer price is the selling price.
  add column price_mode text not null default 'multiplier'
    check (price_mode in ('multiplier', 'retail')),
  add column price_multiplier numeric(6, 3) check (price_multiplier > 0);

grant update (pos_barcode_source, pos_next_barcode, price_mode, price_multiplier)
  on public.suppliers to authenticated;

-- ---------------------------------------------------------------------------
-- Departments as they are defined in the till
-- ---------------------------------------------------------------------------

create table public.pos_departments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- In the till the code identifies the sub-department (SPEC 13.4).
  code text not null check (code ~ '^[0-9]{1,9}$'),
  department text not null check (length(btrim(department)) between 1 and 80),
  sub_department text not null check (length(btrim(sub_department)) between 1 and 80),
  -- Suggested item name for products of this department, e.g. "טבעת כסף".
  item_name text check (length(item_name) <= 80),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, code)
);

alter table public.pos_departments enable row level security;

create policy "pos departments: members read" on public.pos_departments
  for select to authenticated using (private.is_member(business_id));
create policy "pos departments: managers insert" on public.pos_departments
  for insert to authenticated with check (private.can_manage(business_id));
create policy "pos departments: managers update" on public.pos_departments
  for update to authenticated
  using (private.can_manage(business_id)) with check (private.can_manage(business_id));
create policy "pos departments: managers delete" on public.pos_departments
  for delete to authenticated using (private.can_manage(business_id));

revoke all on public.pos_departments from anon, authenticated;
grant select, insert, delete on public.pos_departments to authenticated;
grant update (code, department, sub_department, item_name) on public.pos_departments to authenticated;

-- ---------------------------------------------------------------------------
-- Product and variant fields
-- ---------------------------------------------------------------------------

alter table public.products
  add column pos_department_id uuid,
  add column pos_item_name text check (length(pos_item_name) <= 80),
  add foreign key (pos_department_id, business_id)
    references public.pos_departments (id, business_id) on delete set null (pos_department_id);

alter table public.product_variants
  add column club_price numeric(10, 2) check (club_price > 0),
  add column sale_price numeric(10, 2) check (sale_price > 0);

grant update (pos_department_id, pos_item_name) on public.products to authenticated;
grant update (club_price, sale_price) on public.product_variants to authenticated;

-- ---------------------------------------------------------------------------
-- Exports: written only by create_pos_export / confirm_pos_export
-- ---------------------------------------------------------------------------

create table public.pos_exports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  document_id uuid not null,
  template text not null,
  sheet_name text not null,
  -- The rows exactly as written to the file; a later download repeats them.
  rows jsonb not null,
  row_count integer not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Set when the user reports that the till accepted the file.
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  foreign key (document_id, business_id) references public.documents (id, business_id)
);

create index pos_exports_document_idx on public.pos_exports (document_id, created_at desc);

alter table public.pos_exports enable row level security;

create policy "pos exports: members read" on public.pos_exports
  for select to authenticated using (private.is_member(business_id));

revoke all on public.pos_exports from anon, authenticated;
grant select on public.pos_exports to authenticated;

-- ---------------------------------------------------------------------------
-- Builds the till file rows for an approved document.
-- p_rows: [{ "variant_id", "item_name", "department_id", "club_price", "sale_price" }],
-- one per distinct variant in the document. Saves these choices on the catalog,
-- gives every item its till barcode (once), and stores the rows. Returns the export id.
-- ---------------------------------------------------------------------------

create function public.create_pos_export(p_document_id uuid, p_rows jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
  s public.suppliers%rowtype;
  r record;
  v_code text;
  v_next text;
  v_digits text;
  v_rows jsonb := '[]'::jsonb;
  v_id uuid;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or private.is_member(d.business_id) is not true then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if d.status <> 'approved' then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;
  select * into s from public.suppliers where id = d.supplier_id for update;
  if not found then
    raise exception 'supplier_required' using errcode = 'P0001';
  end if;
  if nullif(btrim(s.pos_code), '') is null or nullif(btrim(s.pos_name), '') is null then
    raise exception 'supplier_pos_missing' using errcode = 'P0001';
  end if;
  v_next := s.pos_next_barcode;

  for r in
    with received as (
      select l.variant_id, sum(l.quantity) as quantity, min(l.position) as position,
             (array_agg(l.unit_cost order by l.position) filter (where l.unit_cost is not null))[1] as unit_cost
      from public.document_lines l
      where l.document_id = d.id
      group by l.variant_id
    )
    select rc.*, v.product_id,
           nullif(btrim(i.item_name), '') as item_name,
           i.club_price, i.sale_price,
           dep.id as department_id, dep.code as department_code,
           dep.department, dep.sub_department,
           (select c.code from public.variant_codes c
             where c.variant_id = rc.variant_id and c.kind = 'pos') as pos_code,
           (select c.code from public.variant_codes c
             where c.variant_id = rc.variant_id and c.kind = 'barcode'
             order by c.created_at limit 1) as supplier_barcode,
           (select c.code from public.variant_codes c
             where c.variant_id = rc.variant_id and c.kind = 'supplier_sku' and c.supplier_id = s.id
             order by c.created_at limit 1) as supplier_sku
    from received rc
    join public.product_variants v on v.id = rc.variant_id
    left join jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
      as i(variant_id uuid, item_name text, department_id uuid, club_price numeric, sale_price numeric)
      on i.variant_id = rc.variant_id
    left join public.pos_departments dep
      on dep.id = i.department_id and dep.business_id = d.business_id
    order by rc.position
  loop
    if r.item_name is null or r.department_id is null
       or r.club_price is null or r.club_price <= 0
       or r.sale_price is null or r.sale_price <= 0 then
      raise exception 'rows_incomplete' using errcode = 'P0001';
    end if;
    if r.unit_cost is null then
      raise exception 'cost_missing' using errcode = 'P0001';
    end if;

    v_code := r.pos_code;
    if v_code is null then
      if s.pos_barcode_source = 'supplier' then
        v_code := coalesce(r.supplier_barcode, r.supplier_sku);
        if v_code is null then
          raise exception 'barcode_missing' using errcode = 'P0001';
        end if;
      else
        if v_next is null then
          raise exception 'barcode_rule_missing' using errcode = 'P0001';
        end if;
        loop
          v_code := v_next;
          v_digits := substring(v_next from '[0-9]+$');
          v_next := left(v_next, length(v_next) - length(v_digits))
            || lpad((v_digits::bigint + 1)::text, length(v_digits), '0');
          exit when not exists (
            select 1 from public.variant_codes c
            where c.business_id = d.business_id and c.kind = 'pos' and c.code_norm = upper(v_code)
          );
        end loop;
      end if;
      insert into public.variant_codes (business_id, variant_id, kind, code)
      values (d.business_id, r.variant_id, 'pos', v_code);
    end if;

    update public.product_variants
    set club_price = r.club_price, sale_price = r.sale_price
    where id = r.variant_id;
    update public.products
    set pos_department_id = r.department_id, pos_item_name = left(r.item_name, 80)
    where id = r.product_id;

    v_rows := v_rows || jsonb_build_object(
      'barcode', v_code,
      'item_name', left(r.item_name, 80),
      'sale_price', r.sale_price,
      'club_price', r.club_price,
      'supplier_code', btrim(s.pos_code),
      'supplier_name', btrim(s.pos_name),
      'department_code', r.department_code,
      'department', r.department,
      'sub_department', r.sub_department,
      'cost', round(r.unit_cost, 2),
      'quantity', r.quantity
    );
  end loop;

  if jsonb_array_length(v_rows) = 0 then
    raise exception 'no_lines' using errcode = 'P0001';
  end if;
  if v_next is distinct from s.pos_next_barcode then
    update public.suppliers set pos_next_barcode = v_next where id = s.id;
  end if;

  insert into public.pos_exports (business_id, document_id, template, sheet_name, rows, row_count)
  values (d.business_id, d.id, 'pos-xls-v1', left('פריטי ' || btrim(s.pos_name), 31), v_rows, jsonb_array_length(v_rows))
  returning id into v_id;
  return v_id;
end;
$$;

-- The user reports that the till accepted the file. Producing a file is not that.
create function public.confirm_pos_export(p_export_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select e.business_id into v_business from public.pos_exports e where e.id = p_export_id;
  if v_business is null or private.is_member(v_business) is not true then
    raise exception 'export_not_found' using errcode = 'P0002';
  end if;
  update public.pos_exports
  set confirmed_at = now(), confirmed_by = auth.uid()
  where id = p_export_id and confirmed_at is null;
end;
$$;

revoke all on function public.create_pos_export(uuid, jsonb) from public, anon;
revoke all on function public.confirm_pos_export(uuid) from public, anon;
grant execute on function public.create_pos_export(uuid, jsonb) to authenticated;
grant execute on function public.confirm_pos_export(uuid) to authenticated;
