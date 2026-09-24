import { describe, it, expect, beforeAll, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: null,
}))

;(globalThis as any).window = { innerWidth: 1024 }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: { _s: {} as any, getItem(k: string) { return this._s[k] ?? null }, setItem(k: string, v: string) { this._s[k] = v }, removeItem(k: string) { delete this._s[k] } }, configurable: true })

const { useAppStore } = await import('@/stores/appStore')
const db = (await import('@/db')).default
const { processSale } = await import('./operations')
const {
  computeUserStats, filterSalesByUsers, periodSalesOf, buildUserSeries,
  filterAuditLogs, auditMeta, entityLabel, parseJsonData, extractOldNew,
  salesCogs, resolveUser,
} = await import('./userStats')
import type { Sale, Product, User, AuditLog } from '@/types'

function sale(over: Partial<Sale>): Sale {
  return {
    id: over.id || 'sale-' + Math.random().toString(36).slice(2, 10),
    businessId: 'b1',
    locationId: 'loc1',
    invoiceNumber: over.invoiceNumber || 'INV-TEST',
    customerId: 'cust1',
    customerName: 'Client A',
    items: [{ productId: 'p1', productName: 'Riz', quantity: 2, unitPrice: 13350, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 26700 }],
    subtotal: 26700,
    discountTotal: 0,
    taxTotal: 0,
    total: 26700,
    paid: 26700,
    change: 0,
    paymentMethod: 'cash',
    status: 'completed',
    createdAt: new Date().toISOString(),
    userId: 'u1',
    ...over,
  }
}

const product: Product = {
  id: 'p1', businessId: 'b1', name: 'Riz', photos: [], unit: 'piece',
  purchasePrice: 10000, sellingPrice: 13350, margin: 33.5, taxRate: 0,
  status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}

const userA: User = {
  id: 'u1', businessId: 'b1', name: 'Alice', email: 'alice@shop.com', loginId: 'alice',
  role: 'Vendeuse', permissions: ['sales:create'], isActive: true,
  status: 'active', createdAt: new Date().toISOString(),
} as any

const userB: User = {
  id: 'u2', businessId: 'b1', name: 'Bob', email: 'bob@shop.com', loginId: 'bob',
  role: 'Vendeur', permissions: ['sales:create'], isActive: true,
  status: 'active', createdAt: new Date().toISOString(),
} as any

beforeAll(async () => {
  useAppStore.getState().setUser({ id: 'u1', businessId: 'b1', name: 'Alice', loginId: 'alice', role: 'Vendeuse', permissions: ['*'] } as any)
  useAppStore.getState().setCurrentBusiness({ id: 'b1', name: 'Biz' } as any)
  await db.products.bulkPut([product])
  await db.productStocks.put({
    id: 'stock-p1-loc1', businessId: 'b1', productId: 'p1', locationId: 'loc1',
    quantity: 500, stockAlert: 10, stockMin: 0, stockMax: 999999, updatedAt: new Date().toISOString(),
  })
})

async function clearBizData() {
  await db.sales.clear()
  await db.cashBook.clear()
  await db.cashOps.clear()
  await db.credits.clear()
  await db.creditPayments.clear()
  await db.auditLogs.clear()
}

