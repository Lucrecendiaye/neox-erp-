import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: null,
}))

;(globalThis as any).window = { innerWidth: 1024 }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: { _s: {} as any, getItem(k: string) { return this._s[k] ?? null }, setItem(k: string, v: string) { this._s[k] = v }, removeItem(k: string) { delete this._s[k] } }, configurable: true })

const { useAppStore } = await import('@/stores/appStore')
const { initDB, default: db } = await import('@/db')
const {
  createDelivery, editDraft, validateDelivery, markDelivered, failDelivery,
  cancelDelivery, deleteDelivery, assignCourier,
} = await import('./deliveries')
import type { NewDeliveryInput } from './deliveries'
import type { Delivery, Product } from '@/types'

function setUser(id: string, permissions: string[]) {
  useAppStore.getState().setUser({ id, businessId: 'b1', name: `User-${id}`, loginId: id, role: 'staff', permissions } as any)
  useAppStore.getState().setCurrentBusiness({ id: 'b1', name: 'Biz' } as any)
}

async function seedProduct(id: string, name: string, qty: number, price: number) {
  const prod: Product = {
    id, businessId: 'b1', name, photos: [], unit: 'piece',
    purchasePrice: Math.round(price * 0.7), sellingPrice: price, wholesalePrice: price,
    margin: 30, taxRate: 0, status: 'active',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }
  await db.products.put(prod)
  await db.productStocks.put({
    id: `stk-${id}-loc1`, businessId: 'b1', productId: id, locationId: 'loc1',
    quantity: qty, stockAlert: 0, stockMin: 0, stockMax: 999,
    updatedAt: new Date().toISOString(),
  })
}

async function stockOf(productId: string): Promise<number> {
  const rec = (await db.productStocks.toArray()).find(s => s.productId === productId && s.locationId === 'loc1')
  return rec?.quantity ?? 0
}

const itemP1 = { productId: 'p1', productName: 'Riz', quantity: 2, unitPrice: 1000 }

function baseInput(over: Partial<NewDeliveryInput> = {}): NewDeliveryInput {
  return {
    locationId: 'loc1',
    customerName: 'Client A',
    customerPhone: '+22600000000',
    customerAddress: 'Quartier A, rue 12',
    items: [itemP1],
    deliveryFeeClient: 0,
    deliveryFeeShop: 0,
    discount: 0,
    paymentMethod: 'cash',
    advance: 0,
    ...over,
  }
}

async function makeDraft(over: Partial<NewDeliveryInput> = {}): Promise<Delivery> {
  return createDelivery(baseInput(over))
}

function cashIn(category: string) {
  return db.cashBook.filter(e => e.type === 'in' && e.category === category).toArray()
}
function cashOut(category: string) {
  return db.cashBook.filter(e => e.type === 'out' && e.category === category).toArray()
}

beforeEach(async () => {
  await db.delete()
  await initDB()
  setUser('u1', ['*'])
  await seedProduct('p1', 'Riz', 50, 1000)
})

