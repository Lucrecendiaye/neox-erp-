-- ============================================================
-- NeoX ERP — Schéma Supabase Complet
-- Exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
create type product_status as enum ('active','inactive','discontinued');
create type location_type as enum ('shop','warehouse');
create type payment_type as enum ('cash','bank','mobile','check','product','mixed');
create type supplier_invoice_status as enum ('draft','paid','partial','credit','cancelled');
create type comp_direction as enum ('debt_to_goods','goods_to_debt');
create type comp_status as enum ('pending','completed','cancelled');
create type transfer_status as enum ('pending','completed','cancelled');
create type product_history_action as enum ('created','updated','deleted','purchased','sold','returned','adjusted','transferred_in','transferred_out','price_changed','inventory','supplier_entry','supplier_exit');
create type sale_status as enum ('pending','completed','cancelled','returned');
create type payment_method as enum ('cash','card','mobile','credit','bank');
create type invoice_type as enum ('sale','purchase','credit_note','debit_note');
create type invoice_status as enum ('draft','sent','paid','overdue','cancelled');
create type account_type as enum ('asset','liability','equity','revenue','expense');
create type credit_status as enum ('active','paid','overdue','defaulted');
create type movement_type as enum ('in','out','adjustment','transfer','inventory');
create type user_role as enum ('admin','manager','staff','viewer');
create type notif_type as enum ('stock_alert','credit_due','new_sale','payment_received','invoice_overdue','payroll','lead');
create type attend_status as enum ('present','absent','late','half-day','leave');
create type payroll_status as enum ('draft','paid','cancelled');
create type salary_type as enum ('monthly','daily','hourly');
create type emp_status as enum ('active','inactive','terminated');
create type lead_status as enum ('new','contacted','qualified','proposal','won','lost');
create type cash_type as enum ('in','out');
create type entry_type as enum ('revenue','expense','transfer','credit','debit');
create type entry_dir as enum ('debit','credit');

-- Companies
create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo text,
  currency text not null default 'XOF',
  currency_symbol text not null default 'FCFA',
  phone text, email text, address text, tax_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Profiles (lié à auth.users)
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users on delete cascade,
  business_id uuid references businesses on delete set null,
  name text not null,
  email text, phone text,
  login_id text,
  role user_role not null default 'staff',
  avatar text,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  is_primary_admin boolean not null default false,
  created_at timestamptz not null default now(),
  last_login timestamptz
);

-- Categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null, description text,
  parent_id uuid references categories on delete set null,
  created_at timestamptz not null default now()
);

-- Suppliers (doit être avant Products à cause de la FK)
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null, phone text not null, email text, address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Customers
create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null, phone text not null, email text, address text,
  credit_limit numeric not null default 0,
  current_balance numeric not null default 0,
  notes text, photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Products
create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null, description text,
  photos text[] not null default '{}',
  barcode text, qr_code text, reference text, brand text,
  category_id uuid references categories on delete set null,
  unit text not null default 'pièce',
  purchase_price numeric not null default 0,
  selling_price numeric not null default 0,
  wholesale_price numeric default 0,
  margin numeric not null default 0,
  tax_rate numeric not null default 0,
  stock_alert integer default 0,
  stock_min integer default 0, stock_max integer default 0,
  location text,
  supplier_id uuid references suppliers on delete set null,
  status product_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stock Movements
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  product_id uuid not null references products on delete cascade,
  type movement_type not null,
  quantity integer not null,
  unit_price numeric,
  reference text, note text,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Sales
create table sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  invoice_number text not null,
  customer_id uuid references customers on delete set null,
  customer_name text,
  location_id uuid references locations on delete set null,
  items jsonb not null default '[]',
  subtotal numeric not null,
  discount_total numeric not null default 0,
  tax_total numeric not null default 0,
  total numeric not null,
  paid numeric not null default 0,
  change numeric not null default 0,
  payment_method payment_method not null default 'cash',
  status sale_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Purchases
create table purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  supplier_id uuid references suppliers on delete set null,
  supplier_name text,
  location_id uuid references locations on delete set null,
  items jsonb not null default '[]',
  subtotal numeric not null,
  discount_total numeric not null default 0,
  tax_total numeric not null default 0,
  total numeric not null,
  paid numeric not null default 0,
  status sale_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Invoices
create table invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  type invoice_type not null,
  number text not null,
  party_id uuid, party_name text,
  items jsonb not null default '[]',
  subtotal numeric not null,
  tax_total numeric not null default 0,
  total numeric not null,
  paid numeric not null default 0,
  due_date date,
  status invoice_status not null default 'draft',
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Accounts
create table accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  code text not null, name text not null,
  type account_type not null,
  balance numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Accounting Entries
create table accounting_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  date date not null default current_date,
  type entry_type not null,
  account_id uuid not null references accounts on delete cascade,
  account_name text not null,
  amount numeric not null,
  direction entry_dir not null,
  reference text not null,
  description text,
  linked_id text, linked_type text,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Credits
