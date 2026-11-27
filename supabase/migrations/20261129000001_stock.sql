-- Stock: approving a received document writes one movement per line and raises the
-- balance, in the same transaction and only once. The ledger (stock_movements) is
-- append-only; stock_levels is the running balance per warehouse and variant.
--
-- Nobody writes these tables directly: only the SECURITY DEFINER functions below do,
-- and each one checks the caller's membership itself.

create type public.movement_kind as enum ('receipt', 'adjustment');

-- For someone who is not a member role_in is null, and "null in (...)" is null, not
-- false. Policies treat null as a refusal, but "if not can_manage(...)" would not.
create or replace function private.can_manage(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.role_in(p_business_id) in ('owner', 'manager'), false);
$$;

alter table public.documents
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users (id) on delete set null;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid not null,
  variant_id uuid not null,
  kind public.movement_kind not null,
  -- Positive adds stock, negative removes it.
  quantity numeric(12, 3) not null check (quantity <> 0),
  unit_cost numeric(12, 4),
  document_id uuid,
  -- A document line is received at most once.
  document_line_id uuid unique references public.document_lines (id),
  reason text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id),
  -- No cascade: a variant or document with stock history cannot be deleted.
  foreign key (variant_id, business_id) references public.product_variants (id, business_id),
  foreign key (document_id, business_id) references public.documents (id, business_id),
  constraint stock_movements_receipt_has_line
    check ((kind = 'receipt') = (document_line_id is not null and document_id is not null)),
  constraint stock_movements_adjustment_has_reason
    check (kind <> 'adjustment' or length(btrim(reason)) > 0)
);

create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_document_idx on public.stock_movements (document_id);

create table public.stock_levels (
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid not null,
  variant_id uuid not null,
  quantity numeric(12, 3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, variant_id),
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id),
  foreign key (variant_id, business_id) references public.product_variants (id, business_id)
);

create index stock_levels_variant_idx on public.stock_levels (variant_id);

alter table public.stock_movements enable row level security;
alter table public.stock_levels enable row level security;

create policy "stock movements: members read" on public.stock_movements
  for select to authenticated using (private.is_member(business_id));
create policy "stock levels: members read" on public.stock_levels
  for select to authenticated using (private.is_member(business_id));

revoke all on public.stock_movements, public.stock_levels from anon, authenticated;
grant select on public.stock_movements, public.stock_levels to authenticated;

-- ---------------------------------------------------------------------------
-- An approved document is frozen: its header and lines no longer change.
-- "approved" can only be reached through approve_document, because approved_at
-- is not among the columns a signed-in user may update.
-- ---------------------------------------------------------------------------

create function private.guard_document_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'document_approved' using errcode = 'P0001';
  end if;
  if new.status = 'approved' and new.approved_at is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger documents_guard_approval
  before update on public.documents
  for each row execute function private.guard_document_approval();

create function private.lock_approved_lines()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document uuid;
begin
  if tg_op = 'INSERT' then
    v_document := new.document_id;
  else
    v_document := old.document_id;
  end if;
  if exists (
    select 1 from public.documents d where d.id = v_document and d.status = 'approved'
  ) then
    raise exception 'document_approved' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger document_lines_lock_approved
  before insert or update or delete on public.document_lines
  for each row execute function private.lock_approved_lines();

-- ---------------------------------------------------------------------------
-- Matching, extended: a model code shared by several variants is resolved by the
-- variation printed on the line (label "7" for variant text "7").
-- ---------------------------------------------------------------------------

