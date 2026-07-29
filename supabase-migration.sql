-- ============================================================
-- NeoX ERP — Migration : nouvelles tables manquantes
-- Exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

-- Nouveaux types enum
create type location_type as enum ('shop','warehouse');
create type payment_type as enum ('cash','bank','mobile','check','product','mixed');
create type supplier_invoice_status as enum ('draft','paid','partial','credit','cancelled');
create type comp_direction as enum ('debt_to_goods','goods_to_debt');
create type comp_status as enum ('pending','completed','cancelled');
create type transfer_status as enum ('pending','completed','cancelled');
create type product_history_action as enum ('created','updated','deleted','purchased','sold','returned','adjusted','transferred_in','transferred_out','price_changed','inventory','supplier_entry','supplier_exit');

-- Settings (manquant)
create table if not exists settings (
  id text primary key,
  name text not null,
  currency text not null default 'XOF',
  currency_symbol text not null default 'FCFA',
  currencies jsonb not null default '[]',
  locale text not null default 'fr-FR',
  language text not null default 'fr',
  timezone text not null default 'Africa/Ouagadougou',
  tax_rate numeric not null default 0,
  invoice_prefix text not null default 'FAC-',
  invoice_next_number integer not null default 1,
  email text, phone text, address text,
  created_at timestamptz not null default now()
);

-- Locations (multi-boutique/dépôt) — DOIT venir avant ALTER TABLE
create table locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null,
  type location_type not null default 'shop',
  address text, phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Product Stocks (stock par emplacement)
create table product_stocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  product_id uuid not null references products on delete cascade,
  location_id uuid not null references locations on delete cascade,
  quantity integer not null default 0,
  stock_alert integer not null default 10,
  stock_min integer not null default 0,
  stock_max integer not null default 999999,
  updated_at timestamptz not null default now(),
  unique(product_id, location_id)
);

-- Product History (traçabilité complète)
create table product_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  product_id uuid not null references products on delete cascade,
  location_id uuid references locations on delete set null,
  action product_history_action not null,
  quantity_before integer not null default 0,
  quantity_after integer not null default 0,
  user_id uuid references profiles on delete set null,
  reference text, comment text,
  created_at timestamptz not null default now()
);

-- Supplier Invoices
create table supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  supplier_id uuid not null references suppliers on delete cascade,
  number text not null,
  items jsonb not null default '[]',
  subtotal numeric not null default 0,
  tax_total numeric not null default 0,
  total numeric not null default 0,
  paid numeric not null default 0,
  balance numeric not null default 0,
  due_date date,
  payments jsonb not null default '[]',
  status supplier_invoice_status not null default 'credit',
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Supplier Payments
create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  invoice_id uuid not null references supplier_invoices on delete cascade,
  lines jsonb not null default '[]',
  amount numeric not null,
  date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Compensations (dette ↔ marchandises)
create table compensations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  party_id uuid not null,
  party_type text not null default 'supplier',
  direction comp_direction not null,
  reference_invoice_id text,
  amount numeric not null,
  items jsonb not null default '[]',
  settled_amount numeric not null default 0,
  balance numeric not null default 0,
  status comp_status not null default 'pending',
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Ajout de location_id sur sales et purchases (après création de locations)
alter table sales add column if not exists location_id uuid references locations on delete set null;
alter table purchases add column if not exists location_id uuid references locations on delete set null;

-- ============================================================
-- RBAC : Permissions granulaires et isolation des boutiques
-- ============================================================

-- Ajouter login_id et is_primary_admin à profiles
alter table profiles add column if not exists login_id text;
alter table profiles add column if not exists is_primary_admin boolean not null default false;

-- Mettre à jour le trigger handle_new_user pour définir is_primary_admin
create or replace function handle_new_user()
returns trigger as $$
declare
  biz_id uuid;
