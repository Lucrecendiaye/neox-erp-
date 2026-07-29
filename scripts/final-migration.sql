-- ============================================================
-- NeoX ERP — Migration finale : colonnes manquantes
-- Exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================

-- Ajouter split_payments à sales si absent
alter table sales add column if not exists split_payments jsonb default '[]';

-- Ajouter des index manquants
create index if not exists idx_sales_customer on sales(customer_id);
create index if not exists idx_sales_status on sales(status);
create index if not exists idx_sales_payment_method on sales(payment_method);
create index if not exists idx_sales_invoice_number on sales(invoice_number);
create index if not exists idx_sales_created_at on sales(created_at desc);
create index if not exists idx_sales_location on sales(location_id);

-- Index pour locations
create index if not exists idx_locations_type on locations(type);

-- Index pour product_stocks
create index if not exists idx_product_stocks_product on product_stocks(product_id);
create index if not exists idx_product_stocks_location on product_stocks(location_id);
