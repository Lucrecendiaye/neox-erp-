-- ============================================================
-- NEOX ERP – Migration complète : camelCase + text IDs
-- À exécuter UNE FOIS dans l'éditeur SQL du Supabase Dashboard
-- ============================================================

-- Supprimer les anciennes tables (snake_case)
DROP TABLE IF EXISTS public.compensations CASCADE;
DROP TABLE IF EXISTS public.transfers CASCADE;
DROP TABLE IF EXISTS public.supplier_payments CASCADE;
DROP TABLE IF EXISTS public.supplier_invoices CASCADE;
DROP TABLE IF EXISTS public.product_history CASCADE;
DROP TABLE IF EXISTS public.product_stocks CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.accounting_entries CASCADE;
DROP TABLE IF EXISTS public.accounts CASCADE;
DROP TABLE IF EXISTS public.cash_book CASCADE;
DROP TABLE IF EXISTS public.credits CASCADE;
DROP TABLE IF EXISTS public.business_cards CASCADE;
DROP TABLE IF EXISTS public.leads CASCADE;
DROP TABLE IF EXISTS public.payrolls CASCADE;
DROP TABLE IF EXISTS public.attendance CASCADE;
DROP TABLE IF EXISTS public.employees CASCADE;
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.stock_movements CASCADE;
DROP TABLE IF EXISTS public.purchases CASCADE;
DROP TABLE IF EXISTS public.sales CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.locations CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.suppliers CASCADE;
DROP TABLE IF EXISTS public.businesses CASCADE;

