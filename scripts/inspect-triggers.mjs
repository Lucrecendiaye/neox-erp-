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

  const trg = await pgc.query(`select tgname, pg_get_triggerdef(t.oid) as def
    from pg_trigger t where not t.tgisinternal and t.tgrelid = 'auth.users'::regclass`)
  console.log('TRIGGERS on auth.users:')
  trg.rows.forEach((r) => console.log(' ', r.def))

  const idx = await pgc.query(`select indexname, indexdef from pg_indexes where schemaname='auth' and tablename='users'`)
  console.log('\nINDEXES on auth.users:')
  idx.rows.forEach((r) => console.log(' ', r.indexname))

  const fk = await pgc.query(`select conname, pg_get_constraintdef(c.oid) as def from pg_constraint c
    where c.conrelid='auth.users'::regclass and contype='f'`)
  console.log('\nFKs on auth.users:')
  fk.rows.forEach((r) => console.log(' ', r.conname, r.def))

  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})