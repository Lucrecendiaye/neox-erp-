-- ============================================================
-- NEOX ERP — Correction synchronisation utilisateurs multi-appareils
-- 1) RLS profiles : self + admin de la même boutique (voir tous les membres)
-- 2) Realtime : ajouter profiles + tables manquantes à supabase_realtime
-- 3) Colonnes manquantes (status, is_primary_admin, login_id)
-- 4) admin_delete_user (suppression cloud) + admin_reset_password (durci)
-- 5) Tables cash_operations / cash_categories (module Cash)
-- À exécuter dans Supabase Dashboard > SQL Editor (ou une fois via scripts/apply-users-sync-fix.mjs)
-- ============================================================

-- ---- 1) Colonnes manquantes sur profiles --------------------
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists is_primary_admin boolean not null default false;
alter table public.profiles add column if not exists login_id text;

update public.profiles set is_primary_admin = true
where role = 'admin' and (permissions ? '*') and is_primary_admin = false;

-- Index aide au realtime/RLS
create index if not exists idx_profiles_auth_user on public.profiles(auth_user_id);

-- ---- 2) Helper : le demandeur gère-t-il la boutique ? ---------
create or replace function public.tenant_caller_is_profile_admin(p_business text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_biz text;
  v_perms jsonb;
  v_primary boolean;
begin
  select p."businessId", p.permissions, p.is_primary_admin into v_biz, v_perms, v_primary
  from public.profiles p
  where p."auth_user_id" = auth.uid()
  limit 1;
  if v_biz is null or v_biz is distinct from p_business then
    return false;
  end if;
  if v_primary then
    return true;
  end if;
  return coalesce(v_perms, '[]'::jsonb) ? '*' or coalesce(v_perms, '[]'::jsonb) ? 'users:view';
end;
$$;

-- ---- 3) Nouvelle politique RLS profiles -----------------------
drop policy if exists "tenant_access_profiles" on public.profiles;
create policy "profile_access_business" on public.profiles
  for all
  using ( auth_user_id = auth.uid() or public.tenant_caller_is_profile_admin(profiles."businessId") );

-- ---- 4) admin_delete_user (suppression cloud réelle : profiles + auth.users) ----
create or replace function public.admin_delete_user(p_auth_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_biz text;
  v_target_biz text;
begin
  select p."businessId" into v_biz
  from public.profiles p where p."auth_user_id" = auth.uid() limit 1;
  if v_biz is null or not public.tenant_caller_is_profile_admin(v_biz) then
    if auth.role() <> 'service_role' then return false; end if;
  end if;
  select p."businessId" into v_target_biz
  from public.profiles p where p."auth_user_id" = p_auth_user_id limit 1;
  if v_target_biz is null or (auth.role() <> 'service_role' and v_target_biz is distinct from v_biz) then
    return false;
  end if;
  delete from public.profiles where "auth_user_id" = p_auth_user_id;
  delete from auth.users where id = p_auth_user_id;
  return true;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to anon, authenticated;

-- ---- 5) admin_reset_password : autorise l'admin de la même boutique ----
create or replace function public.admin_reset_password(p_email text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_biz text;
begin
  select p."businessId" into target_biz
  from public.profiles p
  where lower(coalesce(p.email, '')) = lower(coalesce(p_email, ''))
  limit 1;
  if target_biz is null or not public.tenant_caller_is_profile_admin(target_biz) then
    if auth.role() <> 'service_role' then return false; end if;
  end if;
  update auth.users
  set encrypted_password = crypt(coalesce(p_password, 'default123'), gen_salt('bf', 10)),
      updated_at = now()
  where lower(coalesce(email, '')) = lower(coalesce(p_email, ''));
  return true;
end;
$$;

grant execute on function public.admin_reset_password(text, text) to anon, authenticated;

-- ---- 6) Tables cash_operations / cash_categories --------------
create table if not exists public.cash_categories (
  id text primary key,
  "businessId" text not null,
  name text not null,
  type text not null default 'both',
  "isDefault" boolean not null default false,
  color text,
  active boolean not null default true,
  "createdAt" timestamptz not null default now()
);
create index if not exists idx_cash_categories_business on public.cash_categories("businessId");

create table if not exists public.cash_operations (
  id text primary key,
  "businessId" text not null,
  number text not null,
  type text not null,
  amount numeric(12,0) not null,
  "categoryId" text,
  "categoryName" text,
  description text,
  "partyName" text,
  "paymentMethod" text not null default 'cash',
  "locationId" text,
  "locationName" text,
  status text not null default 'completed',
  date timestamptz not null default now(),
  reference text,
  "receiptPhoto" text,
  "balanceAfter" numeric(12,0),
  "userId" text,
  "userName" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz,
  "cancelledAt" timestamptz,
  "cancelledBy" text,
  "cancelReason" text
);
create index if not exists idx_cash_ops_business on public.cash_operations("businessId");
create index if not exists idx_cash_ops_date on public.cash_operations(date desc);
create index if not exists idx_cash_ops_type on public.cash_operations(type);

alter table public.cash_operations enable row level security;
alter table public.cash_categories enable row level security;

-- ---- 7) Realtime : publier TOUTES les tables utilisées par l'app --
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','businesses','settings','bon_sorties','credit_payments',
    'accounts','accounting_entries','cash_book','transfers','compensations',
    'supplier_invoices','supplier_payments','product_history','employees',
    'attendance','payrolls','leads','business_cards','invoices',
    'cash_operations','cash_categories'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when undefined_table or duplicate_object then
      null;
    end;
  end loop;
end $$;

-- ---- 8) RLS tenant pour les nouvelles tables -------------------
do $$
declare t text;
begin
  foreach t in array array['cash_operations','cash_categories']
  loop
    execute format('create policy "tenant_access_%s" on public.%I for all using ("businessId" in (select "businessId" from profiles where auth_user_id = auth.uid()))', t, t);
  end loop;
end $$;