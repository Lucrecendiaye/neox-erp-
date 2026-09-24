// Transforme les produits importés en VRAIS achats fournisseurs (comptabilité correcte).
// Crée un achat (purchases) par fournisseur, convertit l'historique stock en 'purchased',
// supprime les stock_movements d'import fantômes, ajoute l'audit.
import crypto from 'crypto'
import pg from 'pg'

const PASSWORD = 'Lucrecendi@ye1974'
const REF = 'banknoizmiprfwhrcihc'
const AUTH_USER_ID = '7f61cccc-be42-42e8-808e-a14e1d704d18'

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
const now = () => new Date().toISOString()

// Mêmes données que l'import : { supplier, name, unit, qty, price, packSize? }
const PRODUCTS = [
  { supplier: 'QILUO', name: 'Caleçon Pack de 3 multicolore', unit: 'pack', qty: 4200, price: 1875, packSize: 3 },
  { supplier: 'FRANCINE', name: 'Caleçons Enfants PRINCE', unit: 'dozen', qty: 2000, price: 3800 },
  { supplier: 'LINDA', name: 'Cuissard grande taille 1225#', unit: 'dozen', qty: 867, price: 7500 },
  { supplier: 'LINDA', name: 'BODY ENFANT 0013#', unit: 'dozen', qty: 1000, price: 4500 },
  { supplier: 'LINDA', name: 'Body enfants dessins 0011#', unit: 'dozen', qty: 1000, price: 4500 },
  { supplier: 'LINDA', name: 'Body court 86248', unit: 'dozen', qty: 600, price: 5000 },
  { supplier: 'MILLA / MILA', name: 'Caleçon Enfants MIKEY', unit: 'dozen', qty: 1000, price: 3000 },
  { supplier: 'MILLA / MILA', name: 'Slips Coton SHI WEI', unit: 'dozen', qty: 1000, price: 3500 },
  { supplier: 'MILLA / MILA', name: 'Strings 51214#', unit: 'dozen', qty: 310, price: 2000 },
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

async function run() {
  await client.connect()

  const { rows: biz } = await client.query(
    'SELECT b.id, b.name FROM businesses b JOIN profiles p ON p."businessId"=b.id WHERE p."auth_user_id"=$1 LIMIT 1', [AUTH_USER_ID]
  )
  if (biz.length === 0) throw new Error('Entreprise introuvable')
  const businessId = biz[0].id

  const { rows: profRows } = await client.query('SELECT id, name FROM profiles WHERE "auth_user_id"=$1 LIMIT 1', [AUTH_USER_ID])
  const profileId = profRows[0]?.id
  const userName = profRows[0]?.name || ''

  const { rows: locs } = await client.query('SELECT id, name, type FROM locations WHERE "businessId"=$1', [businessId])
  let depot = locs.find(l => l.type === 'warehouse')
  if (!depot) depot = locs[0]
  if (!depot) throw new Error('Aucun dépôt')

  const { rows: supps } = await client.query('SELECT id, name FROM suppliers WHERE "businessId"=$1', [businessId])
  const suppMap = Object.fromEntries(supps.map(s => [s.name, s.id]))

  const { rows: prods } = await client.query('SELECT id, name FROM products WHERE "businessId"=$1', [businessId])
  const prodIdMap = Object.fromEntries(prods.map(p => [p.name, p.id]))

  const { rows: existing } = await client.query('SELECT count(*)::int n FROM purchases WHERE "businessId"=$1', [businessId])
  if (existing[0].n > 0) {
    console.log(`Il existe déjà ${existing[0].n} achats. Abandon pour éviter les doublons.`)
    await client.end()
    return
  }
  const nowIso = now()
  const bySupplier = {}
  for (const p of PRODUCTS) (bySupplier[p.supplier] = bySupplier[p.supplier] || []).push(p)

  console.log('Dépôt:', depot.name)
  let created = 0
  let missing = []

  for (const [supplierName, list] of Object.entries(bySupplier)) {
    const supplierId = suppMap[supplierName]
    if (!supplierId) { missing.push(supplierName); continue }

    const items = []
    let total = 0
    for (const p of list) {
      const productId = prodIdMap[p.name]
      if (!productId) { console.log('  [introuvable] ' + p.name); continue }
      const unitQuantity = p.unit === 'dozen' ? 12 : p.unit === 'pack' ? (p.packSize || 3) : 1
      const unitName = p.unit === 'dozen' ? 'Douzaine' : p.unit === 'pack' ? 'Paquet' : 'Pièce'
      const unitPrice = p.price
      const lineTotal = p.qty * unitPrice
      items.push({ productId, productName: p.name, quantity: p.qty, unitPrice, discount: 0, taxRate: 0, total: lineTotal, unitName, unitQuantity })
      total += lineTotal
    }
    if (items.length === 0) continue

    const purchaseId = gid()
    await client.query(
      `INSERT INTO purchases (id, "businessId", "supplierId", "supplierName", "locationId", items, subtotal, "discountTotal", "taxTotal", total, paid, status, note, "createdAt", "userId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $7, 0, 'completed', $8, $9, $10)`,
      [purchaseId, businessId, supplierId, supplierName, depot.id, JSON.stringify(items), total, 'Import commandes fournisseurs (06/08)', nowIso, profileId]
    )

    for (const p of list) {
      const productId = prodIdMap[p.name]
      if (!productId) continue
      await client.query(
        `UPDATE product_history SET action='purchased', reference=$1, comment=$2, "userId"=$3, "createdAt"=$4
         WHERE "businessId"=$5 AND "productId"=$6 AND "locationId"=$7 AND action='inventory'`,
        [purchaseId, `Achat #${purchaseId}`, profileId, nowIso, businessId, productId, depot.id]
      )
    }

    await client.query(
      `INSERT INTO audit_logs (id, "businessId", "userId", action, entity, "entityId", details, "createdAt")
       VALUES ($1, $2, $3, $4, 'purchase', $5, $6, now())`,
      [gid(), businessId, profileId, `create (${userName})`, purchaseId, `Achat ${total} FCFA (${userName})`]
    )

    created++
    console.log(`Achat créé : ${supplierName} — ${items.length} articles — ${total.toLocaleString('fr-FR')} FCFA`)
  }

  // Nettoie les mouvements fantômes de l'import (l'app n'en crée pas lors d'un achat)
  const del = await client.query(
    `DELETE FROM stock_movements WHERE "businessId"=$1 AND reference='IMPORT' AND type='inventory'`, [businessId]
  )
  console.log(`stock_movements d'import supprimés : ${del.rowCount}`)

  if (missing.length) console.log('Fournisseurs manquants:', missing.join(', '))
  console.log('Achats créés :', created)

  await client.end()
}

run().catch(e => { console.error('ERREUR:', e.message); process.exit(1) })