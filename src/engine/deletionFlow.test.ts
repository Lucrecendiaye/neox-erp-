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
const { processSale, deleteSale, cancelSale, deleteCreditPayment, recordCreditPayment } = await import('./operations')
import type { Sale } from '@/types'

beforeAll(async () => {
  useAppStore.getState().setUser({ id: 'u1', businessId: 'b1', name: 'Testeur', loginId: 'test', role: 'admin', permissions: ['*'] } as any)
  useAppStore.getState().setCurrentBusiness({ id: 'b1', name: 'Biz' } as any)
  await db.settings.put({ id: 'default', name: 'Test', currency: 'XOF', currencySymbol: 'FCFA', currencies: [], locale: 'fr', language: 'fr', timezone: 'UTC', taxRate: 0, invoicePrefix: 'FAC-', invoiceNextNumber: 1, deliveryPrefix: 'VL-', deliveryNextNumber: 1 } as any)
  await db.productStocks.add({ id: 's1', businessId: 'b1', productId: 'p1', locationId: 'loc1', quantity: 100, stockAlert: 5, stockMin: 0, stockMax: 999, updatedAt: new Date().toISOString() } as any)
  await db.products.add({ id: 'p1', businessId: 'b1', name: 'Produit A', photos: [], unit: 'piece', purchasePrice: 100, sellingPrice: 200, margin: 50, taxRate: 0, status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any)
  await db.customers.add({ id: 'c1', businessId: 'b1', name: 'Client A', phone: '700000000', email: '', address: '', creditLimit: 0, currentBalance: 0, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any)
})

function makeSale(total: number, paid: number): Sale {
  return {
    id: 'sale-' + Math.random().toString(36).slice(2, 9),
    businessId: 'b1', locationId: 'loc1', invoiceNumber: 'FAC-00001',
    customerId: 'c1', customerName: 'Client A', customerPhone: '700000000',
    items: [{ productId: 'p1', productName: 'Produit A', quantity: total / 200, unitPrice: 200, discount: 0, taxRate: 0, total }],
    subtotal: total, discountTotal: 0, taxTotal: 0, total, paid, change: 0,
    paymentMethod: total > paid ? 'credit' : 'cash', status: 'completed', createdAt: new Date().toISOString(), userId: 'u1',
  }
}

describe('Suppressions (les pages appellent ces fonctions)', () => {
  it('deleteSale avec crédit lié ne lève pas', async () => {
    const sale = makeSale(10000, 4000)
    await processSale(sale)
    const credits = await db.credits.toArray()
    expect(credits.length).toBe(1)
    let err: string | null = null
    try { await deleteSale(sale.id) } catch (e: any) { err = e.message }
    expect(err).toBeNull()
    expect(await db.sales.get(sale.id)).toBeUndefined()
  })

  it('cancelSale ne lève pas', async () => {
    const sale = makeSale(5000, 5000)
    await processSale(sale)
    let err: string | null = null
    try { await cancelSale(sale.id) } catch (e: any) { err = e.message }
    expect(err).toBeNull()
  })

  it('deleteCreditPayment (paiement) ne lève pas', async () => {
    const sale = makeSale(8000, 2000)
    await processSale(sale)
    const credits = await db.credits.toArray()
    const credit = credits.find(c => c.invoiceId === sale.id)!
    await recordCreditPayment(credit.id, 1000, 'cash')
    const payments = await db.creditPayments.where({ creditId: credit.id }).toArray()
    expect(payments.length).toBeGreaterThanOrEqual(1)
    const target = payments[payments.length - 1]
    expect(target.amount).toBe(1000)
    let err: string | null = null
    try { await deleteCreditPayment(target.id) } catch (e: any) { err = e.message }
    expect(err).toBeNull()
    expect(await db.creditPayments.get(target.id)).toBeUndefined()
  })
})
