import pg from 'pg'

const PASSWORD = 'Lucrecendi@ye1974'
const REF = 'banknoizmiprfwhrcihc'

const client = new pg.Client({
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: PASSWORD,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

async function run() {
  await client.connect()
  console.log('Connected')

  // 1. Delete all public data first (respect FK constraints)
  console.log('Deleting public data...')
  const tables = [
    'stock_movements', 'product_history', 'product_stocks', 'transfers',
    'compensations', 'supplier_payments', 'supplier_invoices',
    'audit_logs', 'notifications', 'accounting_entries',
    'cash_book', 'payrolls', 'attendance', 'employees',
    'leads', 'business_cards', 'locations', 'accounts',
    'credits', 'sales', 'purchases', 'invoices',
    'stock_movements', 'products', 'categories', 'customers', 'suppliers',
    'profiles', 'businesses', 'settings',
  ]
  for (const t of tables) {
    try {
      await client.query(`DELETE FROM "${t}"`)
      console.log(`  Cleared ${t}`)
    } catch (e) {
      console.log(`  Skipped ${t}: ${e.message}`)
    }
  }

  // 2. Delete auth users (this is the master - all FK cascade from here)
  console.log('\nDeleting auth users...')
  const { rowCount } = await client.query('DELETE FROM auth.users')
  console.log(`  Deleted ${rowCount} users`)

  // 3. Verify emptiness
  const { rows: remaining } = await client.query(`
    SELECT 'profiles' as tbl, count(*) as cnt FROM profiles
    UNION ALL SELECT 'businesses', count(*) FROM businesses
    UNION ALL SELECT 'accounts', count(*) FROM accounts
    UNION ALL SELECT 'products', count(*) FROM products
    UNION ALL SELECT 'sales', count(*) FROM sales
    UNION ALL SELECT 'auth.users', count(*) FROM auth.users
    ORDER BY tbl
  `)
  console.log('\nRemaining records:')
  remaining.forEach(r => console.log(`  ${r.tbl}: ${r.cnt}`))

  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
