-- Delivery fields for the camelCase Supabase schema used by the application.
alter table public.sales add column if not exists "saleChannel" text not null default 'shop';
alter table public.sales add column if not exists "deliveryStatus" text not null default 'delivered';
alter table public.sales add column if not exists "deliveryAddress" text;
alter table public.sales add column if not exists "deliveredAt" timestamptz;

update public.sales
set "saleChannel" = coalesce("saleChannel", 'shop'),
    "deliveryStatus" = coalesce("deliveryStatus", 'delivered')
where "saleChannel" is null or "deliveryStatus" is null;
