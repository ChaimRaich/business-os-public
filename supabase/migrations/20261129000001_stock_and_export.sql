-- Stage 4: stock receiving, pricing and classification, internal barcodes, POS export.
--
-- Rules enforced here rather than in the app, because members can write to the
-- document tables directly through the API:
--   * a document becomes 'approved' only through approve_document();
--   * an approved document and its lines are locked;
--   * stock changes only as movement rows, and balances follow them in the same
--     transaction.

create type public.product_type as enum ('ring', 'earring', 'necklace', 'bracelet');
create type public.material as enum ('silver', 'gold');
create type public.movement_kind as enum ('receipt', 'adjustment');

-- ---------------------------------------------------------------------------
-- Catalog and supplier additions
-- ---------------------------------------------------------------------------

alter table public.products
  add column product_type public.product_type,
  add column material public.material,
  add column sale_price numeric(12, 2) check (sale_price > 0),
  add column club_price numeric(12, 2) check (club_price > 0);

grant update (product_type, material, sale_price, club_price) on public.products to authenticated;

alter table public.suppliers
  -- club price = cost before VAT * club_multiplier; sale price = club price + markup.
  add column club_multiplier numeric(8, 3) not null default 2.9 check (club_multiplier > 0),
  add column sale_markup_pct numeric(6, 2) not null default 10 check (sale_markup_pct >= 0),
  -- Running number of the next internal barcode: N<pos_code><6 digits>.
  add column next_barcode_number integer not null default 1
    check (next_barcode_number between 1 and 1000000);

grant update (club_multiplier, sale_markup_pct, next_barcode_number)
  on public.suppliers to authenticated;

-- True for a POS code this system generated; false for one that came from the POS.
alter table public.variant_codes add column allocated boolean not null default false;

create table public.departments (
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_type public.product_type not null,
  code integer not null check (code > 0),
  department text not null check (length(btrim(department)) between 1 and 80),
  sub_department text not null check (length(btrim(sub_department)) between 1 and 80),
  primary key (business_id, product_type)
);

-- ---------------------------------------------------------------------------
-- Document additions
-- ---------------------------------------------------------------------------

alter table public.documents
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users (id) on delete set null;

-- A first guess from the supplier's description. It is only the last fallback:
-- the line's own choice and the product's type both win over it.
create function private.guess_product_type(p_description text)
returns public.product_type
language sql
immutable
set search_path = ''
as $$
  select case
    when p_description ~* 'טבעת|\mrings?\M' then 'ring'
    when p_description ~* 'עגיל|\mearrings?\M' then 'earring'
    when p_description ~* 'שרשרת|\mneck?l(ace|age)s?\M' then 'necklace'
    when p_description ~* 'צמיד|\mbracel[a-z]*\M' then 'bracelet'
  end::public.product_type;
$$;

grant execute on function private.guess_product_type(text) to authenticated;

alter table public.document_lines
  -- NULL means "not set by the user": the product's value or the pricing rule applies.
  add column sale_price numeric(12, 2) check (sale_price > 0),
  add column club_price numeric(12, 2) check (club_price > 0),
  add column product_type public.product_type,
  add column material public.material,
  add column guessed_type public.product_type
    generated always as (private.guess_product_type(description)) stored;

grant update (sale_price, club_price, product_type, material)
  on public.document_lines to authenticated;

-- 'manual' is a link the user chose; automatic matching never overrides it.
alter table public.document_lines drop constraint document_lines_match_method_check;
alter table public.document_lines add constraint document_lines_match_method_check
  check (match_method in ('barcode', 'supplier_sku', 'manual'));

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid not null,
  variant_id uuid not null,
  kind public.movement_kind not null,
  -- Positive adds stock, negative removes it.
  quantity numeric(12, 3) not null check (quantity <> 0),
  -- The document that created a receipt, or the one an adjustment corrects.
  document_id uuid,
  reason text,
  -- Sent by the adjustment form so that a double submit applies once.
  request_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id),
  foreign key (variant_id, business_id) references public.product_variants (id, business_id),
  foreign key (document_id, business_id) references public.documents (id, business_id),
  constraint stock_movements_receipt_has_document check (kind <> 'receipt' or document_id is not null),
  constraint stock_movements_adjustment_has_reason
    check (kind <> 'adjustment' or length(btrim(coalesce(reason, ''))) > 0)
);

