import pg from 'pg'
const c = new pg.Client({ host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432, user: 'postgres', database: 'postgres', password: 'Lucrecendi@ye1974', ssl: { rejectUnauthorized: false } })
try {
  await c.connect()
  await c.query('create table if not exists public.push_subscriptions (id text primary key, user_id text, endpoint text, keys jsonb, created_at timestamptz default now())')
  await c.query('alter table public.push_subscriptions enable row level security')
  await c.query('drop policy if exists push_subscriptions_all_own on public.push_subscriptions')
  await c.query('create policy push_subscriptions_all_own on public.push_subscriptions for all to authenticated using (true) with check (true)')
  await c.query('drop policy if exists push_subscriptions_anon on public.push_subscriptions')
  await c.query('create policy push_subscriptions_anon on public.push_subscriptions for all to anon using (true) with check (true)')
  console.log('push_subscriptions OK')
} catch (e) {
  console.log('ERR:', e.message)
} finally {
  await c.end()
}
