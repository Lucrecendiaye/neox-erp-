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
const { processSale, recordCreditPayment } = await import('./operations')
const { processCashOperation } = await import('./cash')
const { getPeriodBounds, computeDashboardStats } = await import('./dashboardStats')
import type { Sale, Product } from '@/types'

function sale(over: Partial<Sale>): Sale {
  return {
    id: over.id || 'sale-' + Math.random().toString(36).slice(2, 10),
    businessId: 'b1',
    locationId: 'loc1',
    invoiceNumber: over.invoiceNumber || 'INV-TEST',
    customerId: 'cust1',
    customerName: 'Client A',
    items: [{
      productId: 'p1', productName: 'Riz', quantity: 2, unitPrice: 13350,
      unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 26700,
    }],
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

async function runStats() {
  const now = new Date()
  const bounds = getPeriodBounds('today', now)
  const sales = (await db.sales.toArray()).filter(s => s.businessId === 'b1')
  const products = (await db.products.toArray()).filter(p => p.businessId === 'b1')
  const credits = (await db.credits.toArray()).filter(c => c.businessId === 'b1')
  const creditPayments = (await db.creditPayments.toArray()).filter(p => p.businessId === 'b1')
  const cashBook = (await db.cashBook.toArray()).filter(e => e.businessId === 'b1')
  const cashOps = (await db.cashOps.toArray()).filter(o => o.businessId === 'b1')
  return computeDashboardStats(sales, products, credits, creditPayments, cashBook, cashOps, bounds, now)
}

beforeAll(async () => {
  useAppStore.getState().setUser({
    id: 'u1',
    businessId: 'b1',
    name: 'Testeur',
    loginId: 'test',
    role: 'admin',
    permissions: ['*'],
  } as any)
  useAppStore.getState().setCurrentBusiness({ id: 'b1', name: 'Biz' } as any)

  const product: Product = {
    id: 'p1',
    businessId: 'b1',
    name: 'Riz',
    photos: [],
    unit: 'piece',
    purchasePrice: 10000,
    sellingPrice: 13350,
    margin: 33.5,
    taxRate: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await db.products.add(product)
  await db.productStocks.add({
    id: 'stock-p1-loc1',
    businessId: 'b1',
    productId: 'p1',
    locationId: 'loc1',
    quantity: 500,
    stockAlert: 10,
    stockMin: 0,
    stockMax: 999999,
    updatedAt: new Date().toISOString(),
  })
})

describe('dashboard stats — règles métier (vente 26 700 FCFA)', () => {
  it('1. vente comptant : CA = total, encaissé = total, aucune créance', async () => {
    await db.sales.clear()
    await db.cashBook.clear()
    await db.cashOps.clear()
    await db.credits.clear()
    await db.creditPayments.clear()

    await processSale(sale({ id: 's1', invoiceNumber: 'INV-01' }))

    const stats = await runStats()
    expect(stats.revenue).toBe(26700)
    expect(stats.salesCount).toBe(1)
    expect(stats.collected).toBe(26700)
    expect(stats.grossProfit).toBe(6700)
    expect(stats.receivables.total).toBe(0)

    const entries = await db.cashBook.toArray()
    expect(entries.find(e => e.category === 'Encaissement vente' && e.amount === 26700)).toBeTruthy()
  })

  it('2. vente 100% crédit (paid 0) : CA = total, encaissé = 0, créance = total', async () => {
    await db.sales.clear()
    await db.cashBook.clear()
    await db.cashOps.clear()
    await db.credits.clear()
    await db.creditPayments.clear()

    await processSale(sale({ id: 's2', invoiceNumber: 'INV-02', paid: 0, paymentMethod: 'credit' }))

    const stats = await runStats()
    expect(stats.revenue).toBe(26700)
    expect(stats.collected).toBe(0)
    expect(stats.receivables.total).toBe(26700)
    expect(stats.receivables.count).toBe(1)

    const credit = (await db.credits.toArray())[0]
    expect(credit.balance).toBe(26700)
  })

  it('3. vente crédit partiel (acompte 9 000) : CA = 26 700, encaissé 9 000, créance 17 700', async () => {
    await db.sales.clear()
    await db.cashBook.clear()
    await db.cashOps.clear()
    await db.credits.clear()
    await db.creditPayments.clear()

    await processSale(sale({ id: 's3', invoiceNumber: 'INV-03', paid: 9000, paymentMethod: 'credit' }), { downPaymentMethod: 'cash' })

    const stats = await runStats()
    expect(stats.revenue).toBe(26700)
    expect(stats.collected).toBe(9000)
    expect(stats.receivables.total).toBe(17700)
    expect(stats.creditCollected).toBe(9000)
    expect(stats.grossProfit).toBe(6700)

    const cb = await db.cashBook.toArray()
    expect(cb.find(e => e.category === 'Acompte crédit' && e.amount === 9000)).toBeTruthy()
  })

  it('4. règlement crédit 17 700 : pas de nouvelle vente, encaissé total reçu, créance soldée', async () => {
    await db.sales.clear()
    await db.cashBook.clear()
    await db.cashOps.clear()
    await db.credits.clear()
    await db.creditPayments.clear()

    await processSale(sale({ id: 's4', invoiceNumber: 'INV-04', paid: 9000, paymentMethod: 'credit' }), { downPaymentMethod: 'cash' })
    const credit = (await db.credits.toArray())[0]

    const salesBefore = (await db.sales.toArray()).length
    await recordCreditPayment(credit.id, 17700, 'cash')

    const stats = await runStats()
    const salesAfter = (await db.sales.toArray()).length
    expect(salesAfter).toBe(salesBefore)
    expect(stats.revenue).toBe(26700)
    expect(stats.collected).toBe(26700)
    expect(stats.receivables.total).toBe(0)
    expect(stats.creditCollected).toBe(26700)

    const updatedSale = await db.sales.get('s4')
    expect(updatedSale!.paid).toBe(26700)

    const updatedCredit = await db.credits.get(credit.id)
    expect(updatedCredit!.balance).toBe(0)
    expect(updatedCredit!.status).toBe('paid')

    const entries = await db.cashBook.toArray()
    expect(entries.find(e => e.category === 'Encaissement crédit' && e.amount === 17700)).toBeTruthy()
  })

  it('5. entrée cash manuelle : CA et bénéfice brut inchangés, encaissé + montant', async () => {
    await db.sales.clear()
    await db.cashBook.clear()
    await db.cashOps.clear()
    await db.credits.clear()
    await db.creditPayments.clear()

    await processSale(sale({ id: 's5', invoiceNumber: 'INV-05' }))
    const statsBefore = await runStats()

    await processCashOperation({
      type: 'in', amount: 5000, categoryName: 'Autres entrées', paymentMethod: 'cash',
      date: new Date().toISOString().split('T')[0],
    })

    const statsAfter = await runStats()
    expect(statsAfter.revenue).toBe(statsBefore.revenue)
    expect(statsAfter.grossProfit).toBe(statsBefore.grossProfit)
    expect(statsAfter.collected).toBe(statsBefore.collected + 5000)
  })

  it('6. sortie cash « retrait » : le bénéfice net n’est pas impacté', async () => {
    await db.sales.clear()
    await db.cashBook.clear()
    await db.cashOps.clear()
    await db.credits.clear()
    await db.creditPayments.clear()

    await processSale(sale({ id: 's6', invoiceNumber: 'INV-06' }))
    const statsBefore = await runStats()

    await processCashOperation({
      type: 'out', amount: 2000, categoryName: 'Autres sorties', paymentMethod: 'cash',
      date: new Date().toISOString().split('T')[0], nature: 'retrait',
    })

    const statsAfter = await runStats()
    expect(statsAfter.treasury.charges).toBe(0)
    expect(statsAfter.netProfit).toBe(statsBefore.netProfit)
    expect(statsAfter.treasury.outflows).toBe(2000)
  })

  it('7. sortie cash « charge » : bénéfice net = brut − charges', async () => {
    await db.sales.clear()
    await db.cashBook.clear()
    await db.cashOps.clear()
    await db.credits.clear()
    await db.creditPayments.clear()

    await processSale(sale({ id: 's7', invoiceNumber: 'INV-07' }))
    const statsBefore = await runStats()

    await processCashOperation({
      type: 'out', amount: 2000, categoryName: 'Transport', paymentMethod: 'cash',
      date: new Date().toISOString().split('T')[0], nature: 'charge',
    })

    const statsAfter = await runStats()
    expect(statsAfter.treasury.charges).toBe(2000)
    expect(statsAfter.netProfit).toBe(statsBefore.grossProfit - 2000)
    expect(statsAfter.treasury.outflows).toBe(2000)
  })
})