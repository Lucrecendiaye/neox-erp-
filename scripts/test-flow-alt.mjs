import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
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

  // Create user via the normal signUp path (GoTrue creates correctly)
  const supabase = createClient(URL, anonKey, { auth: { persistSession: false } })
  const email = 'flow-' + Date.now() + '@neoxerp.app'
  const pw = 'FlowPass123!'
  const { data: su, error: suErr } = await supabase.auth.signUp({ email, password: pw, options: { data: { name: 'Flow Tester' } } })
  if (suErr) throw new Error('signUp: ' + suErr.message)
  const authId = su.user.id
  console.log('signUp created:', authId)

  // Now update raw_user_meta_data (loginId) + move profile to target business
  const biz = await pgc.query(`select id from public.businesses limit 1`)
  const businessId = biz.rows[0].id

  await pgc.query(
    `update auth.users set raw_user_meta_data = jsonb_set(raw_user_meta_data, '{loginId}', $1::jsonb) where id = $2`,
    [JSON.stringify('flowlogin123'), authId]
  )
  await pgc.query(
    `update public.profiles set "businessId" = $1, role = 'staff', permissions = '["inventory:read"]'::jsonb, "is_active" = true where auth_user_id = $2`,
    [businessId, authId]
  )
  console.log('moved profile to existing business + set loginId')

  // lookup by loginId
  const { data: lp, error: lpErr } = await supabase.rpc('public_lookup_profile', { p_identifier: 'flowlogin123' })
  console.log('lookup by loginId:', lpErr ? 'ERR ' + lpErr.message : JSON.stringify({ email: lp?.email, businessId: lp?.businessId }))

  // signIn
  const { data: login, error: le } = await supabase.auth.signInWithPassword({ email, password: pw })
  if (le) {
    console.log('SIGNIN FAILED:', JSON.stringify(le))
    const raw = await fetch(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    })
    console.log('RAW status:', raw.status, await raw.text())
    process.exit(1)
  }
  console.log('SIGNIN OK (flow via signUp works). auth_user_id:', login.user.id)
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})