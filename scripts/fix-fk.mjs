import pg from 'pg'
const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432,
  user: 'postgres', password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false },
})
await client.connect()

// Add FK from profiles.businessId to businesses.id
try {
  await client.query(`
    ALTER TABLE profiles
    ADD CONSTRAINT fk_profiles_business
    FOREIGN KEY ("businessId") REFERENCES businesses(id)
  `)
  console.log('FK added: profiles.businessId -> businesses.id')
} catch (e) {
  console.log('FK may already exist or error:', e.message)
}

await client.end()
