import pg from 'pg'
const c = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432, user: 'postgres', database: 'postgres',
  password: 'Lucrecendi@ye1974', ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query("select column_name from information_schema.columns where table_schema='public' and table_name='profiles'")
console.log('profiles columns:', r.rows.map(x => x.column_name).join(', '))
const s = await c.query("select column_name from information_schema.columns where table_schema='public' and table_name='sales'")
console.log('sales columns:', s.rows.map(x => x.column_name).join(', '))
const t = await c.query("select typname, enumlabel from pg_type t join pg_enum e on t.oid=e.enumtypid where t.typname='payment_method' order by e.enumsortorder")
console.log('payment_method enum:', t.rows.map(x => x.enumlabel).join(', '))
const b = await c.query("select column_name from information_schema.columns where table_schema='public' and table_name='businesses'")
console.log('businesses columns:', b.rows.map(x => x.column_name).join(', '))
await c.end()
process.exit(0)
