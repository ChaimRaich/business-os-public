-- Catalog: warehouses, suppliers, products, variants, and code mappings.
--
-- A product is a model ("דגם"); every sellable item is a variant of it (size, colour),
-- and a product always has at least one variant. Each variant carries any number of
-- codes: supplier barcodes, supplier SKUs, the POS code, and the web-store id.
--
-- Every table carries business_id. Child rows reference their parent through
-- (id, business_id), so a row can never point at another business's data.

create type public.code_kind as enum ('barcode', 'supplier_sku', 'pos', 'web');

create function private.can_manage(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_in(p_business_id) in ('owner', 'manager');
$$;

grant execute on function private.can_manage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index warehouses_one_default on public.warehouses (business_id) where is_default;
create unique index warehouses_name_key on public.warehouses (business_id, lower(btrim(name)));

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  tax_id text,
  phone text,
  address text,
  -- The supplier's code and name as defined in the POS (used by the Excel export).
  pos_code text,
  pos_name text,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create unique index suppliers_name_key on public.suppliers (business_id, lower(btrim(name)));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  supplier_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id)
);

create index products_business_created_idx on public.products (business_id, created_at desc);
create index products_supplier_idx on public.products (supplier_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  product_id uuid not null,
  -- Empty for a product without variations; otherwise e.g. "מידה 7".
  label text not null default '' check (length(label) <= 80 and label = btrim(label)),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (product_id, business_id)
    references public.products (id, business_id) on delete cascade
);

create unique index product_variants_label_key on public.product_variants (product_id, lower(label));

create table public.variant_codes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  variant_id uuid not null,
  kind public.code_kind not null,
  supplier_id uuid,
  -- Stored exactly as printed: text, so leading zeros survive.
  code text not null check (length(code) between 1 and 64 and code = btrim(code)),
  -- Matching ignores letter case (cag004-1 = CAG004-1).
  code_norm text generated always as (upper(code)) stored,
  created_at timestamptz not null default now(),
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id) on delete cascade,
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id),
  -- A supplier SKU only means something together with its supplier.
  constraint variant_codes_supplier_matches_kind
    check ((kind = 'supplier_sku') = (supplier_id is not null))
);

-- A barcode, POS code or web id identifies exactly one variant in the business.
create unique index variant_codes_unique_code
  on public.variant_codes (business_id, kind, code_norm)
  where kind <> 'supplier_sku';

-- A supplier SKU is a model code: several variants (sizes) may share it.
create unique index variant_codes_supplier_sku_key
  on public.variant_codes (variant_id, supplier_id, code_norm)
  where kind = 'supplier_sku';

-- One POS code and one web id per variant.
create unique index variant_codes_single_pos_web
  on public.variant_codes (variant_id, kind)
  where kind in ('pos', 'web');

create index variant_codes_lookup_idx on public.variant_codes (business_id, code_norm);
create index variant_codes_variant_idx on public.variant_codes (variant_id);

-- ---------------------------------------------------------------------------
-- Row level security
--   read:   any member of the business
--   write:  any member for the catalog itself (staff create products while receiving goods)
--   delete: owner / manager
--   warehouses: owner / manager only
-- ---------------------------------------------------------------------------

alter table public.warehouses enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.variant_codes enable row level security;

create policy "warehouses: members read" on public.warehouses
  for select to authenticated using (private.is_member(business_id));
create policy "warehouses: managers insert" on public.warehouses
  for insert to authenticated with check (private.can_manage(business_id));
create policy "warehouses: managers update" on public.warehouses
  for update to authenticated
  using (private.can_manage(business_id)) with check (private.can_manage(business_id));

create policy "suppliers: members read" on public.suppliers
  for select to authenticated using (private.is_member(business_id));
create policy "suppliers: members insert" on public.suppliers
  for insert to authenticated with check (private.is_member(business_id));
create policy "suppliers: members update" on public.suppliers
  for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));

create policy "products: members read" on public.products
  for select to authenticated using (private.is_member(business_id));
create policy "products: members insert" on public.products
  for insert to authenticated with check (private.is_member(business_id));
create policy "products: members update" on public.products
  for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));
create policy "products: managers delete" on public.products
  for delete to authenticated using (private.can_manage(business_id));

create policy "variants: members read" on public.product_variants
  for select to authenticated using (private.is_member(business_id));
create policy "variants: members insert" on public.product_variants
  for insert to authenticated with check (private.is_member(business_id));
create policy "variants: members update" on public.product_variants
  for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));
create policy "variants: managers delete" on public.product_variants
  for delete to authenticated using (private.can_manage(business_id));

create policy "codes: members read" on public.variant_codes
  for select to authenticated using (private.is_member(business_id));
create policy "codes: members insert" on public.variant_codes
  for insert to authenticated with check (private.is_member(business_id));
create policy "codes: members delete" on public.variant_codes
  for delete to authenticated using (private.is_member(business_id));

-- Privileges. Updates are column-scoped so business_id and parent links never change;
-- a code is replaced (delete + insert), not edited.
revoke all on
  public.warehouses, public.suppliers, public.products,
  public.product_variants, public.variant_codes
  from anon, authenticated;

