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

  const nonnull = await pgc.query(
    `select column_name from information_schema.columns where table_schema='auth' and table_name='users' and is_nullable='NO' and column_default is null`
  )
  console.log('NOT NULL, NO DEFAULT:', nonnull.rows.map((r) => r.column_name).join(', '))

  const defs = await pgc.query(
    `select column_name, column_default from information_schema.columns where table_schema='auth' and table_name='users' order by ordinal_position`
  )
  defs.rows.forEach((r) => {
    if (r.column_default) console.log(' ', r.column_name, '=>', r.column_default)
  })

  const latest = await pgc.query(
    `select encrypted_password, raw_app_meta_data from auth.users where email = $1 order by created_at desc limit 1`,
    ['login-test-' + ''
  ])
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})