-- Re-créer toutes les tables avec camelCase et text IDs
CREATE TABLE public.businesses (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  currency text DEFAULT 'XOF',
  locale text DEFAULT 'fr-FR',
  timezone text DEFAULT 'UTC',
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.categories (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  description text,
  parentId text,
  createdAt timestamptz DEFAULT now()
);

CREATE TABLE public.products (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  description text,
  photos jsonb DEFAULT '[]',
  barcode text,
  qrCode text,
  reference text,
  categoryId text,
  brand text,
  unit text NOT NULL DEFAULT 'piece',
  purchasePrice numeric(12,0) DEFAULT 0,
  sellingPrice numeric(12,0) DEFAULT 0,
  wholesalePrice numeric(12,0) DEFAULT 0,
  priceDozen numeric(12,0),
  pricePack numeric(12,0),
  packSize numeric(12,0),
  margin numeric(5,1) DEFAULT 0,
  taxRate numeric(5,1) DEFAULT 0,
  stockAlert numeric(12,0) DEFAULT 0,
  stockMin numeric(12,0) DEFAULT 0,
  stockMax numeric(12,0) DEFAULT 999999,
  location text,
  supplierId text,
  status text DEFAULT 'active',
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.customers (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  creditLimit numeric(12,0) DEFAULT 0,
  currentBalance numeric(12,0) DEFAULT 0,
  notes text,
  photo text,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.suppliers (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.locations (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'shop',
  address text,
  phone text,
  isActive boolean DEFAULT true,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.employees (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  position text,
  department text,
  salary numeric(12,0) DEFAULT 0,
  salaryType text DEFAULT 'monthly',
  paymentMethod text DEFAULT 'bank',
  bankAccount text,
  address text,
  photo text,
  documents jsonb DEFAULT '[]',
  hireDate timestamptz,
  status text DEFAULT 'active',
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.leads (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  company text,
  source text,
  status text DEFAULT 'new',
  notes text,
  assignedTo text,
  expectedValue numeric(12,0) DEFAULT 0,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.settings (
  id text PRIMARY KEY,
  businessId text,
  shopName text,
  currency text DEFAULT 'XOF',
  locale text DEFAULT 'fr-FR',
  timezone text DEFAULT 'UTC',
  invoicePrefix text DEFAULT 'INV-',
  invoiceNextNumber integer DEFAULT 1,
  lowStockAlert boolean DEFAULT true,
  enableCredit boolean DEFAULT true,
  enableSplitPayment boolean DEFAULT true,
  enableBarcodeScan boolean DEFAULT true,
  enableNotifications boolean DEFAULT true,
  posTheme text DEFAULT 'default',
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.notifications (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  type text NOT NULL,
  title text,
  message text,
  read boolean DEFAULT false,
  link text,
  createdAt timestamptz DEFAULT now()
);

CREATE TABLE public.sales (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  locationId text NOT NULL,
  invoiceNumber text NOT NULL,
  customerId text,
  customerName text,
  items jsonb DEFAULT '[]'::jsonb,
  subtotal numeric(12,0) DEFAULT 0,
  discountTotal numeric(12,0) DEFAULT 0,
  taxTotal numeric(12,0) DEFAULT 0,
  total numeric(12,0) DEFAULT 0,
  paid numeric(12,0) DEFAULT 0,
  change numeric(12,0) DEFAULT 0,
  paymentMethod text DEFAULT 'cash',
  splitPayments jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending',
  note text,
  createdAt timestamptz DEFAULT now(),
  userId text NOT NULL
);

CREATE TABLE public.purchases (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  locationId text NOT NULL,
  supplierId text,
  supplierName text,
  items jsonb DEFAULT '[]'::jsonb,
  subtotal numeric(12,0) DEFAULT 0,
  discountTotal numeric(12,0) DEFAULT 0,
  taxTotal numeric(12,0) DEFAULT 0,
  total numeric(12,0) DEFAULT 0,
  paid numeric(12,0) DEFAULT 0,
  status text DEFAULT 'completed',
  note text,
  createdAt timestamptz DEFAULT now(),
  userId text NOT NULL
);

CREATE TABLE public.invoices (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  type text NOT NULL,
  number text NOT NULL,
  partyId text,
  partyName text,
  items jsonb DEFAULT '[]'::jsonb,
  subtotal numeric(12,0) DEFAULT 0,
  taxTotal numeric(12,0) DEFAULT 0,
  total numeric(12,0) DEFAULT 0,
  paid numeric(12,0) DEFAULT 0,
  balance numeric(12,0) DEFAULT 0,
  dueDate timestamptz,
  status text DEFAULT 'draft',
  notes text,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.stock_movements (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  locationId text NOT NULL,
  productId text NOT NULL,
  type text NOT NULL,
  quantity numeric(12,0) NOT NULL,
  unitPrice numeric(12,0),
  reference text,
  note text,
  createdAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.product_stocks (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  productId text NOT NULL,
  locationId text NOT NULL,
  quantity numeric(12,0) DEFAULT 0,
  stockAlert numeric(12,0) DEFAULT 0,
  stockMin numeric(12,0) DEFAULT 0,
  stockMax numeric(12,0) DEFAULT 999999,
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.product_history (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  productId text NOT NULL,
  locationId text NOT NULL,
  type text NOT NULL,
  quantity numeric(12,0) NOT NULL,
  unitPrice numeric(12,0),
  reference text,
  note text,
  createdAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.accounts (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'expense',
  code text,
  description text,
  balance numeric(12,0) DEFAULT 0,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.accounting_entries (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  date timestamptz DEFAULT now(),
  type text NOT NULL,
  accountId text,
  accountName text,
  amount numeric(12,0) NOT NULL,
  direction text NOT NULL,
  reference text,
  description text,
  createdAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.cash_book (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  date timestamptz DEFAULT now(),
  type text NOT NULL,
  category text,
  amount numeric(12,0) NOT NULL,
  description text,
  partyName text,
  paymentMethod text,
  reference text,
  createdAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.credits (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  customerId text,
  customerName text,
  amount numeric(12,0) NOT NULL,
  paid numeric(12,0) DEFAULT 0,
  balance numeric(12,0) DEFAULT 0,
  dueDate timestamptz,
  status text DEFAULT 'active',
  reminderSent jsonb DEFAULT '[]'::jsonb,
  createdAt timestamptz DEFAULT now()
);

CREATE TABLE public.attendance (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  employeeId text,
  employeeName text,
  date timestamptz DEFAULT now(),
  checkIn timestamptz,
  checkOut timestamptz,
  status text DEFAULT 'present',
  notes text,
  createdAt timestamptz DEFAULT now()
);

CREATE TABLE public.payrolls (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  employeeId text,
  employeeName text,
  period text,
  baseSalary numeric(12,0) DEFAULT 0,
  bonuses numeric(12,0) DEFAULT 0,
  deductions numeric(12,0) DEFAULT 0,
  netSalary numeric(12,0) DEFAULT 0,
  paymentDate timestamptz,
  paymentMethod text,
  notes text,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.profiles (
  id text PRIMARY KEY,
  businessId text,
  email text,
  name text,
  role text DEFAULT 'staff',
  phone text,
  avatar text,
  permissions jsonb DEFAULT '{}'::jsonb,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  userId text,
  action text NOT NULL,
  entity text NOT NULL,
  entityId text,
  details text,
  createdAt timestamptz DEFAULT now()
);

CREATE TABLE public.supplier_invoices (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  supplierId text,
  supplierName text,
  number text,
  items jsonb DEFAULT '[]'::jsonb,
  subtotal numeric(12,0) DEFAULT 0,
  taxTotal numeric(12,0) DEFAULT 0,
  total numeric(12,0) DEFAULT 0,
  paid numeric(12,0) DEFAULT 0,
  balance numeric(12,0) DEFAULT 0,
  dueDate timestamptz,
  status text DEFAULT 'pending',
  notes text,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.supplier_payments (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  supplierId text,
  supplierName text,
  invoiceId text,
  invoiceNumber text,
  amount numeric(12,0) NOT NULL,
  paymentMethod text DEFAULT 'cash',
  reference text,
  notes text,
  createdAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.compensations (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  employeeId text,
  employeeName text,
  type text NOT NULL,
  amount numeric(12,0) NOT NULL,
  reason text,
  date timestamptz DEFAULT now(),
  createdAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.transfers (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  fromLocationId text NOT NULL,
  toLocationId text NOT NULL,
  items jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'pending',
  createdAt timestamptz DEFAULT now(),
  userId text
);

CREATE TABLE public.business_cards (
  id text PRIMARY KEY,
  businessId text NOT NULL,
  name text NOT NULL,
  company text,
  phone text,
  email text,
  address text,
  notes text,
  createdAt timestamptz DEFAULT now(),
  updatedAt timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_products_business ON public.products(businessId);
CREATE INDEX idx_products_category ON public.products(categoryId);
CREATE INDEX idx_sales_business ON public.sales(businessId);
CREATE INDEX idx_sales_created ON public.sales(createdAt DESC);
CREATE INDEX idx_sales_customer ON public.sales(customerId);
CREATE INDEX idx_purchases_business ON public.purchases(businessId);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(productId);
CREATE INDEX idx_stock_movements_location ON public.stock_movements(locationId);
CREATE INDEX idx_product_stocks_product ON public.product_stocks(productId);
CREATE INDEX idx_product_stocks_location ON public.product_stocks(locationId);

-- RLS : permettre toutes les opérations avec la clé anon
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compensations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_cards ENABLE ROW LEVEL SECURITY;

-- Politique : permettre tout pour tous les utilisateurs authentifiés et anonymes
CREATE POLICY "full_access" ON public.businesses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.stock_movements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.product_stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.product_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.accounting_entries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.cash_book FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.credits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.payrolls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.supplier_invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.supplier_payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.compensations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "full_access" ON public.business_cards FOR ALL USING (true) WITH CHECK (true);

-- Activer les realtime subscriptions pour tous les utilisateurs
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_stocks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credits;
