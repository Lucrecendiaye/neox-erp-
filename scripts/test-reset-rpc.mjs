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
  const adminEmail = 'rpcr-' + Date.now() + '@neoxerp.app'
  await pgc.query(
    `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [businessId, 'Reset Tester', adminEmail, 'resettester', 'Old123!', 'staff', '[]', '', 'active']
  )
  const memberEmail = 'resettarget-' + Date.now() + '@neoxerp.app'
  await pgc.query(
    `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [businessId, 'Reset Target', memberEmail, 'resettarget', 'Target123!', 'staff', '[]', '', 'active']
  )
  await pgc.end()

  const c = createClient(URL, anonKey, { auth: { persistSession: false } })
  const { data: s } = await c.auth.signInWithPassword({ email: adminEmail, password: 'Old123!' })

  // reset member password via RPC
  const { data: ok, error } = await c.rpc('admin_reset_password', { p_email: memberEmail, p_password: 'NewPass456!' })
  console.log('reset:', error ? 'ERR ' + error.message : 'ok=' + ok)

  // try signIn with new password
  const { data: s2, error: le } = await c.auth.signInWithPassword({ email: memberEmail, password: 'NewPass456!' })
  console.log('signIn after reset:', le ? 'ERR ' + JSON.stringify(le) : 'OK ' + s2.user.email)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})