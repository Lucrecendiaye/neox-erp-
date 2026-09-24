import pg from 'pg'
import { fileURLToPath } from 'url'

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
  const cols = await client.query(
    "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position"
  )
  console.log('PROFILES COLUMNS:')
  cols.rows.forEach((c) => console.log(' ', c.column_name, c.data_type, c.is_nullable, c.column_default || ''))

  const func = await client.query("SELECT prosrc FROM pg_proc WHERE proname='handle_new_user'")
  console.log('\nHANDLE_NEW_USER SOURCE:')
  console.log(func.rows[0]?.prosrc || 'NONE')

  const trg = await client.query(
    "SELECT tgname, tgrelid::regclass, pg_get_triggerdef(oid) AS def FROM pg_trigger WHERE NOT tgisinternal AND tgname='on_auth_user_created'"
  )
  console.log('\nTRIGGER:')
  trg.rows.forEach((t) => console.log(t.def))

  const bizCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='businesses' ORDER BY ordinal_position"
  )
  console.log('\nBUSINESSES COLUMNS:')
  console.log(bizCols.rows.map((r) => r.column_name).join(', '))

  const authCols = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='auth' AND table_name='users' ORDER BY ordinal_position"
  )
  console.log('\nAUTH.USERS COLUMNS:')
  console.log(authCols.rows.map((r) => r.column_name).join(', '))

  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})