-- Goods-receiving documents: the uploaded original, the AI-extracted lines, and
-- the user's corrections. Nothing here touches stock; approval comes in a later step.

create type public.document_status as enum ('uploaded', 'extracting', 'review', 'failed');
create type public.document_type as enum ('delivery_note', 'tax_invoice', 'tax_invoice_receipt', 'other');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.documents (
  -- Chosen by the client so files can be uploaded under the id before the row exists.
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  warehouse_id uuid not null,
  supplier_id uuid,
  status public.document_status not null default 'uploaded',

  -- Header fields: extracted, then corrected by the user.
  doc_type public.document_type,
  doc_number text,
  doc_date date,
  supplier_name_raw text,
  supplier_tax_id_raw text,
  vat_rate numeric(5, 2),

  -- Totals as printed on the document, used only for consistency warnings.
  printed_subtotal numeric(12, 2),
  printed_vat numeric(12, 2),
  printed_total numeric(12, 2),
  printed_quantity numeric(12, 3),

  extraction_notes text,
  extraction_error text,
  extraction_started_at timestamptz,
  extraction_model text,
  extracted_at timestamptz,

  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id),
  foreign key (supplier_id, business_id) references public.suppliers (id, business_id)
);

create index documents_business_created_idx on public.documents (business_id, created_at desc);
create index documents_supplier_number_idx on public.documents (business_id, supplier_id, doc_number);

create table public.document_files (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  document_id uuid not null,
  position integer not null,
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  created_at timestamptz not null default now(),
  unique (document_id, position),
  foreign key (document_id, business_id)
    references public.documents (id, business_id) on delete cascade
);

-- Finds an earlier upload of the same file.
create index document_files_fingerprint_idx on public.document_files (business_id, sha256);

create table public.document_lines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  document_id uuid not null,
  position integer not null,

  -- As printed. Codes are text: leading zeros and original case are kept.
  supplier_sku text,
  barcode text,
  description text,
  variant_text text,
  quantity numeric(12, 3),
  unit text,
  -- Per unit, before VAT.
  unit_cost numeric(12, 4),
  -- Supplier's suggested consumer price, when printed. Never used without approval.
  retail_price numeric(12, 2),
  discount_pct numeric(5, 2),
  line_total numeric(12, 2),

  -- Field names the extraction was unsure about; cleared when the user saves the line.
  uncertain_fields text[] not null default '{}',
  note text,

  -- Catalog match, recomputed by match_document_lines.
  variant_id uuid,
  match_method text check (match_method in ('barcode', 'supplier_sku')),

  created_at timestamptz not null default now(),
  foreign key (document_id, business_id)
    references public.documents (id, business_id) on delete cascade,
  foreign key (variant_id, business_id)
    references public.product_variants (id, business_id) on delete set null (variant_id)
);

create index document_lines_document_idx on public.document_lines (document_id, position);
create index document_lines_variant_idx on public.document_lines (variant_id);

-- ---------------------------------------------------------------------------
-- Row level security: members read and edit; owner / manager delete a document.
-- ---------------------------------------------------------------------------

alter table public.documents enable row level security;
alter table public.document_files enable row level security;
alter table public.document_lines enable row level security;

create policy "documents: members read" on public.documents
  for select to authenticated using (private.is_member(business_id));
create policy "documents: members insert" on public.documents
  for insert to authenticated with check (private.is_member(business_id));
create policy "documents: members update" on public.documents
  for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));
create policy "documents: managers delete" on public.documents
  for delete to authenticated using (private.can_manage(business_id));

create policy "document files: members read" on public.document_files
  for select to authenticated using (private.is_member(business_id));
create policy "document files: members insert" on public.document_files
  for insert to authenticated with check (private.is_member(business_id));

create policy "document lines: members read" on public.document_lines
  for select to authenticated using (private.is_member(business_id));
create policy "document lines: members insert" on public.document_lines
  for insert to authenticated with check (private.is_member(business_id));
create policy "document lines: members update" on public.document_lines
  for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));
create policy "document lines: members delete" on public.document_lines
  for delete to authenticated using (private.is_member(business_id));

revoke all on public.documents, public.document_files, public.document_lines
  from anon, authenticated;

grant select, insert on public.documents, public.document_files, public.document_lines
  to authenticated;
grant update (
  supplier_id, status, doc_type, doc_number, doc_date, supplier_name_raw, supplier_tax_id_raw,
  vat_rate, printed_subtotal, printed_vat, printed_total, printed_quantity,
  extraction_notes, extraction_error, extraction_started_at, extraction_model, extracted_at
) on public.documents to authenticated;
grant update (
  position, supplier_sku, barcode, description, variant_text, quantity, unit, unit_cost,
  retail_price, discount_pct, line_total, uncertain_fields, note, variant_id, match_method
) on public.document_lines to authenticated;
grant delete on public.documents, public.document_lines to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects live under <business_id>/<document_id>/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
);

create function private.storage_business_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return (split_part(p_name, '/', 1))::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function private.storage_business_id(text) to authenticated;

create policy "documents bucket: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.is_member(private.storage_business_id(name)));
create policy "documents bucket: members upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and private.is_member(private.storage_business_id(name)));
create policy "documents bucket: managers delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and private.can_manage(private.storage_business_id(name)));

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER: the caller's RLS applies)
-- ---------------------------------------------------------------------------

-- Matches each line to a catalog variant:
--   1. by barcode (also tried against the POS code), which identifies one variant;
--   2. otherwise by supplier SKU of the document's supplier, only when it points
--      at exactly one variant. A model code shared by several sizes stays unmatched
--      for the user to decide.
create function public.match_document_lines(p_document_id uuid)
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
    where l.supplier_sku is not null
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
  where l2.id = l.id and l2.document_id = p_document_id;
$$;

-- Replaces all lines of a document with the given rows, in order, then re-matches.
-- p_lines: [{ supplier_sku, barcode, description, variant_text, quantity, unit,
--             unit_cost, retail_price, discount_pct, line_total, uncertain_fields, note }]
create function public.replace_document_lines(p_document_id uuid, p_lines jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select d.business_id into v_business from public.documents d where d.id = p_document_id;
  if v_business is null then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  delete from public.document_lines where document_id = p_document_id;

  insert into public.document_lines (
    business_id, document_id, position, supplier_sku, barcode, description, variant_text,
    quantity, unit, unit_cost, retail_price, discount_pct, line_total, uncertain_fields, note
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
    nullif(btrim(t.line ->> 'note'), '')
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(line, ord);

  perform public.match_document_lines(p_document_id);
end;
$$;

revoke all on function public.match_document_lines(uuid) from public, anon;
revoke all on function public.replace_document_lines(uuid, jsonb) from public, anon;
grant execute on function public.match_document_lines(uuid) to authenticated;
grant execute on function public.replace_document_lines(uuid, jsonb) to authenticated;
