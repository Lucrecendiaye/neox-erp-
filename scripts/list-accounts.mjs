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

  // List all businesses
  const { rows: businesses } = await client.query('SELECT id, name, email, "createdAt" FROM businesses ORDER BY "createdAt"')
  console.log('=== BOUTIQUES ===')
  businesses.forEach(b => console.log(`  ${b.name} (${b.id}) - créée ${b.createdAt}`))

  // List all accounts with business name
  const { rows: accounts } = await client.query(`
    SELECT a.id, a.code, a.name, a.type, a.balance, b.name as business_name,
           b."createdAt" as biz_created
    FROM accounts a
    JOIN businesses b ON a."businessId" = b.id
    ORDER BY b."createdAt", a.code
  `)
  console.log('\n=== COMPTES COMPTABLES ===')
  accounts.forEach(a => console.log(`  [${a.business_name}] ${a.code} - ${a.name} (${a.type}) - solde: ${a.balance}`))

  // List all locations
  const { rows: locations } = await client.query(`
    SELECT l.id, l.name, l.type, b.name as business_name
    FROM locations l
    JOIN businesses b ON l."businessId" = b.id
    ORDER BY b."createdAt", l.name
  `)
  console.log('\n=== EMPLACEMENTS ===')
  locations.forEach(l => console.log(`  [${l.business_name}] ${l.name} (${l.type === 'shop' ? 'Boutique' : 'Dépôt'})`))

  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
