import pg from 'pg'
const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432,
  user: 'postgres', password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false },
})
await client.connect()

// Check stock for all products in all locations
const { rows: stocks } = await client.query(`
  SELECT ps.quantity, p.name, l.name as location
  FROM product_stocks ps
  JOIN products p ON p.id = ps."productId"
  JOIN locations l ON l.id = ps."locationId"
  ORDER BY l.name, p.name
`)
console.log('CURRENT STOCK:')
for (const s of stocks) {
  console.log(`  ${s.location.padEnd(20)} ${s.name.padEnd(35)} ${s.quantity}`)
}

// Check recent sales
const { rows: sales } = await client.query(`
  SELECT "invoiceNumber", total, "createdAt" FROM sales ORDER BY "createdAt" DESC LIMIT 5
`)
console.log('\nRECENT SALES:')
for (const s of sales) {
  console.log(`  ${s.invoiceNumber.padEnd(15)} ${s.total} FCFA  ${s.createdAt}`)
}

// Check product history
const { rows: history } = await client.query(`
  SELECT ph.type, ph.quantity, p.name, l.name as location, ph."createdAt"
  FROM product_history ph
  JOIN products p ON p.id = ph."productId"
  JOIN locations l ON l.id = ph."locationId"
  ORDER BY ph."createdAt" DESC LIMIT 10
`)
console.log('\nPRODUCT HISTORY (last 10):')
for (const h of history) {
  console.log(`  ${h.type.padEnd(15)} ${h.name.padEnd(35)} ${h.location.padEnd(20)} qty:${h.quantity}  ${h.createdAt}`)
}

await client.end()
