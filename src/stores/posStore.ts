import { create } from 'zustand'
import type { SaleItem } from '@/types'

export interface CartState {
  items: SaleItem[]
  customerId: string
  customerName: string
  customerPhone: string
  customerAddress: string
  discount: number
  onHold: boolean
}

export function emptyCart(): CartState {
  return {
    items: [],
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    discount: 0,
    onHold: false,
  }
}

const NUM_CARTS = 4

interface PosState {
  carts: CartState[]
  activeCartIndex: number
  setCarts: (fn: (prev: CartState[]) => CartState[]) => void
  setActiveCartIndex: (idx: number) => void
  clearCarts: () => void
}

export const usePosStore = create<PosState>((set) => ({
  carts: Array.from({ length: NUM_CARTS }, () => emptyCart()),
  activeCartIndex: 0,

  setCarts: (fn) => set((s) => ({ carts: fn(s.carts) })),
  setActiveCartIndex: (idx) => set({ activeCartIndex: idx }),
  clearCarts: () =>
    set({
      carts: Array.from({ length: NUM_CARTS }, () => emptyCart()),
      activeCartIndex: 0,
    }),
}))