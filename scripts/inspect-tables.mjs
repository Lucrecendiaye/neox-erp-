import pg from 'pg'

const pgc = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await pgc.connect()
  const r = await pgc.query(
    `select tablename from pg_tables where schemaname='public' and tablename not like '\\_%' order by tablename`
  )
  console.log('PUBLIC TABLES:', r.rows.map((x) => x.tablename).join(', '))
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})