begin
  biz_id := gen_random_uuid();
  insert into public.businesses (id, name, currency, currency_symbol, phone, email, is_active)
  values (biz_id, coalesce(new.raw_user_meta_data->>'business_name', new.raw_user_meta_data->>'name' || '''s Shop'), 'XOF', 'FCFA', new.raw_user_meta_data->>'phone', new.email, true);
  insert into public.profiles (auth_user_id, business_id, name, email, login_id, phone, role, permissions, is_primary_admin)
  values (new.id, biz_id, coalesce(new.raw_user_meta_data->>'name', 'Utilisateur'), new.email, new.email, new.raw_user_meta_data->>'phone', 'admin', array['*'], true);

  insert into public.locations (id, business_id, name, type, address, phone, is_active, created_at, updated_at)
  values
    (gen_random_uuid(), biz_id, 'Boutique Principale', 'shop', '', new.raw_user_meta_data->>'phone', true, now(), now()),
    (gen_random_uuid(), biz_id, 'Dépôt Principal', 'warehouse', '', '', true, now(), now());

  insert into public.accounts (id, business_id, code, name, type, balance, created_at)
  values
    (gen_random_uuid(), biz_id, '101', 'Caisse', 'asset', 0, now()),
    (gen_random_uuid(), biz_id, '102', 'Banque', 'asset', 0, now()),
    (gen_random_uuid(), biz_id, '103', 'Clients', 'asset', 0, now()),
    (gen_random_uuid(), biz_id, '104', 'Stock', 'asset', 0, now()),
    (gen_random_uuid(), biz_id, '201', 'Fournisseurs', 'liability', 0, now()),
    (gen_random_uuid(), biz_id, '301', 'Capital', 'equity', 0, now()),
    (gen_random_uuid(), biz_id, '401', 'Ventes', 'revenue', 0, now()),
    (gen_random_uuid(), biz_id, '501', 'Dépenses', 'expense', 0, now());

  return new;
end;
$$ language plpgsql security definer;

-- Supprimer l'ancien trigger et le recréer
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Fonction de vérification des permissions côté serveur
create or replace function check_user_permission(p_user_id uuid, p_required_permission text)
returns boolean as $$
declare
  user_permissions text[];
  biz_id uuid;
begin
  select permissions, business_id into user_permissions, biz_id
  from profiles where auth_user_id = p_user_id;
  if user_permissions is null then
    return false;
  end if;
  if user_permissions @> array['*'] then
    return true;
  end if;
  return user_permissions @> array[p_required_permission];
end;
$$ language plpgsql security definer;

-- Mettre à jour la politique profiles pour permettre aux admins de la même boutique de voir les autres utilisateurs
drop policy if exists "profile_access" on profiles;
create policy "profile_access" on profiles
  for all using (
    auth_user_id = auth.uid()
    or (
      exists (
        select 1 from profiles p2
        where p2.auth_user_id = auth.uid()
        and p2.business_id = profiles.business_id
        and (p2.permissions @> array['*'] or p2.permissions @> array['users:view'])
      )
    )
  );

-- Audit logs améliorés : ajouter ip_address et old_data / new_data
alter table audit_logs add column if not exists ip_address text;
alter table audit_logs add column if not exists old_data jsonb;
alter table audit_logs add column if not exists new_data jsonb;

-- Index pour améliorer les performances des requêtes RBAC
create index if not exists idx_profiles_business_id on profiles(business_id);
create index if not exists idx_profiles_login_id on profiles(login_id);
create index if not exists idx_audit_logs_business_action on audit_logs(business_id, action);

-- Transfers (entre emplacements)
create table transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  from_location_id uuid not null references locations on delete cascade,
  to_location_id uuid not null references locations on delete cascade,
  items jsonb not null default '[]',
  status transfer_status not null default 'pending',
  validated_by uuid references profiles on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- RLS pour les nouvelles tables
alter table locations enable row level security;
alter table product_stocks enable row level security;
alter table product_history enable row level security;
alter table supplier_invoices enable row level security;
alter table supplier_payments enable row level security;
alter table compensations enable row level security;
alter table transfers enable row level security;

-- Politiques RLS pour les nouvelles tables
create policy "tenant_access_locations" on locations for all using (
  business_id in (select business_id from profiles where auth_user_id = auth.uid())
);
create policy "tenant_access_product_stocks" on product_stocks for all using (
  business_id in (select business_id from profiles where auth_user_id = auth.uid())
);
create policy "tenant_access_product_history" on product_history for all using (
  business_id in (select business_id from profiles where auth_user_id = auth.uid())
);
create policy "tenant_access_supplier_invoices" on supplier_invoices for all using (
  business_id in (select business_id from profiles where auth_user_id = auth.uid())
);
create policy "tenant_access_supplier_payments" on supplier_payments for all using (
  business_id in (select business_id from profiles where auth_user_id = auth.uid())
);
create policy "tenant_access_compensations" on compensations for all using (
  business_id in (select business_id from profiles where auth_user_id = auth.uid())
);
create policy "tenant_access_transfers" on transfers for all using (
  business_id in (select business_id from profiles where auth_user_id = auth.uid())
);
