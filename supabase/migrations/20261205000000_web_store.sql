-- The web store (WooCommerce): orders placed on the site lower stock here.
--
-- One direction only, and read-only towards the site: orders are read through the
-- WooCommerce REST API and nothing is ever written back. Pushing stock to the site
-- waits until the balances here can be trusted.
--
--   * web_connections: one per business. The API key lives in Supabase Vault; the row
--     only points at it, and only an owner / manager can read it back, through
--     get_web_credentials.
--   * A sync sends, for every order line it saw, the quantity that should be off the
--     shelf right now (0 for a cancelled or fully refunded order). record_web_sync
--     compares that with what was already recorded for the line and writes only the
--     difference, so running a sync twice, or after an order changed, never counts
--     anything twice.
--   * Lines are sales_lines like the till's, so unknown codes, "not a stock item" and
--     the sales screen work the same way.

alter table public.sales_imports
  drop constraint sales_imports_source_check,
  add constraint sales_imports_source_check check (source in ('pos_file', 'woocommerce'));

alter table public.sales_lines
  -- "woo|<order id>|<line item id>": the order line this row is (part of) the record of.
  add column source_ref text;

create index sales_lines_source_ref_idx on public.sales_lines (business_id, source_ref)
  where source_ref is not null;

create table public.web_connections (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  platform text not null default 'woocommerce' check (platform in ('woocommerce')),
  store_url text not null check (store_url ~ '^https?://[^/[:space:]]+$'),
  warehouse_id uuid not null,
  -- Orders created before this moment are never imported: stock here starts from it.
  sync_from timestamptz not null,
  secret_id uuid not null,
  -- Last characters of the consumer key, to tell keys apart on screen.
  key_hint text not null,
  -- Orders modified up to here have been read.
  synced_until timestamptz,
  last_attempt_at timestamptz,
  last_ok_at timestamptz,
  last_orders integer,
  last_error text,
  last_error_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (warehouse_id, business_id) references public.warehouses (id, business_id)
);

alter table public.web_connections enable row level security;
create policy "web connections: members read" on public.web_connections
  for select to authenticated using (private.is_member(business_id));
revoke all on public.web_connections from anon, authenticated;
-- Everything except the pointer to the secret.
grant select (
  business_id, platform, store_url, warehouse_id, sync_from, key_hint, synced_until,
  last_attempt_at, last_ok_at, last_orders, last_error, last_error_at, created_at
) on public.web_connections to authenticated;

-- ---------------------------------------------------------------------------
-- Matching: the web id first, then the till code, then a supplier barcode.
-- ---------------------------------------------------------------------------

create function private.variant_for_web_code(p_business_id uuid, p_code text)
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
        and c2.kind in ('web', 'pos', 'barcode')
      order by array_position(array['web', 'pos', 'barcode'], c2.kind::text)
      limit 1
    );
$$;

revoke all on function private.variant_for_web_code(uuid, text) from public, anon, authenticated;

-- A line that waits for its catalog item is looked up the way its source matches.
create or replace function public.rematch_sales_lines(p_business_id uuid)
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
    select s.id, s.code, s.source_ref from public.sales_lines s
    where s.business_id = p_business_id and s.applied_at is null
    order by s.created_at, s.position
    for update
  loop
    v_variant := case when r.source_ref is null
      then private.variant_for_till_code(p_business_id, r.code)
      else private.variant_for_web_code(p_business_id, r.code)
    end;
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

-- ---------------------------------------------------------------------------
-- Connection management (owner / manager)
-- ---------------------------------------------------------------------------

