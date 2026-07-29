import pg from 'pg'
import crypto from 'crypto'

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

function gid() { return crypto.randomUUID() }

async function run() {
  await client.connect()

  const email = 'boutique@neoxerp.com'
  const rawPassword = 'Test@123456'
  const userId = gid()

  // 1. Delete existing user with this email if any
  const { rows: existing } = await client.query(
    `SELECT id FROM auth.users WHERE email = $1`, [email]
  )
  if (existing.length > 0) {
    await client.query(`DELETE FROM auth.users WHERE id = $1`, [existing[0].id])
    console.log('Deleted existing user')
  }

  // 2. Insert auth user - trigger will create business + profile + locations
  await client.query(`
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      aud, role, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ($1, '00000000-0000-0000-0000-000000000000', $2,
      crypt($3, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', 'Lingerie Luxe', 'business_name', 'Lingerie Luxe Shop', 'phone', '+22670000001'),
      now(), now(), 'authenticated', 'authenticated', '', '', '', '')
  `, [userId, email, rawPassword])
  console.log(`Auth user: ${email} / ${rawPassword}`)

  // 3. Insert identity
  const identityId = gid()
  await client.query(`
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES ($1::uuid, $2::uuid, jsonb_build_object('sub', $2::text, 'email', $3::text), 'email', $3::text, now(), now(), now())
  `, [identityId, userId, email])

  // 4. Wait for trigger to finish
  await new Promise(r => setTimeout(r, 2000))

  // 5. Find the created business via profile
  const { rows: bizRows } = await client.query(
    `SELECT b.id, b.name FROM businesses b
     JOIN profiles p ON p."businessId" = b.id
     WHERE p.auth_user_id = $1 LIMIT 1`, [userId]
  )
  if (bizRows.length === 0) { console.error('Business not created by trigger'); process.exit(1) }
  const bizId = bizRows[0].id
  console.log(`Business: ${bizRows[0].name} (${bizId})`)

  // 6. Find locations
  const { rows: locs } = await client.query(
    `SELECT id, name, type FROM locations WHERE "businessId" = $1`, [bizId]
  )
  const shopId = locs.find(l => l.type === 'shop')?.id
  const warehouseId = locs.find(l => l.type === 'warehouse')?.id
  console.log(`Shop: ${shopId}`)
  console.log(`Warehouse: ${warehouseId}`)

  // 7. Create 2 extra depots
  const depotIds = []
  for (const name of ['Dépôt Nord', 'Dépôt Centre']) {
    const dId = gid()
    await client.query(
      `INSERT INTO locations (id, "businessId", name, type, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'warehouse', true, now(), now())`,
      [dId, bizId, name]
    )
    depotIds.push(dId)
    console.log(`Depot: ${name} (${dId})`)
  }

  // 8. Categories
  const cats = ['Gaines', 'Cuissards', 'Soutiens-gorge', 'Slips', 'Sous-vêtements']
  const catIds = {}
  for (const name of cats) {
    const cId = gid()
    await client.query(`INSERT INTO categories (id, "businessId", name) VALUES ($1, $2, $3)`, [cId, bizId, name])
    catIds[name] = cId
  }
  console.log('Categories:', Object.keys(catIds))

  // 9. Suppliers
  for (const s of [{ name: 'Lingerie Import SARL', phone: '+33100000001', email: 'contact@lingerie-import.fr' },
                   { name: 'Textile Afrique SA', phone: '+22500000001', email: 'info@textileafrique.ci' }]) {
    await client.query(`INSERT INTO suppliers (id, "businessId", name, phone, email) VALUES ($1, $2, $3, $4, $5)`,
      [gid(), bizId, s.name, s.phone, s.email])
  }
  console.log('Suppliers created')

  // 10. Products
  const pieces = [
    ['Gaine ventre plat', 3500, 7500, 'Gaines'],
    ['Gaine taille haute', 4200, 8900, 'Gaines'],
    ['Gaine sculptante', 5000, 10500, 'Gaines'],
    ['Soutien-gorge push-up', 2800, 6500, 'Soutiens-gorge'],
    ['Soutien-gorge dentelle', 3200, 7200, 'Soutiens-gorge'],
    ['Soutien-gorge sport', 2500, 5500, 'Soutiens-gorge'],
  ]
  const dozens = [
    ['Slip coton homme lot x12', 4800, 12000, 'Slips'],
    ['Slip boxer lot x12', 5500, 15000, 'Slips'],
    ['String lot x12', 3600, 9600, 'Sous-vêtements'],
    ['Cuissard gainant lot x12', 8000, 20000, 'Cuissards'],
  ]
  const packs = [
    ['Pack gaine + cuissard', 6500, 15000, 'Gaines'],
    ['Lot sous-vêtements mixte', 8000, 18000, 'Sous-vêtements'],
  ]

  const allPids = []
  for (const p of pieces) {
    const pId = gid()
    await client.query(`INSERT INTO products (id, "businessId", name, unit, "purchasePrice", "sellingPrice", "categoryId", status)
      VALUES ($1, $2, $3, 'piece', $4, $5, $6, 'active')`, [pId, bizId, p[0], p[1], p[2], catIds[p[3]]])
    allPids.push(pId)
  }
  for (const p of dozens) {
    const pId = gid()
    const priceDozen = p[1] + 2000
    await client.query(`INSERT INTO products (id, "businessId", name, unit, "purchasePrice", "sellingPrice", "priceDozen", "categoryId", status)
      VALUES ($1, $2, $3, 'dozen', $4, $5, $6, $7, 'active')`, [pId, bizId, p[0], p[1], p[2], priceDozen, catIds[p[3]]])
    allPids.push(pId)
  }
  for (const p of packs) {
    const pId = gid()
    await client.query(`INSERT INTO products (id, "businessId", name, unit, "purchasePrice", "sellingPrice", "pricePack", "packSize", "categoryId", status)
      VALUES ($1, $2, $3, 'pack', $4, $5, $6, 1, $7, 'active')`, [pId, bizId, p[0], p[1], p[2], p[1] + 5000, catIds[p[3]]])
    allPids.push(pId)
  }
  console.log(`Created ${allPids.length} products`)

  // 11. Stock in shop (all products)
  const shopQtys = [50, 50, 50, 50, 50, 50, 120, 120, 120, 120, 30, 30]
  for (let i = 0; i < allPids.length; i++) {
    await client.query(`INSERT INTO product_stocks (id, "businessId", "productId", "locationId", quantity, "updatedAt")
      VALUES ($1, $2, $3, $4, $5, now())`, [gid(), bizId, allPids[i], shopId, shopQtys[i]])
    await client.query(`INSERT INTO product_history (id, "businessId", "productId", "locationId", type, quantity, "createdAt")
      VALUES ($1, $2, $3, $4, 'inventory', $5, now())`, [gid(), bizId, allPids[i], shopId, shopQtys[i]])
  }
  console.log('Shop stock added')

  // 12. Stock in Depot Nord (first 10 products)
  const nordQtys = [100, 100, 100, 100, 100, 100, 240, 240, 240, 240]
  for (let i = 0; i < 10; i++) {
    await client.query(`INSERT INTO product_stocks (id, "businessId", "productId", "locationId", quantity, "updatedAt")
      VALUES ($1, $2, $3, $4, $5, now())`, [gid(), bizId, allPids[i], depotIds[0], nordQtys[i]])
  }
  console.log('Depot Nord stock added')

  // 13. Stock in Depot Centre (products 0, 2, 4)
  for (const idx of [0, 2, 4]) {
    await client.query(`INSERT INTO product_stocks (id, "businessId", "productId", "locationId", quantity, "updatedAt")
      VALUES ($1, $2, $3, $4, 75, now())`, [gid(), bizId, allPids[idx], depotIds[1]])
  }
  console.log('Depot Centre stock added')

  console.log('\n========================================')
  console.log('✅ BOUTIQUE CRÉÉE AVEC SUCCÈS !')
  console.log('========================================')
  console.log(`📧 Email: ${email}`)
  console.log(`🔑 Mot de passe: ${rawPassword}`)
  console.log(`🌐 URL: https://neox-erp-alpha.vercel.app`)
  console.log('========================================\n')

  await client.end()
}

run().catch(e => { console.error(e.message); process.exit(1) })