-- One receipt movement per document and item, whatever calls approval.
create unique index stock_movements_receipt_once
  on public.stock_movements (document_id, variant_id) where kind = 'receipt';
create unique index stock_movements_request_once
  on public.stock_movements (business_id, request_id) where request_id is not null;
create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);

create table public.stock_balances (
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid not null,
  variant_id uuid not null,
  quantity numeric(14, 3) not null,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, variant_id),
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id),
  foreign key (variant_id, business_id) references public.product_variants (id, business_id)
);

create index stock_balances_variant_idx on public.stock_balances (variant_id);

create function private.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.stock_balances as b (business_id, warehouse_id, variant_id, quantity)
  values (new.business_id, new.warehouse_id, new.variant_id, new.quantity)
  on conflict (warehouse_id, variant_id)
  do update set quantity = b.quantity + excluded.quantity, updated_at = now();
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function private.apply_stock_movement();

-- ---------------------------------------------------------------------------
-- POS export
-- ---------------------------------------------------------------------------

create table public.pos_exports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- One file per document: downloading again returns the same bytes.
  document_id uuid not null unique,
  file_name text not null,
  template_version text not null,
  row_count integer not null check (row_count > 0),
  variant_ids uuid[] not null,
  content_base64 text not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Creating a file is not a sync: it stays pending until someone confirms the upload.
  pos_status text not null default 'pending' check (pos_status in ('pending', 'uploaded')),
  uploaded_at timestamptz,
  uploaded_by uuid references auth.users (id) on delete set null,
  foreign key (document_id, business_id) references public.documents (id, business_id)
);

create index pos_exports_variants_idx on public.pos_exports using gin (variant_ids);

-- ---------------------------------------------------------------------------
-- Row level security and privileges
-- ---------------------------------------------------------------------------

alter table public.departments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_balances enable row level security;
alter table public.pos_exports enable row level security;

create policy "departments: members read" on public.departments
  for select to authenticated using (private.is_member(business_id));
create policy "departments: managers insert" on public.departments
  for insert to authenticated with check (private.can_manage(business_id));
create policy "departments: managers update" on public.departments
  for update to authenticated
  using (private.can_manage(business_id)) with check (private.can_manage(business_id));
create policy "departments: managers delete" on public.departments
  for delete to authenticated using (private.can_manage(business_id));

create policy "stock movements: members read" on public.stock_movements
  for select to authenticated using (private.is_member(business_id));
create policy "stock balances: members read" on public.stock_balances
  for select to authenticated using (private.is_member(business_id));

create policy "pos exports: members read" on public.pos_exports
  for select to authenticated using (private.is_member(business_id));
create policy "pos exports: members insert for approved documents" on public.pos_exports
  for insert to authenticated with check (
    private.is_member(business_id)
    and exists (
      select 1 from public.documents d
      where d.id = document_id and d.status = 'approved'
    )
  );

revoke all on
  public.departments, public.stock_movements, public.stock_balances, public.pos_exports
  from anon, authenticated;

grant select, insert, update, delete on public.departments to authenticated;
-- No write grants: stock changes only through approve_document() and adjust_stock().
grant select on public.stock_movements, public.stock_balances to authenticated;
grant select on public.pos_exports to authenticated;
grant insert (business_id, document_id, file_name, template_version, row_count, variant_ids, content_base64)
  on public.pos_exports to authenticated;

-- ---------------------------------------------------------------------------
-- Locking approved documents.
-- These triggers run as the caller on purpose: current_user tells a direct API
-- write apart from one made inside a SECURITY DEFINER function.
-- ---------------------------------------------------------------------------

