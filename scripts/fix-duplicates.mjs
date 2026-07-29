import pg from 'pg'
const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432,
  user: 'postgres', password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false },
})
await client.connect()

// Find and remove duplicate product_stocks
const { rows: dups } = await client.query(`
  SELECT "productId", "locationId", COUNT(*) as cnt
  FROM product_stocks
  GROUP BY "productId", "locationId"
  HAVING COUNT(*) > 1
`)
console.log(`Found ${dups.length} duplicate groups`)

for (const d of dups) {
  const { rows: recs } = await client.query(`
    SELECT id, quantity FROM product_stocks
    WHERE "productId" = $1 AND "locationId" = $2
    ORDER BY quantity DESC
  `, [d.productId, d.locationId])
  
  // Keep first (highest quantity), delete rest
  for (let i = 1; i < recs.length; i++) {
    await client.query('DELETE FROM product_stocks WHERE id = $1', [recs[i].id])
    console.log(`  Removed duplicate stock record ${recs[i].id} (qty ${recs[i].quantity})`)
  }
}

// Fix duplicate invoice numbers - delete all sales with INV-00001 except the last one
const { rows: invSales } = await client.query(`
  SELECT id, "invoiceNumber", "createdAt"
  FROM sales
  ORDER BY "createdAt" DESC
`)
console.log(`\nSales found: ${invSales.length}`)
for (const s of invSales) {
  console.log(`  ${s.invoiceNumber} - ${s.createdAt}`)
}

// Delete duplicate sales (they were local-only tests that got synced without stock deduction)
// Keep only the most recent one per invoice number
const seen = new Set()
for (const s of invSales) {
  if (seen.has(s.invoiceNumber)) {
    await client.query('DELETE FROM sales WHERE id = $1', [s.id])
    console.log(`  Deleted duplicate sale ${s.id} (${s.invoiceNumber})`)
  }
  seen.add(s.invoiceNumber)
}

await client.end()
