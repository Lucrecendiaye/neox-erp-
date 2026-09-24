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
  const r = await client.query(
    "SELECT prosrc FROM pg_proc WHERE proname IN ('public_lookup_profile','public_lookup_email_by_phone')"
  )
  r.rows.forEach((x) => {
    console.log('=====')
    console.log(x.prosrc)
  })
  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})