describe('userStats — stats par vendeur (données réelles)', () => {
  it('1. attribution : chaque vente est comptée pour le bon vendeur (Alice vs Bob)', async () => {
    await clearBizData()
    useAppStore.getState().setUser({ id: 'u1', name: 'Alice', loginId: 'alice', permissions: ['*'] } as any)
    await processSale(sale({ id: 's1', invoiceNumber: 'INV-01', userId: 'u1' }))
    useAppStore.getState().setUser({ id: 'u2', name: 'Bob', loginId: 'bob', permissions: ['*'] } as any)
    await processSale(sale({ id: 's2', invoiceNumber: 'INV-02', userId: 'u2' }))
    useAppStore.getState().setUser({ id: 'u1', name: 'Alice', loginId: 'alice', permissions: ['*'] } as any)

    const all = (await db.sales.toArray()).filter(s => s.businessId === 'b1')
    const stats = computeUserStats(all, [product], [userA, userB])

    const alice = stats.find(s => s.userId === 'u1')!
    const bob = stats.find(s => s.userId === 'u2')!
    expect(alice.salesCount).toBe(1)
    expect(alice.revenue).toBe(26700)
    expect(bob.salesCount).toBe(1)
    expect(bob.revenue).toBe(26700)
  })

  it('2. CA, coût et marge brute utilisent la logique existante (prix d\'achat)', async () => {
    await clearBizData()
    useAppStore.getState().setUser({ id: 'u1', name: 'Alice', loginId: 'alice', permissions: ['*'] } as any)
    await processSale(sale({ id: 's3', invoiceNumber: 'INV-03' }))

    const all = (await db.sales.toArray()).filter(s => s.businessId === 'b1')
    const stats = computeUserStats(all, [product], [userA])
    const alice = stats.find(s => s.userId === 'u1')!
    expect(alice.revenue).toBe(26700)
    expect(alice.cogs).toBe(20000)
    expect(alice.grossProfit).toBe(6700)
    expect(alice.avgBasket).toBe(26700)
  })

  it('3. les ventes annulées sont exclues des stats du vendeur', async () => {
    await clearBizData()
    useAppStore.getState().setUser({ id: 'u1', name: 'Alice', loginId: 'alice', permissions: ['*'] } as any)
    await processSale(sale({ id: 's4', invoiceNumber: 'INV-04' }))
    await db.sales.put(sale({ id: 's5', invoiceNumber: 'INV-05', status: 'cancelled' }))

    const all = (await db.sales.toArray()).filter(s => s.businessId === 'b1')
    const stats = computeUserStats(all, [product], [userA])
    const alice = stats.find(s => s.userId === 'u1')!
    expect(alice.salesCount).toBe(1)
    expect(alice.revenue).toBe(26700)
  })

  it('4. filtre utilisateurs (tous / un / plusieurs)', async () => {
    const s1 = sale({ id: 'sX1', userId: 'u1', total: 100 })
    const s2 = sale({ id: 'sX2', userId: 'u2', total: 200 })
    const s3 = sale({ id: 'sX3', userId: 'u3', total: 50 })
    const list = [s1, s2, s3]

    expect(filterSalesByUsers(list, null).length).toBe(3)
    expect(filterSalesByUsers(list, ['u1']).map(s => s.id)).toEqual(['sX1'])
    expect(filterSalesByUsers(list, ['u1', 'u2']).length).toBe(2)
  })

  it('5. filtre période : seules les ventes de la période sont prises en compte', async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(now)
    const olderStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3)

    const recent = sale({ id: 'sP1', userId: 'u1', createdAt: now.toISOString() })
    const older = sale({ id: 'sP2', userId: 'u1', createdAt: olderStart.toISOString() })

    expect(periodSalesOf([recent, older], start, end).map(s => s.id)).toEqual(['sP1'])
  })

  it('6. série journalière : une vente par jour (granularité day)', async () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const end = new Date(now)
    const sDay1 = sale({ id: 'sD1', userId: 'u1', createdAt: start.toISOString(), items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 13350, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 13350 }], total: 13350 })
    const sDay2 = sale({ id: 'sD2', userId: 'u1', createdAt: now.toISOString(), items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 13350, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 13350 }], total: 13350 })

    const series = buildUserSeries([sDay1, sDay2], [product], { start, end }, 'day')
    expect(series.length).toBe(2)
    expect(series.reduce((s, p) => s + p.revenue, 0)).toBe(26700)
    expect(series.reduce((s, p) => s + p.count, 0)).toBe(2)
  })

  it('7. série mensuelle / semestrielle : agrégation correcte', async () => {
    const jan = new Date(2026, 0, 15)
    const feb = new Date(2026, 1, 10)
    const start = new Date(2026, 0, 1)
    const end = new Date(2026, 2, 1)

    const sJan = sale({ id: 'sM1', userId: 'u1', createdAt: jan.toISOString(), total: 100 })
    const sFeb = sale({ id: 'sM2', userId: 'u1', createdAt: feb.toISOString(), total: 200 })

    const byMonth = buildUserSeries([sJan, sFeb], [product], { start, end }, 'month')
    expect(byMonth.reduce((s, p) => s + p.revenue, 0)).toBe(300)

    const bySem = buildUserSeries([sJan, sFeb], [product], { start, end }, 'semester')
    expect(bySem.length).toBe(1)
    expect(bySem[0].label).toContain('S1')
  })

  it('8. salesCogs n\'impute aucun coût si le produit est inconnu (vente sans produit)', async () => {
    const s = sale({ id: 'sC1', userId: 'u1', items: [{ productId: 'zzz', productName: 'Inconnu', quantity: 1, unitPrice: 5000, unitName: 'Pièce', unitQuantity: 1, discount: 0, taxRate: 0, total: 5000 }], total: 5000 })
    expect(salesCogs([s], [product])).toBe(0)
  })

  it('9. journal : métadonnées d\'action + étiquette entité', () => {
    expect(auditMeta('create').variant).toBe('success')
    expect(auditMeta('delete').variant).toBe('danger')
    expect(auditMeta('payment').label).toBe('Paiement')
    expect(auditMeta('unknown_action').label).toBe('unknown_action')
    expect(entityLabel('sale')).toBe('Vente')
    expect(entityLabel('credit')).toBe('Crédit')
    expect(entityLabel('bon_sortie')).toBe('Bon de sortie')
  })

  it('10. journal : filtres utilisateur/action/module/période + recherche + ancienne/nouvelle valeur', async () => {
    const logs: AuditLog[] = [
      { id: 'l1', businessId: 'b1', userId: 'u1', action: 'create', entity: 'sale', entityId: 's1', details: 'Vente INV-01', oldData: '{"total":20000}', newData: '{"total":26700}', createdAt: '2026-01-10T10:00:00.000Z' },
      { id: 'l2', businessId: 'b1', userId: 'u2', action: 'cancel', entity: 'sale', entityId: 's2', details: 'Annulation', createdAt: '2026-01-11T10:00:00.000Z' },
      { id: 'l3', businessId: 'b1', userId: 'u1', action: 'adjust', entity: 'stock', entityId: 'p1-loc1', details: 'Stock ajusté', createdAt: '2026-02-01T10:00:00.000Z' },
    ]

    const onlyUsers = filterAuditLogs(logs, { userIds: ['u1'] })
    expect(onlyUsers.map(l => l.id)).toEqual(['l1', 'l3'])

    const onlyActions = filterAuditLogs(logs, { actions: ['cancel'] })
    expect(onlyActions.map(l => l.id)).toEqual(['l2'])

    const onlyModules = filterAuditLogs(logs, { entities: ['stock'] })
    expect(onlyModules.map(l => l.id)).toEqual(['l3'])

    const byPeriod = filterAuditLogs(logs, { start: new Date('2026-01-01'), end: new Date('2026-01-31T23:59:59') })
    expect(byPeriod.map(l => l.id)).toEqual(['l1', 'l2'])

    const bySearch = filterAuditLogs(logs, { search: 'Annulation' })
    expect(bySearch.map(l => l.id)).toEqual(['l2'])

    const diff = extractOldNew(logs[0])
    expect(diff.old!.total).toBe('20000')
    expect(diff.new!.total).toBe('26700')

    expect(parseJsonData('not json')).toBeNull()
    expect(parseJsonData(undefined)).toBeNull()
  })

  it('11. attribution via authUserId : vente avec userId=auth_id rattachée au bon profil (divergence profils/auth)', () => {
    const authId = '0c04392b-xxxx'
    const owner: User = {
      id: 'prof-101', authUserId: authId, businessId: 'b1', name: 'Élise', email: 'elise@shop.com',
      loginId: 'elise', role: 'admin', permissions: ['*'], isActive: true,
      status: 'active', createdAt: new Date().toISOString(),
    } as any
    const stef: User = {
      id: 'prof-202', authUserId: undefined, businessId: 'b1', name: 'Stéphane', email: 'stef@shop.com',
      loginId: 'stef', role: 'staff', permissions: ['sales:create'], isActive: true,
      status: 'active', createdAt: new Date().toISOString(),
    } as any

    const s = sale({ id: 'sAuth1', userId: authId, total: 26700 })
    const stats = computeUserStats([s], [product], [owner, stef])

    const row = stats.find(r => r.userName === 'Élise')!
    expect(row).toBeDefined()
    expect(row.salesCount).toBe(1)
    expect(row.revenue).toBe(26700)
    expect(stats.some(r => r.userName === 'Stéphane' && r.salesCount === 0)).toBe(true)

    const resolved = resolveUser([owner, stef], authId)
    expect(resolved?.name).toBe('Élise')

    const byIndex = computeUserStats([s], [product], [owner])
    const ownerRow = byIndex.find(r => r.userId === 'prof-101')!
    expect(ownerRow.salesCount).toBe(1)
    expect(byIndex.find(r => r.userId === authId)).toBeUndefined()
  })

  it('12. un profil avec id + authUserId ne doit PAS apparaître en double (bug Lingerie Luxe)', () => {
    const authId = 'f61cebeb-xxxx'
    const owner: User = {
      id: 'prof-999', authUserId: authId, businessId: 'b1', name: 'Lingerie Luxe', email: 'owner@shop.com',
      loginId: 'owner', role: 'admin', permissions: ['*'], isActive: true,
      status: 'active', createdAt: new Date().toISOString(),
    } as any

    const stats = computeUserStats(
      [sale({ id: 'd1', userId: authId, total: 218700 }), sale({ id: 'd2', userId: authId, total: 218700 })],
      [product],
      [owner]
    )

    const rows = stats.filter(r => r.userName === 'Lingerie Luxe')
    expect(rows).toHaveLength(1)
    expect(rows[0].salesCount).toBe(2)
    expect(rows[0].revenue).toBe(437400)
  })
})