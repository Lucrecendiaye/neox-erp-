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
drop table if exists public.accounting_entries cascade;
drop table if exists public.accounts cascade;
`

async function run() {
  await client.connect()
  console.log('Connected')
  await client.query(SQL)
  console.log('Tables dropped: accounting_entries, accounts')
  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