create or replace function public.match_document_lines(p_document_id uuid)
returns void
language sql
set search_path = ''
as $$
  with doc as (
    select d.id, d.business_id, d.supplier_id
    from public.documents d
    where d.id = p_document_id
  ),
  by_barcode as (
    select l.id as line_id, min(c.variant_id::text)::uuid as variant_id
    from public.document_lines l
    join doc on doc.id = l.document_id
    join public.variant_codes c
      on c.business_id = doc.business_id
     and c.kind in ('barcode', 'pos')
     and c.code_norm = upper(btrim(l.barcode))
    where l.barcode is not null
    group by l.id
    having count(distinct c.variant_id) = 1
  ),
  sku_candidates as (
    select l.id as line_id, c.variant_id,
           lower(v.label) = lower(btrim(coalesce(l.variant_text, ''))) as same_label
    from public.document_lines l
    join doc on doc.id = l.document_id
    join public.variant_codes c
      on c.business_id = doc.business_id
     and c.kind = 'supplier_sku'
     and c.supplier_id = doc.supplier_id
     and c.code_norm = upper(btrim(l.supplier_sku))
    join public.product_variants v on v.id = c.variant_id
    where l.supplier_sku is not null
  ),
  by_sku as (
    select line_id, min(variant_id::text)::uuid as variant_id
    from sku_candidates
    group by line_id
    having count(distinct variant_id) = 1
  ),
  by_sku_label as (
    select line_id, min(variant_id::text)::uuid as variant_id
    from sku_candidates
    where same_label
    group by line_id
    having count(distinct variant_id) = 1
  )
  update public.document_lines l
  set variant_id = coalesce(b.variant_id, s.variant_id, sl.variant_id),
      match_method = case
        when b.variant_id is not null then 'barcode'
        when coalesce(s.variant_id, sl.variant_id) is not null then 'supplier_sku'
      end
  from public.document_lines l2
  left join by_barcode b on b.line_id = l2.id
  left join by_sku s on s.line_id = l2.id
  left join by_sku_label sl on sl.line_id = l2.id
  where l2.id = l.id and l2.document_id = p_document_id;
$$;

-- ---------------------------------------------------------------------------
-- Adds the lines that are not in the catalog yet as products of the document's
-- supplier. Lines sharing a supplier SKU become variants of one product; a line
-- with neither SKU nor barcode is left alone (nothing to recognise it by later).
-- SECURITY INVOKER: the caller's RLS applies. Returns the number of variants added.
-- ---------------------------------------------------------------------------

