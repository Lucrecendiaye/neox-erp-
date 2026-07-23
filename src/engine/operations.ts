import db from '@/db'
import { generateId } from '@/lib/utils'
import type {
  Location, ProductStock, ProductHistory, ProductHistoryAction,
  SupplierInvoice, SupplierInvoiceItem, SupplierPayment, PaymentLine,
  Compensation, CompensationItem, Transfer, TransferItem,
} from './types'
import type { Sale, SaleItem, StockMovement, Purchase, AccountingEntry, AuditLog } from '@/types'

const BIZ = 'biz-default'
const USER = 'admin'

function now() { return new Date().toISOString() }

async function getStock(productId: string, locationId: string): Promise<number> {
  const record = await db.productStocks.get({ productId, locationId })
  return record?.quantity || 0
}

async function ensureStockRecord(productId: string, locationId: string) {
  const existing = await db.productStocks.get({ productId, locationId })
  if (!existing) {
    await db.productStocks.add({
      id: generateId(),
      businessId: BIZ,
      productId,
      locationId,
      quantity: 0,
      stockAlert: 10,
      stockMin: 0,
      stockMax: 999999,
      updatedAt: now(),
    })
  }
}

async function adjustStock(productId: string, locationId: string, delta: number, action: ProductHistoryAction, reference?: string, comment?: string) {
  await ensureStockRecord(productId, locationId)
  const record = await db.productStocks.get({ productId, locationId })!
  const before = record!.quantity
  const after = before + delta
  await db.productStocks.update(record!.id, { quantity: after, updatedAt: now() })
  await db.productHistory.add({
    id: generateId(),
    businessId: BIZ,
    productId,
    locationId,
    action,
    quantityBefore: before,
    quantityAfter: after,
    userId: USER,
    reference,
    comment,
    createdAt: now(),
  })
}

async function audit(action: string, entity: string, entityId: string, details?: string) {
  await db.auditLogs.add({
    id: generateId(),
    businessId: BIZ,
    userId: USER,
    action,
    entity,
    entityId,
    details,
    createdAt: now(),
  })
}

export async function processSale(sale: Sale) {
  const locationId = sale.locationId
  for (const item of sale.items) {
    await adjustStock(item.productId, locationId, -item.quantity, 'sold', sale.invoiceNumber, `Vente #${sale.invoiceNumber}`)
  }
  await db.sales.add(sale)
  await audit('create', 'sale', sale.id, `Vente ${sale.invoiceNumber} - ${sale.total} FCFA`)
}

export async function processPurchase(purchase: Purchase) {
  const locationId = purchase.locationId
  for (const item of purchase.items) {
    await adjustStock(item.productId, locationId, item.quantity, 'purchased', purchase.id, `Achat #${purchase.id}`)
  }
  await db.purchases.add(purchase)
  await audit('create', 'purchase', purchase.id, `Achat ${purchase.total} FCFA`)
}

export async function processTransfer(transfer: Transfer) {
  transfer.id = transfer.id || generateId()
  transfer.businessId = BIZ
  transfer.createdAt = now()
  transfer.userId = USER
  transfer.status = 'completed'

  for (const item of transfer.items) {
    const fromQty = await getStock(item.productId, transfer.fromLocationId)
    if (fromQty < item.quantity) throw new Error(`Stock insuffisant pour ${item.productName} dans l'emplacement source`)
    await adjustStock(item.productId, transfer.fromLocationId, -item.quantity, 'transferred_out', transfer.id, `Transfert vers ${transfer.toLocationId}`)
    await adjustStock(item.productId, transfer.toLocationId, item.quantity, 'transferred_in', transfer.id, `Transfert depuis ${transfer.fromLocationId}`)
  }

  await db.transfers.add(transfer)
  await audit('create', 'transfer', transfer.id, `Transfert ${transfer.fromLocationId} → ${transfer.toLocationId}`)
  return transfer
}

