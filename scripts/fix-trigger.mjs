import pg from 'pg'
const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432,
  user: 'postgres', password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false },
})
await client.connect()

await client.query(`
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
  declare
    biz_id uuid;
  begin
    biz_id := gen_random_uuid();
    insert into public.businesses (id, name, currency, phone, email, "createdAt")
    values (
      biz_id,
      coalesce(new.raw_user_meta_data->>'business_name', new.raw_user_meta_data->>'name' || '''s Shop'),
      'XOF',
      new.raw_user_meta_data->>'phone',
      new.email,
      now()
    );
    insert into public.profiles (id, auth_user_id, "businessId", name, email, phone, role, "is_active", "createdAt", "updatedAt")
    values (gen_random_uuid(), new.id, biz_id, coalesce(new.raw_user_meta_data->>'name', 'Utilisateur'), new.email, new.raw_user_meta_data->>'phone', 'admin', true, now(), now());

    insert into public.locations (id, "businessId", name, type, address, phone, "isActive", "createdAt", "updatedAt")
    values
      (gen_random_uuid(), biz_id, 'Boutique Principale', 'shop', '', new.raw_user_meta_data->>'phone', true, now(), now()),
      (gen_random_uuid(), biz_id, 'Dépôt Principal', 'warehouse', '', '', true, now(), now());

    return new;
  end;
  $function$
`)

console.log('Trigger function updated with locations.id')
await client.end()
