-- ============================================================
-- NeoX ERP — Compte client : synchronisation
-- Ajoute la table customer_entries (grand livre du compte client)
-- + la colonne advance_balance sur customers.
--
-- À exécuter dans Supabase Dashboard > SQL Editor (une seule fois).
-- Idempotent : peut être relancé sans risque.
--
-- ⚠️ Le schéma Supabase de ce projet utilise les colonnes en
--    camelCase (ex: "businessId"), pas en snake_case.
-- ============================================================

alter table customers add column if not exists "advanceBalance" numeric not null default 0;

create table if not exists customer_entries (
  id uuid primary key default gen_random_uuid(),
  "businessId" text not null,
  "customerId" text not null,
  "customerName" text,
  type text not null,
  amount numeric not null default 0,
  date timestamptz not null default now(),
  reference text,
  note text,
  "linkedId" text,
  category text,
  "userId" text,
  "createdAt" timestamptz not null default now()
);

create index if not exists idx_customer_entries_business on customer_entries("businessId");
create index if not exists idx_customer_entries_customer on customer_entries("customerId");
create index if not exists idx_customer_entries_date on customer_entries(date);

alter table customer_entries enable row level security;
drop policy if exists "tenant_access_customer_entries" on customer_entries;
create policy "tenant_access_customer_entries" on customer_entries for all using (
  "businessId" in (select "businessId" from profiles where auth_user_id = auth.uid())
);

-- Temps réel multi-appareils pour le compte client
do $$
begin
  begin
    alter publication supabase_realtime add table customer_entries;
  exception when others then null;
  end;
end $$;

-- ============================================================
-- FIN
-- ============================================================
