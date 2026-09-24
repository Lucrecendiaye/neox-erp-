import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const URL = 'https://banknoizmiprfwhrcihc.supabase.co'
const env = readFileSync('.env.local', 'utf8')
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="?([^"\r\n]+)"?/)[1].trim()
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
  const biz = await pgc.query('select id from public.businesses limit 1')
  const businessId = biz.rows[0].id

  // create an admin of that business via direct SQL (like a registered user)
  const adminEmail = 'chief-' + Date.now() + '@neoxerp.app'
  await pgc.query(
    `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [businessId, 'Chief', adminEmail, 'chiefx', 'Chief123!', 'admin', '["*"]', '', 'active']
  )
  await pgc.end()

  const admin = createClient(URL, anonKey, { auth: { persistSession: false } })
  const { data: ad, error: ade } = await admin.auth.signInWithPassword({ email: adminEmail, password: 'Chief123!' })
  if (ade) { console.log('admin login failed'); process.exit(1) }
  console.log('admin logged in:', ad.user.id)

  // Now create a user exactly like the app does: RPC admin_create_user as the authenticated admin
  const newLogin = 'vendeur-' + Date.now().toString().slice(-6)
  const newEmail = newLogin + '@neoxerp.app'
  const newPwd = 'Vendeur123!'
  const { data: authUserId, error } = await admin.rpc('admin_create_user', {
    businessId,
    name: 'Vendeur Test',
    email: newEmail,
    loginId: newLogin,
    password: newPwd,
    role: 'staff',
    permissions: ['sales:*'],
    status: 'active',
    phone: '',
  })
  if (error) { console.log('RPC failed:', error.message); process.exit(1) }
  console.log('=== RPC CREATED authUserId:', authUserId)

  // 1) sign in with loginId as identifier
  const c = createClient(URL, anonKey, { auth: { persistSession: false } })
  const { data: lu, error: le } = await c.rpc('public_lookup_profile', { p_identifier: newLogin })
  console.log('lookup by loginId:', le ? 'RPC ERR '+le.message : JSON.stringify(lu))

  // 2) now actually sign in (the app's flow)
  const signInCs = await c.auth.signInWithPassword({ email: newEmail, password: newPwd })
  console.log('signInWithPassword(email):', signInCs.error ? 'FAIL '+JSON.stringify(signInCs.error) : 'OK '+signInCs.data.user.email)

  // 3) exact app flow: findUserByIdentifier uses public_lookup_profile then signInWithPassword with returned email
  const profile = await c.rpc('public_lookup_profile', { p_identifier: newLogin })
  const email = profile.data?.email
  console.log('identifier lookup email:', email)
  if (email) {
    const res = await c.auth.signInWithPassword({ email, password: newPwd })
    console.log('app-flow signIn:', res.error ? 'FAIL '+JSON.stringify(res.error) : 'OK '+res.data.user.email)
  } else {
    console.log('NO EMAIL from lookup -> app would fail')
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})