create table credits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  customer_id uuid not null references customers on delete cascade,
  customer_name text not null,
  invoice_id uuid references invoices on delete set null,
  amount numeric not null,
  paid numeric not null default 0,
  balance numeric not null,
  due_date date not null,
  status credit_status not null default 'active',
  reminder_sent text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Audit Logs
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  user_id uuid references profiles on delete set null,
  user_name text,
  user_login_id text,
  user_role user_role,
  action text not null,
  entity text not null,
  entity_id text not null,
  details text,
  ip text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- Notifications
create table notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  type notif_type not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);

-- Employees
create table employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null, phone text not null, email text,
  position text not null, department text not null,
  salary numeric not null,
  salary_type salary_type not null default 'monthly',
  payment_method payment_method not null default 'bank',
  bank_account text, address text,
  photo text, documents text[] not null default '{}',
  hire_date date not null,
  status emp_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Attendance
create table attendance (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  date date not null,
  check_in time, check_out time,
  status attend_status not null default 'present',
  note text,
  created_at timestamptz not null default now()
);

-- Payrolls
create table payrolls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  employee_id uuid not null references employees on delete cascade,
  employee_name text not null,
  period_start date not null, period_end date not null,
  base_salary numeric not null,
  allowances numeric not null default 0,
  deductions numeric not null default 0,
  bonus numeric not null default 0,
  net_salary numeric not null,
  days_worked integer not null default 0,
  status payroll_status not null default 'draft',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Cash Book
create table cash_book (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  date date not null default current_date,
  type cash_type not null,
  category text not null,
  amount numeric not null,
  description text,
  party_id uuid, party_name text,
  payment_method payment_method not null default 'cash',
  reference text, attachment text,
  created_at timestamptz not null default now(),
  user_id uuid references profiles on delete set null
);

-- Leads (CRM)
create table leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null, phone text not null, email text,
  company text, source text not null,
  status lead_status not null default 'new',
  notes text,
  assigned_to uuid references profiles on delete set null,
  expected_value numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Business Cards
create table business_cards (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  name text not null, phone text not null, email text,
  address text, website text, logo text,
  design integer not null default 1,
  created_at timestamptz not null default now()
);

-- Locations (multi-boutique/dépôt)
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

-- Indexes
create index idx_profiles_business_id on profiles(business_id);
create index idx_profiles_login_id on profiles(login_id);
create index idx_audit_logs_business_action on audit_logs(business_id, action);
create index idx_products_business on products(business_id);
create index idx_products_barcode on products(barcode);
create index idx_customers_business on customers(business_id);
create index idx_suppliers_business on suppliers(business_id);
create index idx_sales_business on sales(business_id);
create index idx_invoices_business on invoices(business_id);
create index idx_stock_movements_product on stock_movements(product_id);
create index idx_accounting_entries_account on accounting_entries(account_id);
create index idx_credits_customer on credits(customer_id);
create index idx_notifications_read on notifications(read);
create index idx_employees_business on employees(business_id);
create index idx_attendance_employee on attendance(employee_id);
create index idx_payrolls_employee on payrolls(employee_id);
create index idx_cash_book_business on cash_book(business_id);
create index idx_leads_business on leads(business_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table businesses enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table customers enable row level security;
alter table suppliers enable row level security;
alter table stock_movements enable row level security;
alter table sales enable row level security;
alter table purchases enable row level security;
alter table invoices enable row level security;
alter table accounts enable row level security;
alter table accounting_entries enable row level security;
alter table credits enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;
alter table employees enable row level security;
alter table attendance enable row level security;
alter table payrolls enable row level security;
alter table cash_book enable row level security;
alter table leads enable row level security;
alter table business_cards enable row level security;
alter table locations enable row level security;
alter table product_stocks enable row level security;
alter table product_history enable row level security;
alter table supplier_invoices enable row level security;
alter table supplier_payments enable row level security;
alter table compensations enable row level security;
alter table transfers enable row level security;

-- Policies : chaque utilisateur ne voit que les données de son entreprise
create policy "business_access" on businesses
  for all using (id in (
    select business_id from profiles where auth_user_id = auth.uid()
  ));

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

-- Politique générique pour toutes les tables métier
do $$
declare
  tables text[] := array['categories','products','customers','suppliers','stock_movements','sales','purchases','invoices','accounts','accounting_entries','credits','audit_logs','notifications','employees','attendance','payrolls','cash_book','leads','business_cards','locations','product_stocks','product_history','supplier_invoices','supplier_payments','compensations','transfers'];
  t text;
begin
  foreach t in array tables
  loop
    execute format('create policy "tenant_access_%s" on %I for all using (business_id in (select business_id from profiles where auth_user_id = auth.uid()))', t, t);
  end loop;
end;
$$;

-- Auto-create business + profile + locations + accounts on signup (multi-tenant)
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

-- Fonction publique pour chercher un email par téléphone (sans auth)
create or replace function public_lookup_email_by_phone(phone text)
returns table(email text) as $$
begin
  return query select p.email from profiles p where p.phone = phone limit 1;
end;
$$ language plpgsql security definer;
