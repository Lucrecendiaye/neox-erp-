import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { readFileSync } from 'fs'

const URL = 'https://banknoizmiprfwhrcihc.supabase.co'

const pgc = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  ssl: { rejectUnauthorized: false },
})

const env = readFileSync('.env.local', 'utf8')
const anonMatch = env.match(/VITE_SUPABASE_ANON_KEY="?([^"\r\n]+)"?/)
const anonKey = anonMatch ? anonMatch[1].trim() : null

async function run() {
  await pgc.connect()
  const biz = await pgc.query('select id from public.businesses limit 1')
  const businessId = biz.rows[0].id

  const email = 'login-test-' + Date.now() + '@neoxerp.app'
  const loginId = 'logintester' + Date.now().toString().slice(-6)
  const password = 'SupSec123!'
  const pwd = await pgc.query(
    `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as id`,
    [businessId, 'Login Tester', email, loginId, password, 'staff', '[]', '775111222', 'active']
  )
  console.log('created auth id:', pwd.rows[0].id)

  await pgc.end()

  const supabase = createClient(URL, anonKey, { auth: { persistSession: false } })

  // RPC as anon should work
  const { data: lookupProfile, error: rpcErr } = await supabase.rpc('public_lookup_profile', {
    p_identifier: loginId,
  })
  console.log('lookup_profile(loginId):', rpcErr ? 'ERR ' + rpcErr.message : JSON.stringify({ email: lookupProfile?.email, businessId: lookupProfile?.businessId }))

  // Real sign in
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.log('SIGNIN FAILED:', error.message)
    process.exit(1)
  }
  console.log('SIGNIN OK:', data.user.email)
  console.log('ALL GOOD: admin-created user can log in')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})