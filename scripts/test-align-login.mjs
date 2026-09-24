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

  // find our last inserted user
  const r = await pgc.query(`select id, email from auth.users where email like 'login-test-%' order by created_at desc limit 1`)
  const { id, email } = r.rows[0]
  console.log('target:', email)

  // Set exactly like GoTrue normal user: tokens are '', email_change '', etc.
  const setSql = [
    `update auth.users set
       confirmation_token = '',
       recovery_token = '',
       email_change_token_new = '',
       email_change = '',
       email_change_sent_at = null,
       phone_change = '',
       phone_change_token = '',
       phone_change_sent_at = null,
       reauthentication_token = '',
       reauthentication_sent_at = null,
       email_change_token_current = '',
       email_change_confirm_status = 0,
       banned_until = null,
       confirmation_sent_at = null
     where id = $1`
  ]
  await pgc.query(setSql[0], [id])
  console.log('aligned columns')

  // compare raw rows again to be sure
  const row = await pgc.query(`select * from auth.users where id = $1`, [id])
  console.log('encrypted_password:', row.rows[0].encrypted_password)

  const supabase = createClient(URL, anonKey, { auth: { persistSession: false } })
  const raw = await fetch(URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'SupSec123!' }),
  })
  console.log('RAW status:', raw.status)
  console.log('RAW body:', await raw.text())
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})