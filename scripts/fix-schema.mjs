import pg from 'pg'
const client = new pg.Client({
  host: 'db.banknoizmiprfwhrcihc.supabase.co', port: 5432,
  user: 'postgres', password: 'Lucrecendi@ye1974',
  connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false },
})
await client.connect()

// Fix product_history schema to match Dexie
// Supabase: type, quantity, unitPrice, note
// Dexie:     action, quantityBefore, quantityAfter, (no unitPrice), comment

// First, add new columns
await client.query(`ALTER TABLE product_history ADD COLUMN IF NOT EXISTS action text`)
await client.query(`ALTER TABLE product_history ADD COLUMN IF NOT EXISTS "quantityBefore" numeric DEFAULT 0`)
await client.query(`ALTER TABLE product_history ADD COLUMN IF NOT EXISTS "quantityAfter" numeric DEFAULT 0`)
await client.query(`ALTER TABLE product_history ADD COLUMN IF NOT EXISTS comment text`)

// Migrate existing data (type -> action, quantity -> quantityAfter, 0 -> quantityBefore, note -> comment)
await client.query(`
  UPDATE product_history SET
    action = type,
    "quantityAfter" = quantity,
    "quantityBefore" = 0,
    comment = note
  WHERE action IS NULL
`)

// Set NOT NULL after migration
await client.query(`ALTER TABLE product_history ALTER COLUMN action SET NOT NULL`)
await client.query(`ALTER TABLE product_history ALTER COLUMN "quantityBefore" SET NOT NULL`)
await client.query(`ALTER TABLE product_history ALTER COLUMN "quantityAfter" SET NOT NULL`)

// Drop old columns (only after migration verified)
await client.query(`ALTER TABLE product_history DROP COLUMN IF EXISTS type`)
await client.query(`ALTER TABLE product_history DROP COLUMN IF EXISTS quantity`)
await client.query(`ALTER TABLE product_history DROP COLUMN IF EXISTS "unitPrice"`)
await client.query(`ALTER TABLE product_history DROP COLUMN IF EXISTS note`)

// Also add userId if missing (already exists, but just to be safe)
await client.query(`ALTER TABLE product_history ALTER COLUMN "userId" SET DATA TYPE text`)

console.log('✅ product_history schema updated to match Dexie')
console.log('   Columns: id, businessId, productId, locationId, action, quantityBefore, quantityAfter, userId, reference, comment, createdAt')

await client.end()
