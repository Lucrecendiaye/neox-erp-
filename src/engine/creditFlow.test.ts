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
const { processSale, recordCreditPayment, modifyCreditPayment, deleteCreditPayment, editSale } = await import('./operations')
import type { Sale, CashBookEntry } from '@/types'

async function getCreditForSale(saleId: string) {
  const all = await db.credits.toArray()
  return all.find(c => c.invoiceId === saleId)
}

beforeAll(() => {
  useAppStore.getState().setUser({
    id: 'u1',
    businessId: 'b1',
    name: 'Testeur',
    loginId: 'test',
    role: 'admin',
    permissions: ['*'],
  } as any)
  useAppStore.getState().setCurrentBusiness({ id: 'b1', name: 'Biz' } as any)
})

describe('credit flow — no re-dating, journal entries recorded', () => {
  it('keeps the sale on its original date and records an encaissement in the cash journal on payment date', async () => {
    const sale: Sale = {
      id: 'sale-credit-1',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-001',
      customerId: 'cust1',
      customerName: 'Client A',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 2, unitPrice: 5000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 10000 }],
      subtotal: 10000,
      discountTotal: 0,
      taxTotal: 0,
      total: 10000,
      paid: 0,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-01-05T10:00:00.000Z',
      userId: 'u1',
    }

    await processSale(sale)

    const credit = await getCreditForSale(sale.id)
    expect(credit).toBeTruthy()
    expect(credit!.balance).toBe(10000)

    const payment = await recordCreditPayment(credit!.id, 10000, 'cash')

    const updated = await db.sales.get(sale.id)
    expect(updated!.paid).toBe(10000)
    expect(updated!.createdAt).toBe(sale.createdAt)

    const updatedCredit = await db.credits.get(credit!.id)
    expect(updatedCredit!.balance).toBe(0)
    expect(updatedCredit!.status).toBe('paid')

    const entries = await db.cashBook.toArray()
    const encaissement = entries.find(e => e.linkedId === payment!.id)
    expect(encaissement).toBeTruthy()
    expect(encaissement!.type).toBe('in')
    expect(encaissement!.category).toBe('Encaissement crédit')
    expect(encaissement!.amount).toBe(10000)
    expect(encaissement!.date).toBe(payment!.date)
    expect(new Date(encaissement!.date).getTime()).toBeGreaterThan(new Date(sale.createdAt).getTime())
    expect(encaissement!.reference).toBe('INV-001')

    const modifications = await db.creditModifications.toArray()
    expect(modifications.some(m => m.creditId === credit!.id && m.field === 'payment')).toBe(true)
  })

  it('records the down payment (acompte) of a credit sale in the journal on the sale date', async () => {
    const sale: Sale = {
      id: 'sale-credit-acompte',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-003',
      customerId: 'cust3',
      customerName: 'Client C',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 20000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 20000 }],
      subtotal: 20000,
      discountTotal: 0,
      taxTotal: 0,
      total: 20000,
      paid: 5000,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-03-02T10:00:00.000Z',
      userId: 'u1',
    }
    await processSale(sale, { downPaymentMethod: 'cash' })

    const credit = await getCreditForSale(sale.id)
    expect(credit!.balance).toBe(15000)

    const entries = await db.cashBook.toArray()
    const acompte = entries.find(e => e.reference === 'INV-003' && e.category === 'Acompte crédit')
    expect(acompte).toBeTruthy()
    expect(acompte!.type).toBe('in')
    expect(acompte!.amount).toBe(5000)
    expect(acompte!.date).toBe(sale.createdAt)
  })

  it('handles partial payment then full settlement without moving the sale', async () => {
    const sale: Sale = {
      id: 'sale-credit-2',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-002',
      customerId: 'cust2',
      customerName: 'Client B',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 15000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 15000 }],
      subtotal: 15000,
      discountTotal: 0,
      taxTotal: 0,
      total: 15000,
      paid: 0,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-02-01T09:00:00.000Z',
      userId: 'u1',
    }
    await processSale(sale)
    const credit = (await getCreditForSale(sale.id))!

    await recordCreditPayment(credit.id, 5000, 'cash')
    let updated = await db.sales.get(sale.id)
    expect(updated!.paid).toBe(5000)
    expect(updated!.createdAt).toBe(sale.createdAt)

    await recordCreditPayment(credit.id, 10000, 'mobile')
    updated = await db.sales.get(sale.id)
    expect(updated!.paid).toBe(15000)
    expect(updated!.createdAt).toBe(sale.createdAt)

    const c = await db.credits.get(credit.id)
    expect(c!.status).toBe('paid')
  })

  it('rejects a payment larger than the remaining balance', async () => {
    const sale: Sale = {
      id: 'sale-credit-3',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-004',
      customerId: 'cust4',
      customerName: 'Client D',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 8000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 8000 }],
      subtotal: 8000,
      discountTotal: 0,
      taxTotal: 0,
      total: 8000,
      paid: 0,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-04-01T09:00:00.000Z',
      userId: 'u1',
    }
    await processSale(sale)
    const credit = (await getCreditForSale(sale.id))!
    await expect(recordCreditPayment(credit.id, 9999, 'cash')).rejects.toThrow(/solde/)
  })
})

