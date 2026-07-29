import pg from 'pg'
const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432,
  user: 'postgres', password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false },
})
await client.connect()

// Check current schema of product_history and product_stocks
for (const table of ['product_history', 'product_stocks']) {
  const { rows } = await client.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position
  `, [table])
  console.log(`\n${table}:`)
  rows.forEach(r => console.log(`  ${r.column_name} (${r.data_type}, nullable=${r.is_nullable}, default=${r.column_default || 'none'})`))
}

await client.end()