create function private.lock_approved_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated')
       and (new.status = 'approved' or new.approved_at is not null or new.approved_by is not null) then
      raise exception 'approval_only_through_rpc' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Deleting the whole business still cascades.
    if old.status = 'approved'
       and exists (select 1 from public.businesses b where b.id = old.business_id) then
      raise exception 'document_locked' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.status = 'approved' then
    -- Only "the user was deleted" may touch an approved document.
    if (to_jsonb(new) - 'created_by' - 'approved_by') = (to_jsonb(old) - 'created_by' - 'approved_by')
       and (new.created_by is null or new.created_by is not distinct from old.created_by)
       and (new.approved_by is null or new.approved_by is not distinct from old.approved_by) then
      return new;
    end if;
    raise exception 'document_locked' using errcode = 'P0001';
  end if;

  if current_user in ('anon', 'authenticated')
     and (new.status = 'approved'
          or new.approved_at is distinct from old.approved_at
          or new.approved_by is distinct from old.approved_by) then
    raise exception 'approval_only_through_rpc' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger documents_lock_approved
  before insert or update or delete on public.documents
  for each row execute function private.lock_approved_document();

create function private.lock_approved_children()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_document uuid;
  v_status public.document_status;
begin
  if tg_op = 'DELETE' then
    v_document := old.document_id;
  else
    v_document := new.document_id;
  end if;

  -- The row lock makes an edit wait for a running approval, and the other way round.
  select d.status into v_status from public.documents d where d.id = v_document for share;

  if v_status = 'approved' then
    -- The one exception: filling in a cost that was missing, via fill_line_cost().
    if tg_table_name = 'document_lines' and tg_op = 'UPDATE'
       and current_user not in ('anon', 'authenticated') then
      if to_jsonb(old) -> 'unit_cost' = 'null'::jsonb
         and (to_jsonb(new) - 'unit_cost' - 'guessed_type')
             = (to_jsonb(old) - 'unit_cost' - 'guessed_type') then
        return new;
      end if;
    end if;
    raise exception 'document_locked' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger document_lines_lock_approved
  before insert or update or delete on public.document_lines
  for each row execute function private.lock_approved_children();

create trigger document_files_lock_approved
  before insert or update or delete on public.document_files
  for each row execute function private.lock_approved_children();

-- The stored originals of an approved document cannot be removed either.
create function private.storage_document_approved(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id::text = split_part(p_name, '/', 2)
      and d.business_id = private.storage_business_id(p_name)
      and d.status = 'approved'
  );
$$;

grant execute on function private.storage_document_approved(text) to authenticated;

drop policy "documents bucket: managers delete" on storage.objects;
create policy "documents bucket: managers delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and private.can_manage(private.storage_business_id(name))
    and not private.storage_document_approved(name)
  );

-- ---------------------------------------------------------------------------
-- Internal barcodes
-- ---------------------------------------------------------------------------

