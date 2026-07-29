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

  const { rows: profiles } = await client.query(`
    SELECT id, "auth_user_id", "businessId", name, email, phone, role
    FROM profiles
  `)
  console.log('=== PROFILS ===')
  profiles.forEach(p => console.log(`  ${p.name} | email: ${p.email || 'N/A'} | phone: ${p.phone || 'N/A'} | role: ${p.role} | auth_user_id: ${p.auth_user_id}`))

  const { rows: users } = await client.query(`
    SELECT id, email, phone, raw_user_meta_data->>'name' as name
    FROM auth.users
  `)
  console.log('\n=== AUTH USERS ===')
  users.forEach(u => console.log(`  email: ${u.email} | name: ${u.name || 'N/A'} | id: ${u.id}`))

  await client.end()
}

run().catch(e => { console.error(e); process.exit(1) })
