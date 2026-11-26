-- End-to-end SMB suite: mandatory integration onboarding, finance & accounting,
-- marketing campaigns, and CRM. Every table carries business_id and enforces
-- tenant isolation with private.is_member / private.role_in.

-- ---------------------------------------------------------------------------
-- Onboarding state on businesses
-- ---------------------------------------------------------------------------

alter table public.businesses
  add column onboarding_completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.integration_category as enum (
  'pos_commerce',
  'accounting',
  'payments',
  'marketing_crm'
);

create type public.integration_status as enum (
  'disconnected',
  'sandbox',
  'connected',
  'error'
);

create type public.ledger_entry_kind as enum (
  'income',
  'expense',
  'invoice',
  'tax_payment'
);

create type public.ledger_entry_status as enum (
  'draft',
  'pending',
  'paid',
  'overdue'
);

create type public.campaign_channel as enum (
  'meta_ads',
  'google_ads',
  'whatsapp',
  'email',
  'sms'
);

create type public.campaign_status as enum (
  'draft',
  'active',
  'paused',
  'completed'
);

create type public.customer_stage as enum (
  'lead',
  'prospect',
  'active',
  'vip',
  'inactive'
);

-- ---------------------------------------------------------------------------
-- Shared trigger helper
-- ---------------------------------------------------------------------------

create function private.suite_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Business Integrations (required for onboarding completion)
-- ---------------------------------------------------------------------------

create table public.business_integrations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category public.integration_category not null,
  provider text not null check (length(btrim(provider)) between 1 and 80),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  status public.integration_status not null default 'disconnected',
  mode text not null default 'sandbox' check (mode in ('live', 'sandbox')),
  account_ref text check (account_ref is null or length(btrim(account_ref)) <= 160),
  credential_hint text check (credential_hint is null or length(btrim(credential_hint)) <= 40),
  config jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, category)
);

create index business_integrations_business_idx
  on public.business_integrations (business_id, category);

create trigger business_integrations_updated_at
  before update on public.business_integrations
  for each row execute function private.suite_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Finance Accounts & Accounting Ledger
-- ---------------------------------------------------------------------------

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  account_type text not null check (account_type in ('bank', 'clearing', 'cash', 'accounting')),
  institution text check (institution is null or length(btrim(institution)) <= 120),
  account_number_last4 text check (account_number_last4 is null or length(btrim(account_number_last4)) <= 12),
  currency text not null default 'ILS' check (length(btrim(currency)) between 3 and 8),
  balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create index finance_accounts_business_idx
  on public.finance_accounts (business_id, created_at);

create trigger finance_accounts_updated_at
  before update on public.finance_accounts
  for each row execute function private.suite_touch_updated_at();

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  account_id uuid,
  kind public.ledger_entry_kind not null,
  status public.ledger_entry_status not null default 'pending',
  title text not null check (length(btrim(title)) between 1 and 200),
  counterparty text check (counterparty is null or length(btrim(counterparty)) <= 160),
  reference_number text check (reference_number is null or length(btrim(reference_number)) <= 80),
  amount numeric(14, 2) not null check (amount >= 0),
  vat_amount numeric(14, 2) not null default 0 check (vat_amount >= 0),
  entry_date date not null default current_date,
  due_date date,
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, business_id)
    references public.finance_accounts (id, business_id) on delete set null (account_id)
);

create index ledger_entries_business_date_idx
  on public.ledger_entries (business_id, entry_date desc, created_at desc);

create trigger ledger_entries_updated_at
  before update on public.ledger_entries
  for each row execute function private.suite_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Marketing Campaigns
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  channel public.campaign_channel not null,
  status public.campaign_status not null default 'draft',
  budget numeric(12, 2) not null default 0 check (budget >= 0),
  spent numeric(12, 2) not null default 0 check (spent >= 0),
  leads_count integer not null default 0 check (leads_count >= 0),
  conversions_count integer not null default 0 check (conversions_count >= 0),
  revenue numeric(12, 2) not null default 0 check (revenue >= 0),
  start_date date,
  end_date date,
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_business_idx
  on public.campaigns (business_id, created_at desc);

