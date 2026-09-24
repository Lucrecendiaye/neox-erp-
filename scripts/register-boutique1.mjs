// Enregistre les fournisseurs et produits de boutique1@neoxerp.com (source: Recapitulatif_Commandes_Fournisseurs_06-08.docx)
// Donnees encodees en UTF-8. Stock converti en piece (unite interne du code).
import crypto from 'crypto'
import pg from 'pg'

const PASSWORD = 'Lucrecendi@ye1974'
const REF = 'banknoizmiprfwhrcihc'
const AUTH_USER_ID = '7f61cccc-be42-42e8-808e-a14e1d704d18' // boutique1@neoxerp.com

const client = new pg.Client({
  host: `db.${REF}.supabase.co`,
  port: 5432,
  user: 'postgres',
  database: 'postgres',
  password: PASSWORD,
  connectionTimeoutMillis: 15000,
  ssl: { rejectUnauthorized: false },
})

const gid = () => crypto.randomUUID()

function round2(n) { return Math.round(n * 100) / 100 }

// ------------------------------------------------------------------
// DONNEES (extrait du document)
// fournisseur: { name, address }
// produit: { supplier, name, unit: 'dozen'|'piece'|'pack', qty, price, packSize? }
//   - unit 'dozen'  : qty en douzaines, price = prix par douzaine
//   - unit 'pack'   : qty en paquets, price = prix par paquet, packSize = nb pieces
//   - unit 'piece'  : qty en pieces, price = prix par piece
// ------------------------------------------------------------------
const SUPPLIERS = [
  { name: 'QILUO', address: '' },
  { name: 'FRANCINE', address: 'Guanda' },
  { name: 'LINDA', address: 'GUANDA' },
  { name: 'MILLA / MILA', address: 'GUANDA' },
  { name: 'AOSI ROSE', address: 'YIWU' },
]

