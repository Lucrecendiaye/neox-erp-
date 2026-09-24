import pg from 'pg'

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
  const tables = ['settings', 'businesses', 'stock_movements', 'invoices', 'business_cards']
  for (const t of tables) {
    const r = await pgc.query(
      `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
      [t]
    )
    console.log('\n=== ' + t + ' ===')
    r.rows.forEach((c) => console.log('  ', c.column_name, c.data_type, c.is_nullable, c.column_default || ''))
  }
  await pgc.end()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})