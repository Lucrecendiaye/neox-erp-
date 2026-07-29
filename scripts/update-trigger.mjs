import pg from 'pg'

const PASSWORD = 'Lucrecendi@ye1974'
const REF = 'banknoizmiprfwhrcihc'

const client = new pg.Client({
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: PASSWORD,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

const SQL = `
-- Drop old function
drop function if exists handle_new_user() cascade;

-- Recreate without account creation
create or replace function handle_new_user()
returns trigger as $$
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
  insert into public.profiles (auth_user_id, "businessId", name, email, phone, role)
  values (new.id, biz_id, coalesce(new.raw_user_meta_data->>'name', 'Utilisateur'), new.email, new.raw_user_meta_data->>'phone', 'admin');

  insert into public.locations ("businessId", name, type, address, phone, "isActive", "createdAt", "updatedAt")
  values
    (biz_id, 'Boutique Principale', 'shop', '', new.raw_user_meta_data->>'phone', true, now(), now()),
    (biz_id, 'Dépôt Principal', 'warehouse', '', '', true, now(), now());

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
`

async function run() {
  await client.connect()
  console.log('Connected')
  await client.query(SQL)
  console.log('Trigger updated - accounts no longer created on signup')
  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
