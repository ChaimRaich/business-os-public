-- Two more areas next to stock, on the same core (SPEC 8, "future expansion"):
--
--   * Accounting: the material the accountant asks for. Supplier invoices come from
--     the receipts that were already approved; other expenses (rent, electricity) are
--     typed in. This is a record for reporting, not a ledger: nothing here issues
--     tax documents.
--   * Campaigns: what the business plans to publish on social networks, post by post.
--     Publishing is manual until a channel is connected (SPEC 8: sending happens only
--     through a connected channel), exactly like the till file.
--
-- Money is owner / manager only. Campaigns are open to every member.

-- ---------------------------------------------------------------------------
-- Accounting
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  expense_date date not null,
  vendor text not null check (length(btrim(vendor)) between 1 and 120),
  category text not null default 'other'
    check (category in ('rent', 'utilities', 'salaries', 'marketing', 'services', 'equipment', 'taxes', 'other')),
  description text check (length(description) <= 300),
  doc_number text check (length(doc_number) <= 40),
  -- Before VAT, and the VAT printed on the document (0 when there is none to claim).
  amount_net numeric(12, 2) not null check (amount_net >= 0),
  vat_amount numeric(12, 2) not null default 0 check (vat_amount >= 0),
  due_date date,
  paid_at date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index expenses_business_date_idx on public.expenses (business_id, expense_date desc);

-- When a supplier's document is due and when it was paid. Kept beside the document,
-- because an approved document is frozen.
create table public.document_payments (
  document_id uuid primary key,
  business_id uuid not null,
  due_date date,
  paid_at date,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  foreign key (document_id, business_id)
    references public.documents (id, business_id) on delete cascade
);

create index document_payments_business_idx on public.document_payments (business_id);

alter table public.expenses enable row level security;
alter table public.document_payments enable row level security;

create policy "expenses: managers read" on public.expenses
  for select to authenticated using (private.can_manage(business_id));
create policy "expenses: managers insert" on public.expenses
  for insert to authenticated with check (private.can_manage(business_id));
create policy "expenses: managers update" on public.expenses
  for update to authenticated
  using (private.can_manage(business_id)) with check (private.can_manage(business_id));
create policy "expenses: managers delete" on public.expenses
  for delete to authenticated using (private.can_manage(business_id));

create policy "document payments: managers read" on public.document_payments
  for select to authenticated using (private.can_manage(business_id));
create policy "document payments: managers insert" on public.document_payments
  for insert to authenticated with check (private.can_manage(business_id));
create policy "document payments: managers update" on public.document_payments
  for update to authenticated
  using (private.can_manage(business_id)) with check (private.can_manage(business_id));

revoke all on public.expenses, public.document_payments from anon, authenticated;
grant select, insert, delete on public.expenses to authenticated;
grant update (expense_date, vendor, category, description, doc_number, amount_net, vat_amount, due_date, paid_at)
  on public.expenses to authenticated;
grant select, insert on public.document_payments to authenticated;
grant update (due_date, paid_at, updated_by, updated_at) on public.document_payments to authenticated;

-- One row per approved receipt, with the cost of its lines. The caller's own access
-- to documents applies. Printed totals win when the document has them (SPEC 5: unit
-- prices are rounded, so line sums can be off by agorot).
create view public.accounting_purchases
with (security_invoker = true)
as
select
  d.id as document_id,
  d.business_id,
  d.supplier_id,
  s.name as supplier_name,
  d.doc_type,
  d.doc_number,
  coalesce(d.doc_date, (d.approved_at at time zone 'Asia/Jerusalem')::date) as doc_date,
  d.vat_rate,
  d.printed_subtotal,
  d.printed_vat,
  d.printed_total,
  coalesce((
    select round(sum(l.quantity * l.unit_cost), 2)
    from public.document_lines l
    where l.document_id = d.id and l.unit_cost is not null
  ), 0) as lines_net,
  (
    select count(*) from public.document_lines l
    where l.document_id = d.id and l.unit_cost is null
  ) as lines_without_cost
from public.documents d
left join public.suppliers s on s.id = d.supplier_id
where d.status = 'approved';

revoke all on public.accounting_purchases from anon, authenticated;
grant select on public.accounting_purchases to authenticated;

-- ---------------------------------------------------------------------------
-- Campaigns
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  goal text check (length(goal) <= 500),
  starts_on date not null,
  ends_on date not null,
  budget numeric(12, 2) check (budget >= 0),
  -- What was actually paid for promotion, typed in by the user.
  spent numeric(12, 2) check (spent >= 0),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  constraint campaigns_dates_in_order check (ends_on >= starts_on)
);

create index campaigns_business_dates_idx on public.campaigns (business_id, starts_on desc);

create table public.campaign_posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  campaign_id uuid not null,
  channel text not null
    check (channel in ('instagram', 'facebook', 'tiktok', 'whatsapp', 'google', 'other')),
  body text not null check (length(btrim(body)) between 1 and 5000),
  -- The product the post is about, when there is one.
  product_id uuid,
  scheduled_for date,
  -- Set by the user after posting it on the network. Writing a post is not publishing it.
  published_at timestamptz,
  published_url text check (length(published_url) <= 500),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (campaign_id, business_id)
    references public.campaigns (id, business_id) on delete cascade,
  foreign key (product_id, business_id)
    references public.products (id, business_id) on delete set null (product_id),
  constraint campaign_posts_url_needs_publish check (published_url is null or published_at is not null)
);

create index campaign_posts_campaign_idx on public.campaign_posts (campaign_id, scheduled_for);
create index campaign_posts_waiting_idx on public.campaign_posts (business_id, scheduled_for)
  where published_at is null;

alter table public.campaigns enable row level security;
alter table public.campaign_posts enable row level security;

create policy "campaigns: members read" on public.campaigns
  for select to authenticated using (private.is_member(business_id));
create policy "campaigns: members insert" on public.campaigns
  for insert to authenticated with check (private.is_member(business_id));
create policy "campaigns: members update" on public.campaigns
  for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));
create policy "campaigns: managers delete" on public.campaigns
  for delete to authenticated using (private.can_manage(business_id));

create policy "campaign posts: members read" on public.campaign_posts
  for select to authenticated using (private.is_member(business_id));
create policy "campaign posts: members insert" on public.campaign_posts
  for insert to authenticated with check (private.is_member(business_id));
create policy "campaign posts: members update" on public.campaign_posts
  for update to authenticated
  using (private.is_member(business_id)) with check (private.is_member(business_id));
create policy "campaign posts: members delete" on public.campaign_posts
  for delete to authenticated using (private.is_member(business_id));

revoke all on public.campaigns, public.campaign_posts from anon, authenticated;
grant select, insert, delete on public.campaigns, public.campaign_posts to authenticated;
grant update (name, goal, starts_on, ends_on, budget, spent) on public.campaigns to authenticated;
grant update (channel, body, product_id, scheduled_for, published_at, published_url)
  on public.campaign_posts to authenticated;
