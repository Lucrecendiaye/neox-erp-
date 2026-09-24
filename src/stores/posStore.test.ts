import { describe, it, expect, beforeEach } from 'vitest'
import { usePosStore } from '@/stores/posStore'
import type { CartState } from '@/stores/posStore'

function cartWith(itemCount = 1, onHold = false): CartState {
  return {
    items: Array.from({ length: itemCount }, (_, i) => ({
      productId: `p${i}`,
      productName: `Produit ${i}`,
      quantity: 1,
      unitPrice: 100,
    })) as any,
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    discount: 0,
    onHold,
  }
}

beforeEach(() => {
  usePosStore.getState().clearCarts()
})

describe('posStore', () => {
  it('initialise 4 paniers vides avec l’index 0', () => {
    const s = usePosStore.getState()
    expect(s.carts).toHaveLength(4)
    expect(s.activeCartIndex).toBe(0)
    expect(s.carts.every(c => c.items.length === 0 && !c.onHold)).toBe(true)
  })

  it('setCarts met à jour les paniers via un updater', () => {
    usePosStore.getState().setCarts(prev =>
      prev.map((c, i) => (i === 0 ? { ...c, items: [{ productId: 'p1' }] as any, customerName: 'Ada' } : c))
    )
    const cart = usePosStore.getState().carts[0]
    expect(cart.items).toHaveLength(1)
    expect(cart.customerName).toBe('Ada')
  })

  it('conserve un panier en attente (simulation de changement d’onglet)', () => {
    usePosStore.getState().setCarts(prev =>
      prev.map((c, i) => (i === 2 ? { ...c, ...cartWith(1, true), customerName: 'Bobo' } : c))
    )
    usePosStore.getState().setActiveCartIndex(0)

    const held = usePosStore.getState().carts[2]
    expect(held.onHold).toBe(true)
    expect(held.items).toHaveLength(1)
    expect(held.customerName).toBe('Bobo')
    expect(usePosStore.getState().activeCartIndex).toBe(0)
  })

  it('clearCarts remet 4 paniers vides et l’index à 0', () => {
    usePosStore.getState().setCarts(prev => prev.map(c => ({ ...c, items: [{ productId: 'x' }] as any })))
    usePosStore.getState().setActiveCartIndex(3)
    usePosStore.getState().clearCarts()

    const s = usePosStore.getState()
    expect(s.carts.every(c => c.items.length === 0)).toBe(true)
    expect(s.activeCartIndex).toBe(0)
  })
})