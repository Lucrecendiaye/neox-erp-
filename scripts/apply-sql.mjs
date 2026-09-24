import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co',
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await client.connect()
  const file = process.argv[2]
  const sql = readFileSync(path.join(__dirname, file), 'utf8')
  try {
    await client.query(sql)
    console.log('Applied successfully')
  } catch (e) {
    console.error('FAIL:', e.message)
    process.exitCode = 1
  }
  await client.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})