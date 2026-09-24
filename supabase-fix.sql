-- =====================================================================
-- Neox ERP - Correction de la synchronisation cloud (à exécuter une fois)
-- Dans Supabase → SQL Editor, collez TOUT le script puis "Run".
-- Exécution IDEMPOTENTE (peut être relancée sans danger).
-- =====================================================================

-- =====================================================================
-- PARTIE 1/3 - DIAGNOSTIC (informatif, ne modifie rien)
-- Vous pouvez copier ce tableau dans votre échange pour analyse
-- si quelque chose ne converge toujours pas.
-- =====================================================================

select
  c.relname as table,
  c.relrowsecurity as rls_enabled,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
from pg_class c
left join pg_policies p
  on p.schemaname = 'public' and p.tablename = c.relname
where c.relkind = 'r'
  and c.relnamespace = 'public'::regnamespace
  and c.relname in (
    'products','categories','customers','suppliers','sales','purchases',
    'invoices','credits','notifications','employees','attendance','payrolls',
    'cash_book','leads','locations','product_stocks','product_history',
    'supplier_invoices','supplier_payments','compensations','transfers',
    'stock_movements','accounts','credit_payments','bon_sorties',
    'cash_operations','cash_categories','deliveries','business_cards',
    'settings','businesses','profiles'
  )
order by c.relname, p.policyname nulls last;

-- =====================================================================
-- PARTIE 2/3 - SCHÉMA : ajout des colonnes manquantes qui faisaient échouer
-- silencieusement la synchronisation des ventes et de la caisse.
-- =====================================================================

alter table public.sales
  add column if not exists "paymentStatus" text;

alter table public.sales
  add column if not exists "supplierId" text;

alter table public.cash_book
  add column if not exists "partyId" text;

alter table public.cash_book
  add column if not exists "linkedId" text;

-- Realtime : autoriser la diffusion des lignes modifiées (UPDATE)
alter table public.sales replica identity full;
alter table public.cash_book replica identity full;
alter table public.deliveries replica identity full;
alter table public.product_stocks replica identity full;
alter table public.product_history replica identity full;
alter table public.profiles replica identity full;
alter table public.products replica identity full;
alter table public.customers replica identity full;

-- =====================================================================
-- PARTIE 3/3 - POLITIQUES RLS : permettre aux utilisateurs authentifiés
-- de lire/écrire les lignes de LEUR entreprise (businessId m'apparié à
-- l'utilisateur via profiles.auth_user_id = auth.uid()).
-- Idempotent : aucune erreur si une politique existe déjà.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'products','categories','customers','suppliers','sales','purchases',
    'invoices','credits','notifications','employees','attendance','payrolls',
    'cash_book','leads','locations','product_stocks','product_history',
    'supplier_invoices','supplier_payments','compensations','transfers',
    'stock_movements','accounts','credit_payments','bon_sorties',
    'cash_operations','cash_categories','deliveries','business_cards','settings'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists "neox_auth_all_%I" on public.%I;', t, t
    );
    execute format(
      'create policy "neox_auth_all_%I" on public.%I
         for all to authenticated
         using (
           "businessId" = (
             select p."businessId" from public.profiles p
             where p."auth_user_id" = auth.uid() limit 1
           )
         )
         with check (
           "businessId" = (
             select p."businessId" from public.profiles p
             where p."auth_user_id" = auth.uid() limit 1
           )
         );', t, t
    );
  end loop;
end $$;