grant select, insert on
  public.warehouses, public.suppliers, public.products,
  public.product_variants, public.variant_codes
  to authenticated;
grant update (name, is_default) on public.warehouses to authenticated;
grant update (name, tax_id, phone, address, pos_code, pos_name, notes) on public.suppliers to authenticated;
grant update (name, supplier_id, notes) on public.products to authenticated;
grant update (label) on public.product_variants to authenticated;
grant delete on public.products, public.product_variants, public.variant_codes to authenticated;

-- ---------------------------------------------------------------------------
-- A product always keeps at least one variant.
-- ---------------------------------------------------------------------------

create function private.keep_last_variant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Skips the check when the product itself is being deleted (cascade).
  perform 1 from public.products p where p.id = old.product_id for update;
  if not found then
    return old;
  end if;
  if not exists (
    select 1 from public.product_variants v
    where v.product_id = old.product_id and v.id <> old.id
  ) then
    raise exception 'last_variant' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger product_variants_keep_last
  before delete on public.product_variants
  for each row execute function private.keep_last_variant();

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: the caller's RLS applies)
-- ---------------------------------------------------------------------------

-- Creates a product with its variants and codes in one transaction.
-- p_variants: [{ "label": "מידה 7", "codes": [{ "kind": "barcode", "code": "0123", "supplier_id": null }] }]
-- A supplier_sku code without supplier_id falls back to the product's supplier.
create function public.create_product(
  p_business_id uuid,
  p_name text,
  p_supplier_id uuid default null,
  p_notes text default null,
  p_variants jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_product uuid;
  v_variant uuid;
  v jsonb;
  c jsonb;
begin
  if jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) = 0 then
    p_variants := '[{"label": "", "codes": []}]'::jsonb;
  end if;

  insert into public.products (business_id, name, supplier_id, notes)
  values (p_business_id, btrim(p_name), p_supplier_id, nullif(btrim(p_notes), ''))
  returning id into v_product;

  for v in select * from jsonb_array_elements(p_variants) loop
    insert into public.product_variants (business_id, product_id, label)
    values (p_business_id, v_product, btrim(coalesce(v ->> 'label', '')))
    returning id into v_variant;

    for c in select * from jsonb_array_elements(coalesce(v -> 'codes', '[]'::jsonb)) loop
      insert into public.variant_codes (business_id, variant_id, kind, supplier_id, code)
      values (
        p_business_id,
        v_variant,
        (c ->> 'kind')::public.code_kind,
        case when c ->> 'kind' = 'supplier_sku'
          then coalesce(nullif(c ->> 'supplier_id', '')::uuid, p_supplier_id)
        end,
        btrim(c ->> 'code')
      );
    end loop;
  end loop;

  return v_product;
end;
$$;

-- Products whose name, supplier, variant label or any code contains the query.
create function public.search_products(p_business_id uuid, p_query text default '')
returns setof public.products
language sql
stable
set search_path = ''
as $$
  with q as (
    select
      btrim(coalesce(p_query, '')) = '' as is_empty,
      '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  )
  select p.*
  from public.products p, q
  where p.business_id = p_business_id
    and (
      q.is_empty
      or p.name ilike q.pattern
      or exists (
        select 1 from public.suppliers s
        where s.id = p.supplier_id and s.name ilike q.pattern
      )
      or exists (
        select 1 from public.product_variants v
        where v.product_id = p.id and v.label ilike q.pattern
      )
      or exists (
        select 1
        from public.product_variants v
        join public.variant_codes c on c.variant_id = v.id
        where v.product_id = p.id and c.code ilike q.pattern
      )
    )
  order by p.created_at desc, p.id;
$$;

create function public.set_default_warehouse(p_warehouse_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select w.business_id into v_business from public.warehouses w where w.id = p_warehouse_id;
  if v_business is null or not private.can_manage(v_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.warehouses set is_default = false
    where business_id = v_business and is_default and id <> p_warehouse_id;
  update public.warehouses set is_default = true where id = p_warehouse_id;
end;
$$;

revoke all on function public.create_product(uuid, text, uuid, text, jsonb) from public, anon;
revoke all on function public.search_products(uuid, text) from public, anon;
revoke all on function public.set_default_warehouse(uuid) from public, anon;
grant execute on function public.create_product(uuid, text, uuid, text, jsonb) to authenticated;
grant execute on function public.search_products(uuid, text) to authenticated;
grant execute on function public.set_default_warehouse(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Every business starts with a default warehouse.
-- ---------------------------------------------------------------------------

create or replace function public.create_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.businesses (name, created_by)
  values (btrim(p_name), v_user)
  returning id into v_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_id, v_user, 'owner');

  insert into public.warehouses (business_id, name, is_default)
  values (v_id, 'מחסן ראשי', true);

  return v_id;
end;
$$;

insert into public.warehouses (business_id, name, is_default)
select b.id, 'מחסן ראשי', true
from public.businesses b
where not exists (select 1 from public.warehouses w where w.business_id = b.id);
