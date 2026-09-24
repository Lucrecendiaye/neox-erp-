import pg from 'pg'
const c = new pg.Client({ host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432, user: 'postgres', database: 'postgres', password: 'Lucrecendi@ye1974', ssl: { rejectUnauthorized: false } })
try {
  await c.connect()
  const cols = await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name in ('sales','invoices') order by table_name, ordinal_position`)
  console.log(JSON.stringify(cols.rows.map(r => r.column_name)))
} catch (e) { console.log('ERR:', e.message) } finally { await c.end() }
