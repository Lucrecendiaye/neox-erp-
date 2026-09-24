import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const URL = 'https://banknoizmiprfwhrcihc.supabase.co'
const env = readFileSync('.env.local', 'utf8')
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="?([^"\r\n]+)"?/)[1].trim()
const anon = createClient(URL, anonKey, { auth: { persistSession: false } })

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

  // insert a synthetic account + bon_sortie directly to verify the cloud table shape
  await pgc.query(
    `insert into public.accounts (id, "businessId", code, name, type, balance, "createdAt") values ($1,$2,$3,$4,$5,0, now()) on conflict (id) do nothing`,
    ['acc-test-' + Date.now(), businessId, '999', 'Compte Test Sync', 'asset']
  )
  await pgc.query(
    `insert into public.bon_sorties (id, "businessId", number, status, "fromLocationId", "toLocationId", "fromLocationName", "toLocationName", "totalQuantity", "createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8,0, now()) on conflict (id) do nothing`,
    ['bon-test-' + Date.now(), businessId, 'BS-TEST', 'pending', 'loc1', 'loc2', 'Boutique', 'Depot']
  )

  // verify anon token can read tenant rows for this business
  const { data: accData, error: accErr } = await anon.from('accounts').select('id').eq('businessId', businessId).limit(3)
  console.log('anon accounts read:', accErr ? 'ERR ' + accErr.message : accData)

  const { data: bonData, error: bonErr } = await anon.from('bon_sorties').select('id').eq('businessId', businessId).limit(3)
  console.log('anon bon_sorties read:', bonErr ? 'ERR ' + bonErr.message : bonData)

  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})