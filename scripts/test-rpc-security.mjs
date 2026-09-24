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

  // create an admin member of this business
  const adminEmail = 'rpc-admin-' + Date.now() + '@neoxerp.app'
  const adminR = await pgc.query(
    `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as id`,
    [businessId, 'RPC Admin', adminEmail, 'rpcadmin', 'Admin123!', 'admin', '["*"]', '775333444', 'active']
  )
  console.log('admin created (direct sql bypasses check):', adminR.rows[0].id)
  await pgc.end()

  const member = createClient(URL, anonKey, { auth: { persistSession: false } })
  const { data: s, error: le } = await member.auth.signInWithPassword({ email: adminEmail, password: 'Admin123!' })
  if (le) { console.log('login failed:', JSON.stringify(le)); process.exit(1) }
  console.log('admin logged in:', s.user.id)

  // try RPC as that authenticated admin (should succeed)
  const { data: res, error } = await member.rpc('admin_create_user', {
    businessId,
    name: 'Via RPC',
    email: 'via-rpc-' + Date.now() + '@neoxerp.app',
    loginId: 'viarpc',
    password: 'Via123!',
    role: 'staff',
    permissions: [],
    status: 'active',
    phone: '',
  })
  console.log('RPC as admin:', error ? 'ERR ' + error.message : 'OK auth_id=' + res)

  // try RPC with a DIFFERENT businessId (should be denied)
  const fakeBiz = '11111111-1111-1111-1111-111111111111'
  const { data: res2, error: err2 } = await member.rpc('admin_create_user', {
    businessId: fakeBiz,
    name: 'Intruder',
    email: 'intruder-' + Date.now() + '@neoxerp.app',
    loginId: 'intruderr',
    password: 'X',
    role: 'staff',
    permissions: [],
    status: 'active',
    phone: '',
  })
  console.log('RPC with foreign business:', err2 ? 'DENIED: ' + err2.message : 'SECURITY HOLE, created ' + res2)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})