describe('Vente à livraison (engine)', () => {
  it('1. crée un brouillon avec numéro VL-… et aucun impact stock/vente', async () => {
    const d = await makeDraft()
    expect(d.status).toBe('draft')
    expect(d.number).toMatch(/^VL-\d{5}$/)
    expect(d.total).toBe(2000)
    expect(await db.sales.count()).toBe(0)
    expect(await stockOf('p1')).toBe(50)
    expect(d.paymentStatus).toBe('pending')
  })

  it('2. validation → UNE seule vente, stock déduit une fois, CA complet', async () => {
    const d = await makeDraft()
    await validateDelivery(d.id)
    const sales = (await db.sales.toArray()).filter(s => s.businessId === 'b1')
    expect(sales.length).toBe(1)
    expect(sales[0].status).toBe('completed')
    expect(sales[0].invoiceNumber).toMatch(/^FAC-\d{5}$/)
    expect(await stockOf('p1')).toBe(48)
    const after = await db.deliveries.get(d.id)
    expect(after!.status).toBe('validated')
    expect(after!.saleId).toBe(sales[0].id)
  })

  it('3. impossible de valider deux fois', async () => {
    const d = await makeDraft()
    await validateDelivery(d.id)
    await expect(validateDelivery(d.id)).rejects.toThrow(/déjà été validée/)
    const sales = (await db.sales.toArray()).filter(s => s.businessId === 'b1')
    expect(sales.length).toBe(1)
  })

  it('4. COD : validation sans paiement, puis livrée + encaissement à la livraison', async () => {
    const d = await makeDraft()
    const validated = await validateDelivery(d.id)
    const sale = await db.sales.get(validated.saleId!)
    expect(sale!.paid).toBe(0)
    expect(sale!.paymentStatus).toBe('unpaid')
    expect((await cashIn('Encaissement vente')).length).toBe(0)

    const delivered = await markDelivered(d.id, { amount: 2000, method: 'wave' })
    expect(delivered.status).toBe('delivered')
    expect(delivered.paymentStatus).toBe('full')
    const saleAfter = await db.sales.get(validated.saleId!)
    expect(saleAfter!.paid).toBe(2000)
    expect(saleAfter!.paymentStatus).toBe('paid')
    const entries = await cashIn('Encaissement livraison')
    expect(entries.length).toBe(1)
    expect(entries[0].amount).toBe(2000)
  })

  it('5. double encaissement bloqué (solde dépassé)', async () => {
    const d = await makeDraft()
    await validateDelivery(d.id)
    await markDelivered(d.id, { amount: 2000, method: 'cash' })
    await expect(markDelivered(d.id, { amount: 1, method: 'cash' })).rejects.toThrow(/déjà marquée livrée/)

    const d2 = await makeDraft()
    await expect(markDelivered(d2.id, { amount: 3000, method: 'cash' })).rejects.toThrow(/dépasse le solde/)
  })

  it('6. payée d’avance intégralement → prepaid + trésorerie + vente payée', async () => {
    const d = await makeDraft({ advance: 2000, paymentMethod: 'wave' })
    expect(d.paymentStatus).toBe('prepaid')
    const validated = await validateDelivery(d.id)
    const sale = await db.sales.get(validated.saleId!)
    expect(sale!.paid).toBe(2000)
    expect(sale!.paymentStatus).toBe('paid')
    expect((await cashIn('Encaissement vente')).length).toBe(1)
    expect(d.paymentStatus).toBe('prepaid')
  })

  it('7. frais de livraison : la part client ne gonfle pas le CA boutique, part boutique non déduite de la caisse', async () => {
    const d = await makeDraft({ deliveryFeeClient: 5000, deliveryFeeShop: 3000 })
    expect(d.deliveryFee).toBe(8000)
    expect(d.total).toBe(7000)
    const validated = await validateDelivery(d.id)
    const sale = await db.sales.get(validated.saleId!)
    // Le CA entreprise ne compte que les produits : le frais client appartient au livreur.
    expect(sale!.total).toBe(2000)
    expect(sale!.subtotal).toBe(2000)
    const fees = await cashOut('Frais de livraison')
    expect(fees.length).toBe(0)
  })

  it('8. acompte partiel puis solde encaissé à la livraison', async () => {
    const d = await makeDraft({ deliveryFeeClient: 13000, advance: 5000 })
    expect(d.total).toBe(15000)
    expect(d.paymentStatus).toBe('partial')
    const validated = await validateDelivery(d.id)
    const sale = await db.sales.get(validated.saleId!)
    // La vente (CA boutique) ne retient que les produits ; le frais client reste au livreur.
    expect(sale!.total).toBe(2000)
    expect(sale!.paid).toBe(2000)
    expect(sale!.paymentStatus).toBe('paid')
    expect((await cashIn('Encaissement vente')).length).toBe(1)

    // Le solde restant (10000) couvre surtout le frais client : il n'entre pas dans la caisse.
    const delivered = await markDelivered(d.id, { amount: 10000, method: 'cash' })
    expect(delivered.paymentStatus).toBe('full')
    const saleAfter = await db.sales.get(validated.saleId!)
    expect(saleAfter!.paid).toBe(2000)
    expect(saleAfter!.paymentStatus).toBe('paid')
    expect((await cashIn('Encaissement livraison')).length).toBe(0)
  })

  it('9. échec/refus → stock retourné une seule fois, pas de double retour', async () => {
    const d = await makeDraft()
    await validateDelivery(d.id)
    const failed = await failDelivery(d.id, 'Client absent')
    expect(failed.status).toBe('failed')
    expect(failed.stockReturned).toBe(true)
    expect(await stockOf('p1')).toBe(50)
    await expect(failDelivery(d.id, 'Client absent')).rejects.toThrow(/en échec/)
    expect(await stockOf('p1')).toBe(50)
  })

  it('10. annulation après validation → stock retourné + remboursement avance + vente annulée', async () => {
    const d = await makeDraft({ advance: 2000 })
    const validated = await validateDelivery(d.id)
    const cancelled = await cancelDelivery(d.id, 'Plus besoin')
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.refund).toBe(2000)
    expect(await stockOf('p1')).toBe(50)
    const refunds = await cashOut('Remboursements')
    expect(refunds.length).toBe(1)
    expect(refunds[0].amount).toBe(2000)
    const sale = await db.sales.get(validated.saleId!)
    expect(sale!.status).toBe('cancelled')
  })

  it('11. permissions : un simple vendeur ne peut ni créer ni valider', async () => {
    setUser('u2', ['sales:view'])
    await expect(makeDraft()).rejects.toThrow(/deliveries:create/)
  })

  it('12. un livreur ne traite que ses propres livraisons', async () => {
    const d = await makeDraft({ advance: 1000, courierId: 'u1' })
    await validateDelivery(d.id)
    setUser('u2', ['deliveries:view', 'deliveries:edit'])
    await expect(markDelivered(d.id, { amount: 1000, method: 'cash' })).rejects.toThrow(/ne vous est pas assignée/)
    setUser('u1', ['*'])
    const ok = await markDelivered(d.id, { amount: 1000, method: 'cash' })
    expect(ok.status).toBe('delivered')
  })

  it('13. assigner un livreur met à jour le nom', async () => {
    await db.users.put({ id: 'c1', businessId: 'b1', name: 'Karim', email: 'k@x', loginId: 'k', role: 'staff', permissions: [], isActive: true } as any)
    const d = await makeDraft()
    const assigned = await assignCourier(d.id, 'c1')
    expect(assigned.courierId).toBe('c1')
    expect(assigned.courierName).toBe('Karim')
  })

  it('14. suppression : seul un brouillon peut être supprimé', async () => {
    const draft = await makeDraft()
    await deleteDelivery(draft.id)
    expect(await db.deliveries.get(draft.id)).toBeUndefined()

    const d2 = await makeDraft()
    await validateDelivery(d2.id)
    await expect(deleteDelivery(d2.id)).rejects.toThrow(/brouillon/)
  })

  it('15. modifier un brouillon recalcule les totaux', async () => {
    const d = await makeDraft()
    const updated = await editDraft(d.id, baseInput({ items: [{ ...itemP1, quantity: 5 }], deliveryFeeClient: 1000 }))
    expect(updated.total).toBe(6000)
    expect(updated.subtotal).toBe(5000)
    expect(updated.number).toBe(d.number)
  })
})