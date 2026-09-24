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
  const r = await pgc.query(
    `select email, encrypted_password from auth.users order by created_at desc limit 1`
  )
  const email = r.rows[0].email
  const hash = r.rows[0].encrypted_password
  console.log('latest user:', email)
  console.log('hash:', hash)
  await pgc.end()

  const raw = await fetch(URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: 'SupSec123!' }),
  })
  console.log('HTTP status:', raw.status)
  const body = await raw.text()
  console.log('RAW RESPONSE:', body)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})