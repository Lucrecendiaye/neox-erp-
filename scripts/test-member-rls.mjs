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

  const email = 'member-' + Date.now() + '@neoxerp.app'
  const loginId = 'member' + Date.now().toString().slice(-6)
  const password = 'Member123!'
  const r = await pgc.query(
    `select public.admin_create_user($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as id`,
    [businessId, 'Member Tester', email, loginId, password, 'staff', '[]', '775222333', 'active']
  )
  console.log('member created:', r.rows[0].id)
  await pgc.end()

  const member = createClient(URL, anonKey, { auth: { persistSession: false } })
  const { data: session, error: loginErr } = await member.auth.signInWithPassword({ email, password })
  if (loginErr) { console.log('member login failed:', JSON.stringify(loginErr)); process.exit(1) }
  console.log('member logged in:', session.user.id)

  // member can read accounts/bon_sorties/credit_payments of the business?
  const checks = ['accounts', 'bon_sorties', 'credit_payments', 'stock_movements', 'invoices', 'business_cards', 'settings']
  for (const t of checks) {
    const { data, error } = await member.from(t).select('id').eq('businessId', businessId).limit(3)
    console.log(`member ${t}:`, error ? 'ERR ' + error.message : 'OK rows=' + (data?.length ?? 0))
  }
  // businesses read (no businessId column)
  const bizCheck = await member.from('businesses').select('id').eq('id', businessId).limit(1)
  console.log('member businesses:', bizCheck.error ? 'ERR ' + bizCheck.error.message : 'OK rows=' + (bizCheck.data?.length ?? 0))
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})