describe('credit flow — modify and delete payments stay consistent', () => {
  it('modifying a payment updates sale, credit and the cash journal entry', async () => {
    const sale: Sale = {
      id: 'sale-credit-4',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-005',
      customerId: 'cust5',
      customerName: 'Client E',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 12000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 12000 }],
      subtotal: 12000,
      discountTotal: 0,
      taxTotal: 0,
      total: 12000,
      paid: 0,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-05-01T09:00:00.000Z',
      userId: 'u1',
    }
    await processSale(sale)
    const credit = (await getCreditForSale(sale.id))!
    const payment = await recordCreditPayment(credit.id, 7000, 'cash')

    await modifyCreditPayment(payment!.id, 9000, 'mobile')

    const updatedSale = await db.sales.get(sale.id)
    expect(updatedSale!.paid).toBe(9000)
    const updatedCredit = await db.credits.get(credit.id)
    expect(updatedCredit!.balance).toBe(3000)

    const entries = await db.cashBook.toArray()
    const enc = entries.find(e => e.linkedId === payment!.id)
    expect(enc!.amount).toBe(9000)
    expect(enc!.paymentMethod).toBe('mobile')
  })

  it('deleting a payment reverses sale, credit and removes the journal entry', async () => {
    const sale: Sale = {
      id: 'sale-credit-5',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-006',
      customerId: 'cust6',
      customerName: 'Client F',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 10000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 10000 }],
      subtotal: 10000,
      discountTotal: 0,
      taxTotal: 0,
      total: 10000,
      paid: 0,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-06-01T09:00:00.000Z',
      userId: 'u1',
    }
    await processSale(sale)
    const credit = (await getCreditForSale(sale.id))!
    const payment = await recordCreditPayment(credit.id, 4000, 'cash')

    await deleteCreditPayment(payment!.id)

    const updatedSale = await db.sales.get(sale.id)
    expect(updatedSale!.paid).toBe(0)
    const updatedCredit = await db.credits.get(credit.id)
    expect(updatedCredit!.balance).toBe(10000)
    expect(updatedCredit!.status).toBe('active')

    const entries = await db.cashBook.toArray()
    expect(entries.find(e => e.linkedId === payment!.id)).toBeFalsy()
  })
})

describe('credit flow — editing a credit sale', () => {
  it('blocks reducing the total below the already-paid amount', async () => {
    const sale: Sale = {
      id: 'sale-credit-6',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-007',
      customerId: 'cust7',
      customerName: 'Client G',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 20000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 20000 }],
      subtotal: 20000,
      discountTotal: 0,
      taxTotal: 0,
      total: 20000,
      paid: 0,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-07-01T09:00:00.000Z',
      userId: 'u1',
    }
    await processSale(sale)
    const credit = (await getCreditForSale(sale.id))!
    await recordCreditPayment(credit.id, 15000, 'cash')

    await expect(editSale(sale.id, {
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 5000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 5000 }],
      total: 5000,
    })).rejects.toThrow(/inférieur/)

    const unchanged = await db.sales.get(sale.id)
    expect(unchanged!.total).toBe(20000)
    expect(unchanged!.paid).toBe(15000)
  })

  it('keeps the linked credit consistent after a valid edit', async () => {
    const sale: Sale = {
      id: 'sale-credit-7',
      businessId: 'b1',
      locationId: 'loc1',
      invoiceNumber: 'INV-008',
      customerId: 'cust8',
      customerName: 'Client H',
      items: [{ productId: 'p1', productName: 'Riz', quantity: 1, unitPrice: 10000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 10000 }],
      subtotal: 10000,
      discountTotal: 0,
      taxTotal: 0,
      total: 10000,
      paid: 0,
      change: 0,
      paymentMethod: 'credit',
      status: 'completed',
      createdAt: '2026-08-01T09:00:00.000Z',
      userId: 'u1',
    }
    await processSale(sale)
    const credit = (await getCreditForSale(sale.id))!

    await editSale(sale.id, {
      items: [{ productId: 'p1', productName: 'Riz', quantity: 2, unitPrice: 10000, unitName: 'Sac', unitQuantity: 1, discount: 0, taxRate: 0, total: 20000 }],
      subtotal: 20000,
      discountTotal: 0,
      taxTotal: 0,
      total: 20000,
    })

    const updatedSale = await db.sales.get(sale.id)
    expect(updatedSale!.total).toBe(20000)
    const updatedCredit = await db.credits.get(credit.id)
    expect(updatedCredit!.amount).toBe(20000)
    expect(updatedCredit!.balance).toBe(20000)

    const mods = await db.creditModifications.toArray()
    expect(mods.some(m => m.creditId === credit.id && m.field === 'sale_edit')).toBe(true)
  })
})