create function public.create_products_from_lines(p_document_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  d record;
  r record;
  v_sku text;
  v_barcode text;
  v_label text;
  v_product uuid;
  v_variant uuid;
  v_products integer;
  v_created integer := 0;
begin
  select id, business_id, supplier_id, status into d
  from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if d.status <> 'review' then
    raise exception 'not_in_review' using errcode = 'P0001';
  end if;
  if d.supplier_id is null then
    raise exception 'supplier_required' using errcode = 'P0001';
  end if;

  perform public.match_document_lines(p_document_id);

  for r in
    select * from public.document_lines
    where document_id = p_document_id and variant_id is null
    order by position
  loop
    v_sku := nullif(btrim(r.supplier_sku), '');
    v_barcode := nullif(btrim(r.barcode), '');
    v_label := btrim(left(coalesce(btrim(r.variant_text), ''), 80));
    v_product := null;
    v_products := 0;
    continue when v_sku is null and v_barcode is null;

    -- An earlier line of this document may already have created the item.
    if v_barcode is not null then
      continue when exists (
        select 1 from public.variant_codes c
        where c.business_id = d.business_id and c.kind in ('barcode', 'pos')
          and c.code_norm = upper(v_barcode)
      );
    end if;

    if v_sku is not null then
      select count(distinct v.product_id), min(v.product_id::text)::uuid
      into v_products, v_product
      from public.variant_codes c
      join public.product_variants v on v.id = c.variant_id
      where c.business_id = d.business_id and c.kind = 'supplier_sku'
        and c.supplier_id = d.supplier_id and c.code_norm = upper(v_sku);
      -- The same code on two different products: the user has to decide.
      continue when v_products > 1;
    end if;

    if v_product is null then
      insert into public.products (business_id, name, supplier_id)
      values (
        d.business_id,
        btrim(left(coalesce(nullif(btrim(r.description), ''), v_sku, v_barcode), 200)),
        d.supplier_id
      )
      returning id into v_product;
    else
      select v.id into v_variant
      from public.product_variants v
      where v.product_id = v_product and lower(v.label) = lower(v_label);
      if found then
        if v_barcode is null then
          -- Same model, same variation: make sure it carries the supplier SKU.
          insert into public.variant_codes (business_id, variant_id, kind, supplier_id, code)
          select d.business_id, v_variant, 'supplier_sku', d.supplier_id, v_sku
          where not exists (
            select 1 from public.variant_codes c
            where c.variant_id = v_variant and c.kind = 'supplier_sku'
              and c.supplier_id = d.supplier_id and c.code_norm = upper(v_sku)
          );
          continue;
        end if;
        -- A different barcode under a name that is taken: name it by its barcode.
        v_label := v_barcode;
        continue when exists (
          select 1 from public.product_variants v
          where v.product_id = v_product and lower(v.label) = lower(v_label)
        );
      end if;
    end if;

    insert into public.product_variants (business_id, product_id, label)
    values (d.business_id, v_product, v_label)
    returning id into v_variant;

    if v_barcode is not null then
      insert into public.variant_codes (business_id, variant_id, kind, code)
      values (d.business_id, v_variant, 'barcode', v_barcode);
    end if;
    if v_sku is not null then
      insert into public.variant_codes (business_id, variant_id, kind, supplier_id, code)
      values (d.business_id, v_variant, 'supplier_sku', d.supplier_id, v_sku);
    end if;
    v_created := v_created + 1;
  end loop;

  perform public.match_document_lines(p_document_id);
  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approves a received document: one movement per line, balances raised, document
-- frozen. Calling it again does nothing. Returns the number of movements written.
-- ---------------------------------------------------------------------------

create function public.approve_document(p_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.documents%rowtype;
  v_count integer;
begin
  select * into d from public.documents where id = p_document_id for update;
  if not found or private.is_member(d.business_id) is not true then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if d.status = 'approved' then
    return 0;
  end if;
  if d.status <> 'review' then
    raise exception 'not_in_review' using errcode = 'P0001';
  end if;

  -- The catalog may have changed since the lines were last saved.
  perform public.match_document_lines(p_document_id);

  if not exists (select 1 from public.document_lines l where l.document_id = d.id) then
    raise exception 'no_lines' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.document_lines l where l.document_id = d.id and l.variant_id is null
  ) then
    raise exception 'unmatched_lines' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.document_lines l
    where l.document_id = d.id and (l.quantity is null or l.quantity <= 0)
  ) then
    raise exception 'bad_quantity' using errcode = 'P0001';
  end if;
  if d.supplier_id is not null and d.doc_number is not null and exists (
    select 1 from public.documents o
    where o.business_id = d.business_id and o.supplier_id = d.supplier_id
      and o.doc_number = d.doc_number and o.status = 'approved' and o.id <> d.id
  ) then
    raise exception 'duplicate_document' using errcode = 'P0001';
  end if;

  insert into public.stock_movements (
    business_id, warehouse_id, variant_id, kind, quantity, unit_cost, document_id, document_line_id
  )
  select d.business_id, d.warehouse_id, l.variant_id, 'receipt', l.quantity, l.unit_cost, d.id, l.id
  from public.document_lines l
  where l.document_id = d.id;
  get diagnostics v_count = row_count;

  -- The same item on several lines is one balance change: the sum of the lines.
  insert into public.stock_levels (business_id, warehouse_id, variant_id, quantity)
  select d.business_id, d.warehouse_id, l.variant_id, sum(l.quantity)
  from public.document_lines l
  where l.document_id = d.id
  group by l.variant_id
  on conflict (warehouse_id, variant_id) do update
    set quantity = public.stock_levels.quantity + excluded.quantity, updated_at = now();

  update public.documents
  set status = 'approved', approved_at = now(), approved_by = auth.uid()
  where id = d.id;

  return v_count;
end;
$$;

-- Corrects a balance with a documented adjustment (owner / manager). Returns the new balance.
create function public.adjust_stock(
  p_variant_id uuid,
  p_warehouse_id uuid,
  p_delta numeric,
  p_reason text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_quantity numeric;
begin
  select v.business_id into v_business from public.product_variants v where v.id = p_variant_id;
  if v_business is null or private.can_manage(v_business) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.warehouses w where w.id = p_warehouse_id and w.business_id = v_business
  ) then
    raise exception 'warehouse_not_found' using errcode = 'P0002';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'bad_quantity' using errcode = 'P0001';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  insert into public.stock_movements (business_id, warehouse_id, variant_id, kind, quantity, reason)
  values (v_business, p_warehouse_id, p_variant_id, 'adjustment', p_delta, btrim(p_reason));

  insert into public.stock_levels (business_id, warehouse_id, variant_id, quantity)
  values (v_business, p_warehouse_id, p_variant_id, p_delta)
  on conflict (warehouse_id, variant_id) do update
    set quantity = public.stock_levels.quantity + excluded.quantity, updated_at = now()
  returning quantity into v_quantity;

  return v_quantity;
end;
$$;

revoke all on function public.create_products_from_lines(uuid) from public, anon;
revoke all on function public.approve_document(uuid) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.create_products_from_lines(uuid) to authenticated;
grant execute on function public.approve_document(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, numeric, text) to authenticated;