export async function processStockAdjustment(productId: string, locationId: string, newQty: number, note?: string) {
  const current = await getStock(productId, locationId)
  const delta = newQty - current
  await adjustStock(productId, locationId, delta, 'adjusted', undefined, note || `Ajustement de ${current} à ${newQty}`)
  await audit('adjust', 'stock', `${productId}-${locationId}`, `Stock ajusté: ${current} → ${newQty}`)
}

export async function processSupplierInvoice(invoice: SupplierInvoice) {
  invoice.id = invoice.id || generateId()
  invoice.businessId = BIZ
  invoice.createdAt = now()
  invoice.userId = USER
  invoice.status = invoice.total <= invoice.paid ? 'paid' : invoice.paid > 0 ? 'partial' : 'credit'
  invoice.balance = invoice.total - invoice.paid

  const locationId = invoice.items[0] ? await getDefaultLocation() : 'loc-shop'

  for (const item of invoice.items) {
    const existing = await db.products.get(item.productId)
    if (existing) {
      await adjustStock(item.productId, locationId, item.quantity, 'supplier_entry', invoice.number, `Entrée fournisseur #${invoice.number}`)
    }
  }

  await db.supplierInvoices.add(invoice)
  await audit('create', 'supplier_invoice', invoice.id, `Facture fournisseur #${invoice.number} - ${invoice.total} FCFA`)
}

async function getDefaultLocation(): Promise<string> {
  const loc = await db.locations.where('type').equals('shop').first()
  return loc?.id || 'loc-shop'
}

export async function processCompensation(comp: Compensation) {
  comp.id = comp.id || generateId()
  comp.businessId = BIZ
  comp.createdAt = now()
  comp.userId = USER
  comp.status = 'completed'

  let totalValue = 0
  const locationId = await getDefaultLocation()

  if (comp.direction === 'debt_to_goods') {
    for (const item of comp.items) {
      await adjustStock(item.productId, locationId, item.quantity, 'supplier_entry', comp.referenceInvoiceId, `Compensation: ${item.productName}`)
      totalValue += item.total
    }
  } else {
    for (const item of comp.items) {
      await adjustStock(item.productId, locationId, -item.quantity, 'supplier_exit', comp.referenceInvoiceId, `Compensation sortie: ${item.productName}`)
      totalValue += item.total
    }
  }

  comp.settledAmount = totalValue
  comp.balance = comp.amount - totalValue
  await db.compensations.add(comp)
  await audit('create', 'compensation', comp.id, `Compensation ${comp.direction} - ${totalValue} FCFA`)
}

export async function getLocationStock(locationId: string) {
  const stocks = await db.productStocks.where('locationId').equals(locationId).toArray()
  const products = await db.products.bulkGet(stocks.map(s => s.productId))
  return stocks.map(s => {
    const p = products.find(pr => pr?.id === s.productId)
    return { ...s, product: p }
  })
}

export async function getLocationStockValue(locationId: string) {
  const stocks = await db.productStocks.where('locationId').equals(locationId).toArray()
  const products = await db.products.bulkGet(stocks.map(s => s.productId))
  return stocks.reduce((sum, s) => {
    const p = products.find(pr => pr?.id === s.productId)
    return sum + s.quantity * (p?.purchasePrice || 0)
  }, 0)
}

export async function getLocationStats(locationId: string) {
  const sales = await db.sales.where('locationId').equals(locationId).toArray()
  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  const totalProfit = sales.reduce((s, x) => {
    const cost = x.items.reduce((c, i) => c + i.quantity * (0), 0)
    return s + x.total - cost
  }, 0)
  return { totalSales, totalProfit, saleCount: sales.length }
}

export async function getGlobalStats() {
  const sales = await db.sales.toArray()
  const purchases = await db.purchases.toArray()
  const stocks = await db.productStocks.toArray()
  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  const totalPurchases = purchases.reduce((s, x) => s + x.total, 0)
  const inventoryValue = stocks.reduce((s, x) => s + x.quantity * 0, 0)
  return { totalSales, totalPurchases, profit: totalSales - totalPurchases, inventoryValue }
}
