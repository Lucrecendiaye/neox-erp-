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
    `select instance_id, count(*) from auth.users group by instance_id`
  )
  console.log('instance_ids:', r.rows)
  const dist = await pgc.query(`select id, name, status from auth.instances order by created_at`)
  console.log('auth.instances:', dist.rows)
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})