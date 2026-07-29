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
  console.log('Connected\n')

  // Check trigger
  const { rows: triggers } = await client.query(`
    SELECT trigger_name FROM information_schema.triggers 
    WHERE event_object_table = 'users' AND trigger_schema = 'auth'
  `)
  console.log('Auth triggers:', triggers.map(t => t.trigger_name).join(', ') || 'NONE')

  // Check RLS
  const { rows: rls } = await client.query(`
    SELECT relname, relrowsecurity FROM pg_class 
    WHERE relrowsecurity = true AND relnamespace = 'public'::regnamespace
    ORDER BY relname
  `)
  console.log('RLS enabled tables:', rls.length ? rls.map(r => r.relname).join(', ') : 'NONE')

  // Check policies
  const { rows: policies } = await client.query(`
    SELECT schemaname, tablename, policyname FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename
  `)
  console.log('Policies:', policies.length ? policies.map(p => `${p.tablename}:${p.policyname}`).join(', ') : 'NONE')

  // Check functions
  const { rows: funcs } = await client.query(`
    SELECT routine_name FROM information_schema.routines 
    WHERE specific_schema = 'public' AND routine_type = 'FUNCTION'
    ORDER BY routine_name
  `)
  console.log('Functions:', funcs.map(f => f.routine_name).join(', ') || 'NONE')

  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
