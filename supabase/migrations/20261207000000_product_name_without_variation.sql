-- A product created from a receiving document was named after the first row's full
-- description, variation included ("טבעת CAG020-1 מידת הטבעת 8"), and the other sizes
-- then appeared under that name. The name now stops at the model code.

create or replace function public.create_products_from_lines(p_document_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
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
        btrim(left(coalesce(
          -- A row that states a variation names the whole model: keep the description
          -- up to the model code, so "ring X size 8" does not become the name of size 6.
          case when v_label <> '' and v_sku is not null
                 and position(lower(v_sku) in lower(btrim(r.description))) > 0
               then nullif(btrim(left(btrim(r.description),
                      position(lower(v_sku) in lower(btrim(r.description))) + length(v_sku) - 1)), '')
          end,
          nullif(btrim(r.description), ''), v_sku, v_barcode), 200)),
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