create function public.save_web_connection(
  p_business_id uuid,
  p_store_url text,
  p_consumer_key text,
  p_consumer_secret text,
  p_warehouse_id uuid,
  p_sync_from timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
  v_payload text := jsonb_build_object('key', btrim(p_consumer_key), 'secret', btrim(p_consumer_secret))::text;
begin
  if private.can_manage(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.warehouses w where w.id = p_warehouse_id and w.business_id = p_business_id
  ) then
    raise exception 'warehouse_not_found' using errcode = 'P0002';
  end if;
  if length(btrim(coalesce(p_consumer_key, ''))) < 8 or length(btrim(coalesce(p_consumer_secret, ''))) < 8 then
    raise exception 'bad_credentials' using errcode = 'P0001';
  end if;

  select c.secret_id into v_secret from public.web_connections c where c.business_id = p_business_id;
  if v_secret is null then
    v_secret := vault.create_secret(v_payload, 'web_connection_' || p_business_id, 'WooCommerce REST API key');
    insert into public.web_connections (business_id, store_url, warehouse_id, sync_from, secret_id, key_hint)
    values (p_business_id, rtrim(btrim(p_store_url), '/'), p_warehouse_id, coalesce(p_sync_from, now()),
            v_secret, right(btrim(p_consumer_key), 4));
  else
    perform vault.update_secret(v_secret, v_payload);
    update public.web_connections
    set store_url = rtrim(btrim(p_store_url), '/'), warehouse_id = p_warehouse_id,
        key_hint = right(btrim(p_consumer_key), 4), last_error = null, last_error_at = null
    where business_id = p_business_id;
  end if;
end;
$$;

create function public.delete_web_connection(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if private.can_manage(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.web_connections where business_id = p_business_id returning secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
end;
$$;

-- What the server needs to call the store. Owner / manager only: this returns the key.
create function public.get_web_credentials(p_business_id uuid)
returns table (
  store_url text, consumer_key text, consumer_secret text,
  sync_from timestamptz, synced_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.can_manage(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select c.store_url, (s.decrypted_secret::jsonb ->> 'key'), (s.decrypted_secret::jsonb ->> 'secret'),
           c.sync_from, c.synced_until
    from public.web_connections c
    join vault.decrypted_secrets s on s.id = c.secret_id
    where c.business_id = p_business_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sync results
-- ---------------------------------------------------------------------------

-- p_lines: [{ "order_id", "line_id", "code", "item_name", "net_quantity", "sold_at", "unit_price" }]
-- net_quantity is what should be off the shelf for the line now. Returns how many
-- lines changed stock records.
create function public.record_web_sync(
  p_business_id uuid,
  p_lines jsonb,
  p_synced_until timestamptz,
  p_orders integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.web_connections%rowtype;
  r record;
  v_import uuid;
  v_line uuid;
  v_ref text;
  v_recorded numeric;
  v_parts integer;
  v_delta numeric;
  v_count integer := 0;
  v_ignored integer := 0;
begin
  if private.can_manage(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into c from public.web_connections where business_id = p_business_id for update;
  if not found then
    raise exception 'not_connected' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) > 5000 then
    raise exception 'bad_lines' using errcode = 'P0001';
  end if;

  for r in
    select t.ord::integer as position,
           (t.row ->> 'order_id')::bigint as order_id,
           (t.row ->> 'line_id')::bigint as line_id,
           left(btrim(t.row ->> 'code'), 64) as code,
           nullif(left(btrim(t.row ->> 'item_name'), 200), '') as item_name,
           (t.row ->> 'net_quantity')::numeric as net_quantity,
           (t.row ->> 'sold_at')::timestamptz as sold_at,
           (t.row ->> 'unit_price')::numeric as unit_price
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(row, ord)
    order by t.ord
  loop
    if r.order_id is null or r.line_id is null or r.code is null or r.code = ''
       or r.net_quantity is null or r.net_quantity < 0 then
      raise exception 'bad_line' using errcode = 'P0001', detail = 'line ' || r.position;
    end if;
    if exists (
      select 1 from public.sales_ignored_codes g
      where g.business_id = p_business_id and g.code_norm = upper(r.code)
    ) then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    v_ref := 'woo|' || r.order_id || '|' || r.line_id;
    select coalesce(sum(s.quantity), 0), count(*) into v_recorded, v_parts
    from public.sales_lines s
    where s.business_id = p_business_id and s.source_ref = v_ref;
    v_delta := r.net_quantity - v_recorded;
    if v_delta = 0 then
      continue;
    end if;

    if v_import is null then
      insert into public.sales_imports (business_id, warehouse_id, source, file_name, file_sha256, row_count)
      values (p_business_id, c.warehouse_id, 'woocommerce', 'הזמנות מהאתר',
              md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text), 0)
      returning id into v_import;
    end if;

    insert into public.sales_lines (
      business_id, import_id, warehouse_id, position, code, item_name, transaction_ref,
      external_key, source_ref, sold_at, quantity, unit_price, variant_id
    )
    values (
      p_business_id, v_import, c.warehouse_id, r.position, r.code, r.item_name, r.order_id::text,
      v_ref || '|' || (v_parts + 1), v_ref, coalesce(r.sold_at, now()), v_delta, r.unit_price,
      private.variant_for_web_code(p_business_id, r.code)
    )
    returning id into v_line;
    perform private.apply_sales_line(v_line);
    v_count := v_count + 1;
  end loop;

  if v_import is not null then
    update public.sales_imports i
    set row_count = v_count,
        ignored_count = v_ignored,
        first_sold_at = (select min(s.sold_at) from public.sales_lines s where s.import_id = v_import),
        last_sold_at = (select max(s.sold_at) from public.sales_lines s where s.import_id = v_import)
    where i.id = v_import;
  end if;

  update public.web_connections
  set synced_until = greatest(coalesce(synced_until, p_synced_until), p_synced_until),
      last_attempt_at = now(), last_ok_at = now(), last_orders = p_orders,
      last_error = null, last_error_at = null
  where business_id = p_business_id;
  return v_count;
end;
$$;

-- A failed sync is shown on the connections screen until the next one succeeds.
create function public.record_web_sync_error(p_business_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.can_manage(p_business_id) is not true then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.web_connections
  set last_attempt_at = now(), last_error = left(btrim(coalesce(p_error, '')), 500), last_error_at = now()
  where business_id = p_business_id;
end;
$$;

revoke all on function public.save_web_connection(uuid, text, text, text, uuid, timestamptz) from public, anon;
revoke all on function public.delete_web_connection(uuid) from public, anon;
revoke all on function public.get_web_credentials(uuid) from public, anon;
revoke all on function public.record_web_sync(uuid, jsonb, timestamptz, integer) from public, anon;
revoke all on function public.record_web_sync_error(uuid, text) from public, anon;
grant execute on function public.save_web_connection(uuid, text, text, text, uuid, timestamptz) to authenticated;
grant execute on function public.delete_web_connection(uuid) to authenticated;
grant execute on function public.get_web_credentials(uuid) to authenticated;
grant execute on function public.record_web_sync(uuid, jsonb, timestamptz, integer) to authenticated;
grant execute on function public.record_web_sync_error(uuid, text) to authenticated;