const PRODUCTS = [
  // QILUO
  { supplier: 'QILUO', name: 'Caleçon Pack de 3 multicolore', unit: 'pack', qty: 4200, price: 1875, packSize: 3 },

  // FRANCINE
  { supplier: 'FRANCINE', name: 'Caleçons Enfants PRINCE', unit: 'dozen', qty: 2000, price: 3800 },

  // LINDA
  { supplier: 'LINDA', name: 'Cuissard grande taille 1225#', unit: 'dozen', qty: 867, price: 7500 },
  { supplier: 'LINDA', name: 'BODY ENFANT 0013#', unit: 'dozen', qty: 1000, price: 4500 },
  { supplier: 'LINDA', name: 'Body enfants dessins 0011#', unit: 'dozen', qty: 1000, price: 4500 },
  { supplier: 'LINDA', name: 'Body court 86248', unit: 'dozen', qty: 600, price: 5000 },

  // MILLA / MILA
  { supplier: 'MILLA / MILA', name: 'Caleçon Enfants MIKEY', unit: 'dozen', qty: 1000, price: 3000 },
  { supplier: 'MILLA / MILA', name: 'Slips Coton SHI WEI', unit: 'dozen', qty: 1000, price: 3500 },
  { supplier: 'MILLA / MILA', name: 'Strings 51214#', unit: 'dozen', qty: 310, price: 2000 },

  // AOSI ROSE
  { supplier: 'AOSI ROSE', name: 'Cuissard Invisible dentelles DG55827', unit: 'dozen', qty: 300, price: 9600 },
  { supplier: 'AOSI ROSE', name: 'Cuissard Invisible dentelles DG55854', unit: 'dozen', qty: 300, price: 10000 },
  { supplier: 'AOSI ROSE', name: 'Cuissard Invisible dentelles DG55853', unit: 'dozen', qty: 300, price: 10000 },
  { supplier: 'AOSI ROSE', name: 'Cuissard Invisible dentelles DG54574', unit: 'dozen', qty: 300, price: 10000 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles HZ2019', unit: 'dozen', qty: 300, price: 6500 },
  { supplier: 'AOSI ROSE', name: 'Combinaison Sport Longue YJ-91111', unit: 'piece', qty: 2796, price: 2500 },
  { supplier: 'AOSI ROSE', name: 'Cuissard THIOUPE YJ-9120', unit: 'dozen', qty: 320, price: 9200 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles HZ2088', unit: 'dozen', qty: 98, price: 6200 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles H61031', unit: 'dozen', qty: 2180, price: 6500 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles croiser derrière H60994#', unit: 'dozen', qty: 194, price: 6500 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles Croisé devant H61085', unit: 'dozen', qty: 300, price: 6500 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles cours derrière H61189#', unit: 'dozen', qty: 300, price: 5500 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles H61072', unit: 'dozen', qty: 170, price: 5500 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles K8021', unit: 'dozen', qty: 309, price: 5250 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles HZ26002', unit: 'dozen', qty: 300, price: 5800 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles H60958', unit: 'dozen', qty: 300, price: 5500 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles Croisé devant H60930', unit: 'dozen', qty: 307, price: 5000 },
  { supplier: 'AOSI ROSE', name: 'Slips Boxer Coton LV6832', unit: 'dozen', qty: 300, price: 4400 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles FEINTE COTÉ H2004', unit: 'dozen', qty: 300, price: 3800 },
  { supplier: 'AOSI ROSE', name: 'Slips Invisible coton LV087', unit: 'dozen', qty: 300, price: 4100 },
  { supplier: 'AOSI ROSE', name: 'STRINGS PERLE XG-6042', unit: 'dozen', qty: 300, price: 3800 },
  { supplier: 'AOSI ROSE', name: 'STRING PERLE XG-6014', unit: 'dozen', qty: 239, price: 3900 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles tailles K8024', unit: 'dozen', qty: 300, price: 5300 },
  { supplier: 'AOSI ROSE', name: 'STRINGS FETHIII XG-6029', unit: 'dozen', qty: 300, price: 4200 },
  { supplier: 'AOSI ROSE', name: 'Slip dentelles grandes tailles HZ2031', unit: 'dozen', qty: 300, price: 6500 },
  { supplier: 'AOSI ROSE', name: 'Combinaison taille Soutien 628#', unit: 'piece', qty: 3300, price: 2700 },
  { supplier: 'AOSI ROSE', name: 'Combinaison Dos Nue FJ-28063', unit: 'piece', qty: 6120, price: 1500 },
]

// ------------------------------------------------------------------

async function run() {
  await client.connect()

  // 1. Tenants
  const { rows: biz } = await client.query(
    `SELECT b.id, b.name FROM businesses b JOIN profiles p ON p."businessId" = b.id WHERE p."auth_user_id" = $1 LIMIT 1`,
    [AUTH_USER_ID]
  )
  if (biz.length === 0) throw new Error('Entreprise introuvable pour boutique1@neoxerp.com')
  const businessId = biz[0].id
  console.log(`Entreprise: ${biz[0].name} (${businessId})`)

  // 2. Depot cible (Dépôt Principal / warehouse)
  const { rows: locs } = await client.query(
    `SELECT id, name, type FROM locations WHERE "businessId" = $1`, [businessId]
  )
  let depot = locs.find(l => l.type === 'warehouse')
  if (!depot) depot = locs.find(l => /depot/i.test(l.name))
  if (!depot) depot = locs[0]
  if (!depot) throw new Error('Aucun dépôt trouvé')
  console.log(`Dépôt cible: ${depot.name} (${depot.id})\n`)

  const supplierIds = {}
  const report = []
  let createdSuppliers = 0
  let createdProducts = 0
  let skippedProducts = 0
  let skippedSuppliers = 0
  let errors = 0
  const totalValuePerSupplier = {}

  // 3. Fournisseurs (nom unique par entreprise)
  for (const s of SUPPLIERS) {
    const { rows: existing } = await client.query(
      `SELECT id FROM suppliers WHERE "businessId" = $1 AND lower(name) = lower($2) LIMIT 1`,
      [businessId, s.name]
    )
    if (existing.length > 0) {
      supplierIds[s.name] = existing[0].id
      skippedSuppliers++
      report.push(`Fournisseur (existant) : ${s.name}`)
      continue
    }
    const sid = gid()
    await client.query(
      `INSERT INTO suppliers (id, "businessId", name, phone, email, address, notes) VALUES ($1, $2, $3, NULL, NULL, $4, NULL)`,
      [sid, businessId, s.name, s.address || null]
    )
    supplierIds[s.name] = sid
    createdSuppliers++
    report.push(`Fournisseur (créé)     : ${s.name}${s.address ? ` — ${s.address}` : ''}`)
  }

  console.log('FOURNISSEURS')
  report.filter(r => r.startsWith('Fournisseur')).forEach(r => console.log(' ' + r))
  console.log()

  // 4. Produits
  const now = new Date()
  for (const p of PRODUCTS) {
    const supplierId = supplierIds[p.supplier]
    try {
      const { rows: existing } = await client.query(
        `SELECT id FROM products WHERE "businessId" = $1 AND lower(name) = lower($2) LIMIT 1`,
        [businessId, p.name]
      )
      if (existing.length > 0) {
        skippedProducts++
        console.log(`[ignoré] ${p.name} (déjà existant)`)
        continue
      }

      const unitSize = p.unit === 'dozen' ? 12 : p.unit === 'pack' ? (p.packSize || 3) : 1
      const purchasePrice = p.unit === 'dozen' ? round2(p.price / 12)
        : p.unit === 'pack' ? round2(p.price / (p.packSize || 3))
        : p.price
      const mainQty = p.qty * unitSize // stock en pièces

      const productId = gid()
      const product = {
        id: productId,
        businessId,
        name: p.name,
        description: null,
        unit: p.unit,
        purchasePrice,
        sellingPrice: 0,
        wholesalePrice: 0,
        priceDozen: p.unit === 'dozen' ? p.price : null,
        pricePack: p.unit === 'pack' ? p.price : null,
        packSize: p.unit === 'pack' ? p.packSize || 3 : null,
        margin: 0,
        taxRate: 0,
        stockAlert: 0,
        supplierId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }
      const cols = Object.keys(product)
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      await client.query(
        `INSERT INTO products (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
        cols.map(c => product[c])
      )

      await client.query(
        `INSERT INTO product_stocks (id, "businessId", "productId", "locationId", quantity, "stockAlert", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 0, $6)`,
        [gid(), businessId, productId, depot.id, mainQty, now]
      )

      await client.query(
        `INSERT INTO product_history (id, "businessId", "productId", "locationId", reference, "userId", action, "quantityBefore", "quantityAfter", comment)
         VALUES ($1, $2, $3, $4, 'IMPORT', NULL, 'inventory', 0, $5, 'Stock initial (import)')`,
        [gid(), businessId, productId, depot.id, mainQty]
      )

      await client.query(
        `INSERT INTO stock_movements (id, "businessId", "locationId", "productId", type, quantity, "unitPrice", reference, note)
         VALUES ($1, $2, $3, $4, 'inventory', $5, $6, 'IMPORT', 'Stock initial (import)')`,
        [gid(), businessId, depot.id, productId, mainQty, purchasePrice]
      )

      createdProducts++
      totalValuePerSupplier[p.supplier] = (totalValuePerSupplier[p.supplier] || 0) + p.qty * p.price
      console.log(`[ok] ${p.name} — ${p.qty} ${p.unit} → ${mainQty} pc (${purchasePrice} pc) [${p.supplier}]`)
    } catch (e) {
      errors++
      console.log(`[ERREUR] ${p.name}: ${e.message}`)
    }
  }

  // 5. Rapport final
  console.log('\n========================================')
  console.log(`Fournisseurs créés : ${createdSuppliers} (${skippedSuppliers} existants)`)
  console.log(`Produits créés     : ${createdProducts} (${skippedProducts} ignorés, ${errors} erreurs)`)
  console.log(`Dépôt              : ${depot.name}`)
  console.log('Valeur (info) par fournisseur :')
  for (const [k, v] of Object.entries(totalValuePerSupplier)) console.log(`  ${k.padEnd(12)} → ${v}`)
  console.log('========================================')

  await client.end()
}

run().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })