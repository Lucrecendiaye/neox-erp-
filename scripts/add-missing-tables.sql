-- Missing tables for phone<->computer sync (camelCase schema consistent with Dexie)

create table if not exists public.accounts (
  id text primary key,
  "businessId" text not null references public.businesses(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null default 'asset',
  balance numeric not null default 0,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.credit_payments (
  id text primary key,
  "businessId" text not null references public.businesses(id) on delete cascade,
  "creditId" text not null,
  "saleId" text,
  "customerId" text,
  amount numeric not null default 0,
  method text not null default 'cash',
  date timestamptz not null default now(),
  note text,
  "userId" text,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.bon_sorties (
  id text primary key,
  "businessId" text not null references public.businesses(id) on delete cascade,
  number text not null,
  status text not null default 'pending',
  "transferId" text,
  "fromLocationId" text,
  "fromLocationName" text,
  "fromLocationCode" text,
  "fromAddress" text,
  "toLocationId" text,
  "toLocationName" text,
  "toLocationCode" text,
  "toAddress" text,
  "destinateurId" text,
  "destinateurName" text,
  "destinateurRole" text,
  "destinataireId" text,
  "destinataireName" text,
  "destinataireRole" text,
  "createdBy" text,
  "createdByName" text,
  "createdAt" timestamptz not null default now(),
  "createdTime" text,
  "shippedAt" timestamptz,
  "shippedTime" text,
  "receivedAt" timestamptz,
  "receivedTime" text,
  "receivedBy" text,
  reference text,
  motif text,
  comments text,
  items jsonb not null default '[]',
  "totalArticles" integer not null default 0,
  "totalQuantity" integer not null default 0,
  "totalValue" numeric not null default 0,
  "validatedBy" text,
  "validatedByName" text,
  "validatedAt" timestamptz,
  "deviceInfo" text,
  signatures jsonb,
  "parentId" text
);

alter table public.accounts enable row level security;
alter table public.credit_payments enable row level security;
alter table public.bon_sorties enable row level security;

create policy "tenant_access_accounts" on public.accounts
  for all using ("businessId" in (select "businessId" from profiles where "auth_user_id" = auth.uid()));

create policy "tenant_access_credit_payments" on public.credit_payments
  for all using ("businessId" in (select "businessId" from profiles where "auth_user_id" = auth.uid()));

create policy "tenant_access_bon_sorties" on public.bon_sorties
  for all using ("businessId" in (select "businessId" from profiles where "auth_user_id" = auth.uid()));

grant all on public.accounts to authenticated, anon;
grant all on public.credit_payments to authenticated, anon;
grant all on public.bon_sorties to authenticated, anon;