-- Gives a variant a POS code if it has none. Returns NULL when the supplier has
-- no numeric POS code yet, so there is nothing to build the barcode from.
create function private.ensure_internal_barcode(p_variant_id uuid, p_supplier_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_supplier record;
  v_code text;
  v_number integer;
begin
  select v.business_id into v_business from public.product_variants v where v.id = p_variant_id;
  if v_business is null or not private.is_member(v_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Locking the supplier serializes allocation of its running number.
  select s.pos_code, s.next_barcode_number into v_supplier
  from public.suppliers s
  where s.id = p_supplier_id and s.business_id = v_business
  for update;

  select c.code into v_code from public.variant_codes c
  where c.variant_id = p_variant_id and c.kind = 'pos';
  if v_code is not null then
    return v_code;
  end if;
  if v_supplier.pos_code is null or v_supplier.pos_code !~ '^[0-9]{1,9}$' then
    return null;
  end if;

  v_number := v_supplier.next_barcode_number;
  loop
    if v_number > 999999 then
      raise exception 'barcode_sequence_full' using errcode = 'P0001';
    end if;
    v_code := 'N' || v_supplier.pos_code || lpad(v_number::text, 6, '0');
    v_number := v_number + 1;
    exit when not exists (
      select 1 from public.variant_codes c
      where c.business_id = v_business and c.kind in ('barcode', 'pos') and c.code_norm = v_code
    );
  end loop;

  insert into public.variant_codes (business_id, variant_id, kind, code, allocated)
  values (v_business, p_variant_id, 'pos', v_code, true);
  update public.suppliers set next_barcode_number = v_number where id = p_supplier_id;
  return v_code;
end;
$$;

revoke all on function private.ensure_internal_barcode(uuid, uuid) from public;
grant execute on function private.ensure_internal_barcode(uuid, uuid) to authenticated;

-- Allocates what is still missing for a document, e.g. after the supplier's POS
-- code was filled in following approval. Does not touch stock.
create function public.assign_internal_barcodes(p_document_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_supplier uuid;
  r record;
begin
  select d.supplier_id into v_supplier from public.documents d where d.id = p_document_id;
  if v_supplier is null then
    return;
  end if;
  for r in
    select l.variant_id from public.document_lines l
    where l.document_id = p_document_id and l.variant_id is not null
    group by l.variant_id
    order by min(l.position)
  loop
    perform private.ensure_internal_barcode(r.variant_id, v_supplier);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Matching and line editing
-- ---------------------------------------------------------------------------

-- As before, with two changes: a manual link is kept, and a supplier SKU no longer
-- matches a variant that contradicts the line (a different barcode, or a different
-- variation name) - for example a new ring size of a known model.
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
  by_sku as (
    select l.id as line_id, min(c.variant_id::text)::uuid as variant_id
    from public.document_lines l
    join doc on doc.id = l.document_id
    join public.variant_codes c
      on c.business_id = doc.business_id
     and c.kind = 'supplier_sku'
     and c.supplier_id = doc.supplier_id
     and c.code_norm = upper(btrim(l.supplier_sku))
    join public.product_variants v on v.id = c.variant_id
    where l.supplier_sku is not null
      and (
        l.barcode is null
        or not exists (
          select 1 from public.variant_codes b where b.variant_id = c.variant_id and b.kind = 'barcode'
        )
      )
      and (l.variant_text is null or v.label = '' or lower(v.label) = lower(l.variant_text))
    group by l.id
    having count(distinct c.variant_id) = 1
  )
  update public.document_lines l
  set variant_id = coalesce(b.variant_id, s.variant_id),
      match_method = case
        when b.variant_id is not null then 'barcode'
        when s.variant_id is not null then 'supplier_sku'
      end
  from public.document_lines l2
  left join by_barcode b on b.line_id = l2.id
  left join by_sku s on s.line_id = l2.id
  where l2.id = l.id and l2.document_id = p_document_id
    and not (l2.match_method is not distinct from 'manual' and l2.variant_id is not null);
$$;

create or replace function public.replace_document_lines(p_document_id uuid, p_lines jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_business uuid;
  v_status public.document_status;
begin
  select d.business_id, d.status into v_business, v_status
  from public.documents d where d.id = p_document_id;
  if v_business is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'approved' then
    raise exception 'document_locked' using errcode = 'P0001';
  end if;

  delete from public.document_lines where document_id = p_document_id;

  insert into public.document_lines (
    business_id, document_id, position, supplier_sku, barcode, description, variant_text,
    quantity, unit, unit_cost, retail_price, discount_pct, line_total, uncertain_fields, note,
    sale_price, club_price, product_type, material, variant_id, match_method
  )
  select
    v_business, p_document_id, t.ord::integer,
    nullif(btrim(t.line ->> 'supplier_sku'), ''),
    nullif(btrim(t.line ->> 'barcode'), ''),
    nullif(btrim(t.line ->> 'description'), ''),
    nullif(btrim(t.line ->> 'variant_text'), ''),
    (t.line ->> 'quantity')::numeric,
    nullif(btrim(t.line ->> 'unit'), ''),
    (t.line ->> 'unit_cost')::numeric,
    (t.line ->> 'retail_price')::numeric,
    (t.line ->> 'discount_pct')::numeric,
    (t.line ->> 'line_total')::numeric,
    coalesce(
      (select array_agg(f) from jsonb_array_elements_text(t.line -> 'uncertain_fields') f),
      '{}'
    ),
    nullif(btrim(t.line ->> 'note'), ''),
    (t.line ->> 'sale_price')::numeric,
    (t.line ->> 'club_price')::numeric,
    (nullif(t.line ->> 'product_type', ''))::public.product_type,
    (nullif(t.line ->> 'material', ''))::public.material,
    (nullif(t.line ->> 'manual_variant_id', ''))::uuid,
    case when nullif(t.line ->> 'manual_variant_id', '') is not null then 'manual' end
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(line, ord);

  perform public.match_document_lines(p_document_id);
end;
$$;

-- Links a line to an existing item, together with identical unmatched lines.
-- A NULL variant removes a manual link and goes back to automatic matching.
create function public.link_document_line(p_line_id uuid, p_variant_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_line public.document_lines;
begin
  select * into v_line from public.document_lines l where l.id = p_line_id;
  if v_line.id is null then
    raise exception 'line_not_found' using errcode = 'P0002';
  end if;

  if p_variant_id is null then
    update public.document_lines set variant_id = null, match_method = null where id = p_line_id;
    perform public.match_document_lines(v_line.document_id);
    return;
  end if;

  update public.document_lines l
  set variant_id = p_variant_id, match_method = 'manual'
  where l.document_id = v_line.document_id
    and (
      l.id = p_line_id
      or (
        l.variant_id is null
        and coalesce(v_line.barcode, v_line.supplier_sku) is not null
        and upper(l.barcode) is not distinct from upper(v_line.barcode)
        and upper(l.supplier_sku) is not distinct from upper(v_line.supplier_sku)
        and lower(l.variant_text) is not distinct from lower(v_line.variant_text)
      )
    );
end;
$$;

-- Creates a catalog item from a line (a new product, or a new variant of an
-- existing one), gives it the line's supplier codes and an internal barcode, and
-- links the line. One transaction.
create function public.create_item_for_line(
  p_line_id uuid,
  p_product_id uuid,
  p_name text,
  p_label text,
  p_product_type public.product_type default null,
  p_material public.material default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_line public.document_lines;
  v_supplier uuid;
  v_status public.document_status;
  v_product uuid := p_product_id;
  v_variant uuid;
begin
  -- Locking the line makes a double click wait, then see that it is linked.
  select * into v_line from public.document_lines l where l.id = p_line_id for update;
  if v_line.id is null then
    raise exception 'line_not_found' using errcode = 'P0002';
  end if;
  select d.supplier_id, d.status into v_supplier, v_status
  from public.documents d where d.id = v_line.document_id;
  if v_status <> 'review' then
    raise exception 'document_locked' using errcode = 'P0001';
  end if;
  if v_supplier is null then
    raise exception 'missing_supplier' using errcode = 'P0001';
  end if;
  if v_line.variant_id is not null then
    raise exception 'line_already_linked' using errcode = 'P0001';
  end if;

  if v_product is null then
    insert into public.products (business_id, name, supplier_id, product_type, material)
    values (v_line.business_id, btrim(p_name), v_supplier, p_product_type, p_material)
    returning id into v_product;
  end if;

  insert into public.product_variants (business_id, product_id, label)
  values (v_line.business_id, v_product, btrim(coalesce(p_label, '')))
  returning id into v_variant;

  if v_line.barcode is not null then
    insert into public.variant_codes (business_id, variant_id, kind, code)
    values (v_line.business_id, v_variant, 'barcode', v_line.barcode);
  end if;
  if v_line.supplier_sku is not null then
    insert into public.variant_codes (business_id, variant_id, kind, supplier_id, code)
    values (v_line.business_id, v_variant, 'supplier_sku', v_supplier, v_line.supplier_sku);
  end if;

  perform private.ensure_internal_barcode(v_variant, v_supplier);
  perform public.link_document_line(p_line_id, v_variant);
  perform public.match_document_lines(v_line.document_id);
  return v_variant;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approval and adjustments
-- ---------------------------------------------------------------------------

-- Turns a reviewed document into stock. Returns false, changing nothing, when it
-- is already approved.
create function public.approve_document(p_document_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.documents;
  v_supplier public.suppliers;
begin
  -- The row lock makes a second approval wait, then see 'approved'.
  select * into v_doc from public.documents d where d.id = p_document_id for update;
  if v_doc.id is null or not private.is_member(v_doc.business_id) then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;
  if v_doc.status = 'approved' then
    return false;
  end if;
  if v_doc.status <> 'review' then
    raise exception 'not_in_review' using errcode = 'P0001';
  end if;
  if v_doc.supplier_id is null then
    raise exception 'missing_supplier' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.document_lines l where l.document_id = p_document_id) then
    raise exception 'no_lines' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.document_lines l
    where l.document_id = p_document_id
      and (l.variant_id is null or l.quantity is null or l.quantity <= 0)
  ) then
    raise exception 'incomplete_lines' using errcode = 'P0001';
  end if;

  select * into v_supplier from public.suppliers s where s.id = v_doc.supplier_id;

  -- Freeze pricing and classification on the lines. Lines of the same item get one
  -- value each: the first one typed, else the product's, else the pricing rule on
  -- the quantity-weighted cost.
  with per_item as (
    select
      l.variant_id,
      (array_agg(l.sale_price order by l.position) filter (where l.sale_price is not null))[1] as sale,
      (array_agg(l.club_price order by l.position) filter (where l.club_price is not null))[1] as club,
      (array_agg(l.product_type order by l.position) filter (where l.product_type is not null))[1] as kind,
      (array_agg(l.material order by l.position) filter (where l.material is not null))[1] as material,
      (array_agg(l.guessed_type order by l.position) filter (where l.guessed_type is not null))[1] as guess,
      round(
        sum(l.unit_cost * l.quantity) / nullif(sum(l.quantity) filter (where l.unit_cost is not null), 0),
        2
      ) as cost
    from public.document_lines l
    where l.document_id = p_document_id
    group by l.variant_id
  ),
  clubbed as (
    select
      i.variant_id,
      i.sale,
      coalesce(i.club, p.club_price, nullif(round(i.cost * v_supplier.club_multiplier), 0)) as club,
      p.sale_price as product_sale,
      coalesce(i.kind, p.product_type, i.guess) as kind,
      coalesce(i.material, p.material) as material
    from per_item i
    join public.product_variants v on v.id = i.variant_id
    join public.products p on p.id = v.product_id
  )
  update public.document_lines l
  set club_price = c.club,
      sale_price = coalesce(
        c.sale,
        c.product_sale,
        round(c.club * (100 + v_supplier.sale_markup_pct) / 100)
      ),
      product_type = c.kind,
      material = c.material
  from clubbed c
  where l.document_id = p_document_id and l.variant_id = c.variant_id;

  with latest as (
    select distinct on (v.product_id)
      v.product_id, l.sale_price, l.club_price, l.product_type, l.material
    from public.document_lines l
    join public.product_variants v on v.id = l.variant_id
    where l.document_id = p_document_id
    order by v.product_id, l.position
  )
  update public.products p
  set sale_price = coalesce(x.sale_price, p.sale_price),
      club_price = coalesce(x.club_price, p.club_price),
      product_type = coalesce(x.product_type, p.product_type),
      material = coalesce(x.material, p.material)
  from latest x
  where p.id = x.product_id;

  -- Remember the supplier's codes for next time. A barcode that already belongs
  -- to another item is left where it is.
  insert into public.variant_codes (business_id, variant_id, kind, code)
  select distinct on (upper(l.barcode)) v_doc.business_id, l.variant_id, 'barcode'::public.code_kind, l.barcode
  from public.document_lines l
  where l.document_id = p_document_id and l.barcode is not null
    and not exists (
      select 1 from public.variant_codes c
      where c.business_id = v_doc.business_id and c.kind in ('barcode', 'pos')
        and c.code_norm = upper(l.barcode)
    )
  order by upper(l.barcode), l.position
  on conflict do nothing;

  insert into public.variant_codes (business_id, variant_id, kind, supplier_id, code)
  select v_doc.business_id, l.variant_id, 'supplier_sku'::public.code_kind, v_doc.supplier_id, l.supplier_sku
  from public.document_lines l
  where l.document_id = p_document_id and l.supplier_sku is not null
  on conflict do nothing;

  perform public.assign_internal_barcodes(p_document_id);

  insert into public.stock_movements
    (business_id, warehouse_id, variant_id, kind, quantity, document_id, created_by)
  select v_doc.business_id, v_doc.warehouse_id, l.variant_id, 'receipt', sum(l.quantity),
         p_document_id, auth.uid()
  from public.document_lines l
  where l.document_id = p_document_id
  group by l.variant_id;

  update public.documents
  set status = 'approved', approved_at = now(), approved_by = auth.uid()
  where id = p_document_id;

  return true;
end;
$$;

-- A documented correction. Returns false when this request was already applied.
create function public.adjust_stock(
  p_warehouse_id uuid,
  p_variant_id uuid,
  p_quantity numeric,
  p_reason text,
  p_request_id uuid,
  p_document_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_rows integer;
begin
  select w.business_id into v_business from public.warehouses w where w.id = p_warehouse_id;
  if v_business is null or private.can_manage(v_business) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'missing_request_id' using errcode = 'P0001';
  end if;

  -- The composite foreign keys reject a variant or document of another business.
  insert into public.stock_movements
    (business_id, warehouse_id, variant_id, kind, quantity, document_id, reason, request_id, created_by)
  values
    (v_business, p_warehouse_id, p_variant_id, 'adjustment', p_quantity, p_document_id,
     btrim(p_reason), p_request_id, auth.uid())
  on conflict (business_id, request_id) where request_id is not null do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  if exists (
    select 1 from public.stock_balances b
    where b.warehouse_id = p_warehouse_id and b.variant_id = p_variant_id and b.quantity < 0
  ) then
    raise exception 'negative_stock' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

-- Completes a cost that was missing at approval, which the POS file requires.
-- Only while no file exists; an existing cost is never changed.
create function public.fill_line_cost(p_line_id uuid, p_cost numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.document_lines;
begin
  select * into v_line from public.document_lines l where l.id = p_line_id for update;
  if v_line.id is null or not private.is_member(v_line.business_id) then
    raise exception 'line_not_found' using errcode = 'P0002';
  end if;
  if p_cost is null or p_cost <= 0 or v_line.unit_cost is not null
     or exists (select 1 from public.pos_exports e where e.document_id = v_line.document_id) then
    raise exception 'document_locked' using errcode = 'P0001';
  end if;
  update public.document_lines set unit_cost = p_cost where id = p_line_id;
end;
$$;

-- The user's statement that the POS accepted the file.
create function public.mark_export_uploaded(p_export_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select e.business_id into v_business from public.pos_exports e where e.id = p_export_id;
  if v_business is null or not private.is_member(v_business) then
    raise exception 'export_not_found' using errcode = 'P0002';
  end if;
  update public.pos_exports
  set pos_status = 'uploaded', uploaded_at = now(), uploaded_by = auth.uid()
  where id = p_export_id and pos_status = 'pending';
end;
$$;

revoke all on function public.assign_internal_barcodes(uuid) from public, anon;
revoke all on function public.link_document_line(uuid, uuid) from public, anon;
revoke all on function public.create_item_for_line(uuid, uuid, text, text, public.product_type, public.material) from public, anon;
revoke all on function public.approve_document(uuid) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, numeric, text, uuid, uuid) from public, anon;
revoke all on function public.fill_line_cost(uuid, numeric) from public, anon;
revoke all on function public.mark_export_uploaded(uuid) from public, anon;
grant execute on function public.assign_internal_barcodes(uuid) to authenticated;
grant execute on function public.link_document_line(uuid, uuid) to authenticated;
grant execute on function public.create_item_for_line(uuid, uuid, text, text, public.product_type, public.material) to authenticated;
grant execute on function public.approve_document(uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, numeric, text, uuid, uuid) to authenticated;
grant execute on function public.fill_line_cost(uuid, numeric) to authenticated;
grant execute on function public.mark_export_uploaded(uuid) to authenticated;
