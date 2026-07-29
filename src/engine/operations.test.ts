import { describe, it, expect } from 'vitest'
import type { SupplierInvoice, SupplierInvoiceItem, Compensation, CompensationItem, Transfer, TransferItem } from './types'

describe('SupplierInvoice type', () => {
  it('can calculate balance', () => {
    const invoice: SupplierInvoice = {
      id: 'inv-1',
      businessId: 'biz-1',
      supplierId: 'sup-1',
      number: 'FAC-001',
      items: [],
      subtotal: 10000,
      taxTotal: 1800,
      total: 11800,
      paid: 5000,
      balance: 6800,
      status: 'partial',
      payments: [],
      createdAt: new Date().toISOString(),
      userId: 'user-1',
    }
    expect(invoice.total).toBe(11800)
    expect(invoice.paid).toBe(5000)
    expect(invoice.balance).toBe(6800)
    expect(invoice.status).toBe('partial')
  })
})

describe('Compensation type', () => {
  it('can track debt to goods', () => {
    const items: CompensationItem[] = [
      { productId: 'p1', productName: 'Riz', quantity: 10, unitPrice: 500, total: 5000 },
    ]
    const comp: Compensation = {
      id: 'comp-1',
      businessId: 'biz-1',
      partyId: 'sup-1',
      partyType: 'supplier',
      direction: 'debt_to_goods',
      referenceInvoiceId: 'inv-1',
      amount: 10000,
      items,
      settledAmount: 5000,
      balance: 5000,
      status: 'completed',
      createdAt: new Date().toISOString(),
      userId: 'user-1',
    }
    expect(comp.settledAmount).toBe(5000)
    expect(comp.balance).toBe(5000)
    expect(comp.direction).toBe('debt_to_goods')
  })
})

describe('Transfer type', () => {
  it('can track items between locations', () => {
    const items: TransferItem[] = [
      { productId: 'p1', productName: 'Riz', quantity: 5 },
      { productId: 'p2', productName: 'Huile', quantity: 3 },
    ]
    const transfer: Transfer = {
      id: 'tr-1',
      businessId: 'biz-1',
      fromLocationId: 'loc-1',
      toLocationId: 'loc-2',
      items,
      status: 'completed',
      createdAt: new Date().toISOString(),
      userId: 'user-1',
    }
    expect(transfer.items.length).toBe(2)
    expect(transfer.fromLocationId).toBe('loc-1')
    expect(transfer.toLocationId).toBe('loc-2')
    expect(transfer.status).toBe('completed')
  })
})
