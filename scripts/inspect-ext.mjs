import pg from 'pg'

const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await client.connect()
  const ext = await client.query("select extname, extnamespace::regnamespace from pg_extension where extname='pgcrypto'")
  console.log('pgcrypto ext:', ext.rows)
  const fn = await client.query("select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('crypt','gen_salt','digest') group by 1,2")
  console.log('funcs:', fn.rows)
  const sp = await client.query("select * from pg_extension")
  console.log('all extensions:', sp.rows.map(r => r.extname).join(', '))
  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})