create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function private.suite_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. CRM Customers & Leads
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  phone text check (phone is null or length(btrim(phone)) <= 40),
  email text check (email is null or length(btrim(email)) <= 160),
  stage public.customer_stage not null default 'lead',
  source text check (source is null or length(btrim(source)) <= 80),
  lifetime_value numeric(12, 2) not null default 0 check (lifetime_value >= 0),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_business_idx
  on public.customers (business_id, created_at desc);

create trigger customers_updated_at
  before update on public.customers
  for each row execute function private.suite_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPC: Complete mandatory business onboarding once all 4 categories are ready
-- ---------------------------------------------------------------------------

create function public.complete_business_onboarding(p_business_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ready_count integer;
  v_completed_at timestamptz;
begin
  if not coalesce(private.role_in(p_business_id) in ('owner', 'manager'), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(distinct bi.category)
  into v_ready_count
  from public.business_integrations bi
  where bi.business_id = p_business_id
    and bi.status in ('connected', 'sandbox');

  if v_ready_count < 4 then
    raise exception 'integrations_incomplete' using errcode = 'P0001';
  end if;

  update public.businesses
  set onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = p_business_id
  returning onboarding_completed_at into v_completed_at;

  return v_completed_at;
end;
$$;

-- Prevent clients from directly spoofing onboarding_completed_at via UPDATE on businesses.
create function private.protect_onboarding_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.onboarding_completed_at is distinct from old.onboarding_completed_at
     and current_user = 'authenticated' then
    raise exception 'use_complete_business_onboarding' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger businesses_protect_onboarding
  before update on public.businesses
  for each row execute function private.protect_onboarding_column();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.business_integrations enable row level security;
alter table public.finance_accounts enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.campaigns enable row level security;
alter table public.customers enable row level security;

-- business_integrations: all members read; owner/manager manage
create policy business_integrations_select on public.business_integrations
  for select to authenticated
  using (private.is_member(business_id));

create policy business_integrations_insert on public.business_integrations
  for insert to authenticated
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy business_integrations_update on public.business_integrations
  for update to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'))
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy business_integrations_delete on public.business_integrations
  for delete to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'));

-- finance_accounts: all members read; owner/manager manage
create policy finance_accounts_select on public.finance_accounts
  for select to authenticated
  using (private.is_member(business_id));

create policy finance_accounts_insert on public.finance_accounts
  for insert to authenticated
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy finance_accounts_update on public.finance_accounts
  for update to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'))
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy finance_accounts_delete on public.finance_accounts
  for delete to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'));

-- ledger_entries: all members read; owner/manager manage
create policy ledger_entries_select on public.ledger_entries
  for select to authenticated
  using (private.is_member(business_id));

create policy ledger_entries_insert on public.ledger_entries
  for insert to authenticated
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy ledger_entries_update on public.ledger_entries
  for update to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'))
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy ledger_entries_delete on public.ledger_entries
  for delete to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'));

-- campaigns: all members read; owner/manager manage
create policy campaigns_select on public.campaigns
  for select to authenticated
  using (private.is_member(business_id));

create policy campaigns_insert on public.campaigns
  for insert to authenticated
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy campaigns_update on public.campaigns
  for update to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'))
  with check (private.role_in(business_id) in ('owner', 'manager'));

create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'));

-- customers: all members read/add/edit; owner/manager delete
create policy customers_select on public.customers
  for select to authenticated
  using (private.is_member(business_id));

create policy customers_insert on public.customers
  for insert to authenticated
  with check (private.is_member(business_id));

create policy customers_update on public.customers
  for update to authenticated
  using (private.is_member(business_id))
  with check (private.is_member(business_id));

create policy customers_delete on public.customers
  for delete to authenticated
  using (private.role_in(business_id) in ('owner', 'manager'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.business_integrations,
  public.finance_accounts,
  public.ledger_entries,
  public.campaigns,
  public.customers
  to authenticated;

grant execute on function public.complete_business_onboarding(uuid) to authenticated;
