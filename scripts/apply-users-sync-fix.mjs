import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sql = fs.readFileSync(path.join(__dirname, 'users-sync-fix.sql'), 'utf8')

const c = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

try {
  await c.query(sql)
  console.log('SQL applied OK')
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
}

const q = async (label, qsql) => {
  try {
    const r = await c.query(qsql)
    console.log(`\n=== ${label} ===`)
    console.log(JSON.stringify(r.rows, null, 1))
  } catch (e) {
    console.log(`\n=== ${label} === ERROR: ${e.message}`)
  }
}

await q('profiles policies', `select policyname, cmd, qual from pg_policies where schemaname='public' and tablename='profiles'`)
await q('profiles columns', `select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position`)
await q('realtime publication tables', `select pt.tablename from pg_publication_tables pt where pt.pubname='supabase_realtime' order by pt.tablename`)
await q('cash tables exist', `select table_name from information_schema.tables where table_schema='public' and table_name in ('cash_operations','cash_categories')`)
await q('combined every profile', `select "id", "email", "name", role, permissions, is_primary_admin, status, "businessId", auth_user_id from profiles order by "createdAt" nulls last`)

await c.end()
console.log('\ndone')