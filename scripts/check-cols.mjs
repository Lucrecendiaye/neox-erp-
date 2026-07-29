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

async function run() {
  await client.connect()
  
  for (const tbl of ['profiles', 'businesses', 'locations', 'accounts']) {
    const { rows } = await client.query(
      `select column_name, data_type from information_schema.columns 
       where table_schema = 'public' and table_name = $1
       order by ordinal_position`,
      [tbl]
    )
    console.log(`${tbl}: ${rows.map(r => r.column_name).join(', ')}`)
  }

  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
