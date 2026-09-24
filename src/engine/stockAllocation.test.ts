import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/supabase', () => ({ isSupabaseConfigured: () => false, supabase: null }))

import db, { initDB } from '@/db'
import type { Product, Sale } from '@/types'

;(globalThis as any).window = { innerWidth: 1024 }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: { _s: {} as any, getItem(k: string) { return this._s[k] ?? null }, setItem(k: string, v: string) { this._s[k] = v }, removeItem(k: string) { delete this._s[k] } }, configurable: true })

const { useAppStore } = await import('@/stores/appStore')
const { allocateSaleItems } = await import('./stockAllocation')
const { processSale, editSale, deleteSale } = await import('./operations')
const { restore } = await import('@/lib/softDelete')
const { createDelivery, validateDelivery } = await import('./deliveries')

const shop = 'shop-1'
const depot1 = 'depot-1'
const depot2 = 'depot-2'
const businessId = 'allocation-biz'

const item = (quantity: number) => ({
  productId: 'p1', productName: 'Parfum X', quantity, unitPrice: 1000,
  discount: 0, taxRate: 0, total: quantity * 1000,
})

async function seedStocks(shopQty: number, depot1Qty = 0, depot2Qty = 0) {
  const now = new Date().toISOString()
  const product: Product = {
    id: 'p1', businessId, name: 'Parfum X', photos: [], unit: 'piece',
    purchasePrice: 500, sellingPrice: 1000, wholesalePrice: 1000, margin: 50,
    taxRate: 0, status: 'active', createdAt: now, updatedAt: now,
  }
  await db.products.put(product)
  await db.locations.bulkPut([
    { id: shop, businessId, name: 'Boutique', type: 'shop', isActive: true, createdAt: now, updatedAt: now },
    { id: depot1, businessId, name: 'Depot 1', type: 'warehouse', isActive: true, createdAt: now, updatedAt: now },
    { id: depot2, businessId, name: 'Depot 2', type: 'warehouse', isActive: true, createdAt: now, updatedAt: now },
  ] as any)
  await db.productStocks.bulkPut([
    { id: 's1', businessId, productId: 'p1', locationId: shop, quantity: shopQty, stockAlert: 0, stockMin: 0, stockMax: 999, updatedAt: now },
    { id: 's2', businessId, productId: 'p1', locationId: depot1, quantity: depot1Qty, stockAlert: 0, stockMin: 0, stockMax: 999, updatedAt: now },
    { id: 's3', businessId, productId: 'p1', locationId: depot2, quantity: depot2Qty, stockAlert: 0, stockMin: 0, stockMax: 999, updatedAt: now },
  ] as any)
}

async function stock(locationId: string) {
  return (await db.productStocks.get({ productId: 'p1', locationId }))?.quantity || 0
}

function sale(id: string, quantity: number): Sale {
  return {
    id, businessId, locationId: shop, invoiceNumber: id, items: [item(quantity)],
    subtotal: quantity * 1000, discountTotal: 0, taxTotal: 0, total: quantity * 1000,
    paid: 0, change: 0, paymentMethod: 'cash', status: 'completed', createdAt: new Date().toISOString(), userId: 'u1',
  }
}

beforeEach(async () => {
  await db.delete()
  await initDB()
  useAppStore.getState().setUser({ id: 'u1', businessId, name: 'Test', loginId: 'test', role: 'admin', permissions: ['*'] } as any)
  useAppStore.getState().setCurrentBusiness({ id: businessId, name: 'Test' } as any)
})

describe('allocation Boutique puis Depot', () => {
  it('1. utilise uniquement la boutique quand elle couvre la vente', async () => {
    await seedStocks(20, 50)
    const result = await allocateSaleItems([item(5)], businessId, shop)
    expect(result).toHaveLength(1)
    expect(result[0].locationId).toBe(shop)
    expect(result[0].quantity).toBe(5)
  })

  it('2. repartit la vente entre boutique et depot selectionne', async () => {
    await seedStocks(2, 50)
    const result = await allocateSaleItems([item(5)], businessId, shop, { p1: depot1 })
    expect(result.map(x => [x.locationId, x.quantity])).toEqual([[shop, 2], [depot1, 3]])
  })

  it('3. utilise directement le depot quand la boutique est vide', async () => {
    await seedStocks(0, 50)
    const result = await allocateSaleItems([item(5)], businessId, shop, { p1: depot1 })
    expect(result).toHaveLength(1)
    expect(result[0].locationId).toBe(depot1)
    expect(result[0].quantity).toBe(5)
  })

  it('4. respecte le depot choisi parmi plusieurs depots', async () => {
    await seedStocks(2, 1, 20)
    const result = await allocateSaleItems([item(5)], businessId, shop, { p1: depot2 })
    expect(result.map(x => [x.locationId, x.quantity])).toEqual([[shop, 2], [depot2, 3]])
  })

  it('5. deduit les sources reelles et les recalcule lors dune modification', async () => {
    await seedStocks(2, 10)
    const created = sale('sale-edit', 5)
    await processSale(created, { sourceSelections: { p1: depot1 } })
    expect(await stock(shop)).toBe(0)
    expect(await stock(depot1)).toBe(7)

    await editSale(created.id, { items: [item(4)] })
    expect(await stock(shop)).toBe(0)
    expect(await stock(depot1)).toBe(8)
  })

  it('6. supprime puis restaure une vente sans perdre sa repartition', async () => {
    await seedStocks(2, 10)
    const created = sale('sale-restore', 5)
    await processSale(created, { sourceSelections: { p1: depot1 } })
    await deleteSale(created.id)
    expect(await stock(shop)).toBe(2)
    expect(await stock(depot1)).toBe(10)

    await restore('sales', created.id)
    expect(await stock(shop)).toBe(0)
    expect(await stock(depot1)).toBe(7)
  })

  it('7. applique la meme repartition a une vente a livraison', async () => {
    await seedStocks(2, 10)
    const delivery = await createDelivery({
      locationId: shop, customerName: 'Client livraison', items: [item(5)],
      deliveryFeeClient: 0, deliveryFeeShop: 0, discount: 0, paymentMethod: 'cash', advance: 0,
    } as any)
    const validated = await validateDelivery(delivery.id, { p1: depot1 })
    expect(await stock(shop)).toBe(0)
    expect(await stock(depot1)).toBe(7)
    expect(validated.items.map(x => [x.locationId, x.quantity])).toEqual([[shop, 2], [depot1, 3]])
  })
})
