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

const FIX_SQL = `
-- Drop existing full_access policies
do $$ declare
  rec record;
begin
  for rec in select schemaname, tablename, policyname 
             from pg_policies where schemaname = 'public' and policyname = 'full_access'
  loop
    execute format('drop policy if exists %I on %I.%I', rec.policyname, rec.schemaname, rec.tablename);
  end loop;
end $$;

-- Master tables
create policy "tenant_access_businesses" on businesses
  for all using (true);

create policy "tenant_access_profiles" on profiles
  for all using (auth_user_id = auth.uid());

create policy "tenant_access_settings" on settings
  for all using (exists (select 1 from profiles where auth_user_id = auth.uid()));

-- Business-scoped tables
do $$ declare
  tables text[] := array['categories','products','customers','suppliers','stock_movements','sales','purchases','invoices','accounts','accounting_entries','credits','audit_logs','notifications','employees','attendance','payrolls','cash_book','leads','business_cards','locations','product_stocks','product_history','supplier_invoices','supplier_payments','compensations','transfers'];
  t text;
begin
  foreach t in array tables
  loop
    execute format('create policy "tenant_access_%s" on %I for all using ("businessId" in (select "businessId" from profiles where auth_user_id = auth.uid()))', t, t);
  end loop;
end $$;

-- Auto-provisioning function + trigger
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

  insert into public.accounts ("businessId", code, name, type, description, balance, "createdAt")
  values
    (biz_id, '101', 'Caisse', 'asset', '', 0, now()),
    (biz_id, '102', 'Banque', 'asset', '', 0, now()),
    (biz_id, '103', 'Clients', 'asset', '', 0, now()),
    (biz_id, '104', 'Stock', 'asset', '', 0, now()),
    (biz_id, '201', 'Fournisseurs', 'liability', '', 0, now()),
    (biz_id, '301', 'Capital', 'equity', '', 0, now()),
    (biz_id, '401', 'Ventes', 'revenue', '', 0, now()),
    (biz_id, '501', 'Dépenses', 'expense', '', 0, now());

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Public function for login lookup
create or replace function public_lookup_email_by_phone(phone text)
returns table(email text) as $$
begin
  return query select p.email from profiles p where p.phone = phone limit 1;
end;
$$ language plpgsql security definer;
`

async function run() {
  await client.connect()
  console.log('Connected\n')

  await client.query(FIX_SQL)
  console.log('Fix SQL executed successfully!\n')

  // Verify policies
  const { rows: policies } = await client.query(`
    select tablename, policyname from pg_policies
    where schemaname = 'public'
    order by tablename
  `)
  console.log('Updated policies:')
  const grouped = {}
  policies.forEach(p => {
    if (!grouped[p.tablename]) grouped[p.tablename] = []
    grouped[p.tablename].push(p.policyname)
  })
  for (const [tbl, pols] of Object.entries(grouped)) {
    console.log(`  ${tbl}: ${pols.join(', ')}`)
  }

  // Verify trigger
  const { rows: triggers } = await client.query(`
    select trigger_name from information_schema.triggers
    where event_object_table = 'users' and trigger_schema = 'auth'
  `)
  console.log(`\nAuth trigger: ${triggers.length ? triggers[0].trigger_name : 'MISSING!'}`)

  // Verify functions
  const { rows: funcs } = await client.query(`
    select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('handle_new_user', 'public_lookup_email_by_phone')
  `)
  console.log(`Functions: ${funcs.map(f => f.proname).join(', ') || 'NONE'}`)

  await client.end()
}

run().catch(e => { console.error('Error:', e.message); process.exit(1) })
