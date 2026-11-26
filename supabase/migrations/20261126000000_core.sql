-- Core: profiles, businesses, memberships, roles, and tenant isolation (RLS).
-- Every later table carries business_id and reuses private.is_member / private.role_in.

create schema if not exists private;

create type public.member_role as enum ('owner', 'manager', 'staff');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_user_id_idx on public.business_members (user_id);

-- ---------------------------------------------------------------------------
-- Helpers used by policies. SECURITY DEFINER so they can read memberships
-- without recursing into the policies that call them.
-- ---------------------------------------------------------------------------

create function private.is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
  );
$$;

create function private.role_in(p_business_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.business_members m
  where m.business_id = p_business_id
    and m.user_id = (select auth.uid());
$$;

create function private.shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members mine
    join public.business_members theirs using (business_id)
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A profile row for every auth user.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- A business must always keep at least one owner.
create function private.keep_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then
    return new;
  end if;

  -- Serialize concurrent owner changes; also skips the check when the
  -- business itself is being deleted (cascade).
  perform 1 from public.businesses b where b.id = old.business_id for update;
  if not found then
    return coalesce(new, old);
  end if;

  if not exists (
    select 1
    from public.business_members m
    where m.business_id = old.business_id
      and m.role = 'owner'
      and m.user_id <> old.user_id
  ) then
    raise exception 'last_owner' using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger business_members_keep_last_owner
  before update or delete on public.business_members
  for each row execute function private.keep_last_owner();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

create policy "profiles: read self and co-members"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_business_with(id));

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "businesses: members read"
  on public.businesses for select to authenticated
  using (private.is_member(id));

create policy "businesses: owner updates"
  on public.businesses for update to authenticated
  using (private.role_in(id) = 'owner')
  with check (private.role_in(id) = 'owner');

create policy "members: members read"
  on public.business_members for select to authenticated
  using (private.is_member(business_id));

create policy "members: owner changes role"
  on public.business_members for update to authenticated
  using (private.role_in(business_id) = 'owner')
  with check (private.role_in(business_id) = 'owner');

create policy "members: owner removes, anyone leaves"
  on public.business_members for delete to authenticated
  using (
    private.role_in(business_id) = 'owner'
    or user_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Privileges: nothing for anon; column-scoped writes for signed-in users.
-- Inserts into businesses / business_members only happen through the RPCs below.
-- ---------------------------------------------------------------------------

revoke all on public.profiles, public.businesses, public.business_members
  from anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function
  private.is_member(uuid),
  private.role_in(uuid),
  private.shares_business_with(uuid)
  to authenticated;

grant select on public.profiles, public.businesses, public.business_members
  to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant update (name) on public.businesses to authenticated;
grant update (role) on public.business_members to authenticated;
grant delete on public.business_members to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Creates a business and makes the caller its owner, atomically.
create function public.create_business(p_name text)
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

  return v_id;
end;
$$;

-- Adds an existing user (by email) to a business. Owner only.
create function public.add_member_by_email(
  p_business_id uuid,
  p_email text,
  p_role public.member_role default 'staff'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid;
begin
  if private.role_in(p_business_id) is distinct from 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.id into v_target
  from public.profiles p
  where lower(p.email) = lower(btrim(p_email));

  if v_target is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (p_business_id, v_target, p_role);

  return v_target;
exception
  when unique_violation then
    raise exception 'already_member' using errcode = '23505';
end;
$$;

revoke all on function public.create_business(text) from public, anon;
revoke all on function public.add_member_by_email(uuid, text, public.member_role) from public, anon;
grant execute on function public.create_business(text) to authenticated;
grant execute on function public.add_member_by_email(uuid, text, public.member_role) to authenticated;
