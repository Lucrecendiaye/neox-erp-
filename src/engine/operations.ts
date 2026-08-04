import db from '@/db'
import { generateId } from '@/lib/utils'
import { syncWriteObject, syncWrite, syncDeleteObject } from '@/lib/realtime'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { requirePermission, checkBusinessAccess } from '@/lib/checkPermission'
import { softDelete } from '@/lib/softDelete'
import type {
  Location, ProductStock, ProductHistory, ProductHistoryAction,
  SupplierInvoice, SupplierInvoiceItem, SupplierPayment, PaymentLine,
  Compensation, CompensationItem, Transfer, TransferItem,
} from './types'
import type { Sale, SaleItem, StockMovement, Purchase, AccountingEntry, AuditLog, Product, Credit, CreditPayment, PaymentMethod } from '@/types'

function currentBizId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

function currentUserId(): string {
  return useAppStore.getState().user?.id || ''
}

function currentUserName(): string {
  return useAppStore.getState().user?.name || ''
}

async function syncAfter(dexieTable: keyof typeof db, obj: Record<string, any>) {
  if (isSupabaseConfigured()) {
    await syncWriteObject(dexieTable, obj).catch(() => {})
  }
}

function now() { return new Date().toISOString() }

export async function getStock(productId: string, locationId: string): Promise<number> {
  const record = await db.productStocks.get({ productId, locationId })
  return record?.quantity || 0
}

export async function currentUserIdFn(): Promise<string> {
  return currentUserId()
}

async function ensureStockRecord(productId: string, locationId: string) {
  const existing = await db.productStocks.get({ productId, locationId })
  if (!existing) {
    const rec: ProductStock = {
      id: generateId(),
      businessId: currentBizId(),
      productId,
      locationId,
      quantity: 0,
      stockAlert: 10,
      stockMin: 0,
      stockMax: 999999,
      updatedAt: now(),
    }
    await db.productStocks.add(rec)
  }
}

async function adjustStock(productId: string, locationId: string, delta: number, action: ProductHistoryAction, reference?: string, comment?: string) {
  await ensureStockRecord(productId, locationId)
  const records = await db.productStocks.where({ productId, locationId }).toArray()
  const record = records[0]
  if (!record) return
  const before = record.quantity
  const after = Math.max(0, before + delta)
  await db.productStocks.update(record.id, { quantity: after, updatedAt: now() })
  const historyEntry = {
    id: generateId(),
    businessId: currentBizId(),
    productId,
    locationId,
    action,
    quantityBefore: before,
    quantityAfter: after,
    userId: currentUserId(),
    reference,
    comment,
    createdAt: now(),
  }
  await db.productHistory.add(historyEntry)
  if (isSupabaseConfigured()) {
    await syncWriteObject('productStocks', { id: record.id, quantity: after, updatedAt: now(), productId, locationId }).catch(() => {})
    await syncWriteObject('productHistory', historyEntry).catch(() => {})
  }
}

export async function adjustStockPublic(productId: string, locationId: string, delta: number, action: ProductHistoryAction, reference?: string, comment?: string) {
  return adjustStock(productId, locationId, delta, action, reference, comment)
}

async function audit(action: string, entity: string, entityId: string, details?: string) {
  const state = useAppStore.getState()
  const userName = state.user?.name || ''
  const userLoginId = state.user?.loginId || ''
  const userRole = state.user?.role || ''
  await db.auditLogs.add({
    id: generateId(),
    businessId: currentBizId(),
    userId: currentUserId(),
    userName,
    userLoginId,
    userRole,
    action: `${action} (${userName})`,
    entity,
    entityId,
    details,
    createdAt: now(),
  })
}

function getMainQty(item: { quantity: number; unitQuantity?: number }): number {
  return item.unitQuantity ? item.quantity * item.unitQuantity : item.quantity
}

export async function processSale(sale: Sale) {
  requirePermission('pos', 'create')
  const locationId = sale.locationId
  for (const item of sale.items) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, locationId, -mainQty, 'sold', sale.invoiceNumber, `Vente #${sale.invoiceNumber} par ${currentUserName()}`)
  }
  await db.sales.add(sale)
  await syncAfter('sales', sale)
  await audit('create', 'sale', sale.id, `Vente ${sale.invoiceNumber} - ${sale.total} FCFA (${currentUserName()})`)

  if (sale.paymentMethod === 'credit' && sale.customerId && sale.paid < sale.total) {
    const creditAmount = sale.total - sale.paid
    const credit: Credit = {
      id: generateId(),
      businessId: currentBizId(),
      customerId: sale.customerId,
      customerName: sale.customerName || 'Client',
      invoiceId: sale.id,
      amount: creditAmount,
      paid: 0,
      balance: creditAmount,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      reminderSent: [],
      createdAt: now(),
    }
    await db.credits.add(credit)

    if (sale.paid > 0) {
      const payment: CreditPayment = {
        id: generateId(),
        businessId: currentBizId(),
        creditId: credit.id,
        saleId: sale.id,
        customerId: sale.customerId,
        amount: sale.paid,
        method: sale.paymentMethod === 'credit' ? 'cash' : sale.paymentMethod,
        date: sale.createdAt,
        userId: currentUserId(),
        createdAt: now(),
      }
      await db.creditPayments.add(payment)
      await db.credits.update(credit.id, { paid: sale.paid, balance: creditAmount - sale.paid })
    }

    const customer = await db.customers.get(sale.customerId)
    if (customer) {
      await db.customers.update(sale.customerId, { currentBalance: (customer.currentBalance || 0) + creditAmount })
    }

    await audit('create', 'credit', credit.id, `Crédit ${creditAmount} FCFA pour ${sale.customerName} (${currentUserName()})`)
  }
}

export async function cancelSale(saleId: string) {
  requirePermission('sales', 'cancel_sale')
  const sale = await db.sales.get(saleId)
  if (!sale) throw new Error('Vente introuvable')
  for (const item of sale.items) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, sale.locationId, mainQty, 'returned', sale.invoiceNumber, `Annulation vente #${sale.invoiceNumber} par ${currentUserName()}`)
  }
  await db.sales.update(saleId, { status: 'cancelled' })
  await audit('cancel', 'sale', saleId, `Vente ${sale.invoiceNumber} annulée (${currentUserName()})`)
}

export async function deleteSale(saleId: string) {
  requirePermission('sales', 'delete')
  const sale = await db.sales.get(saleId)
  if (!sale) throw new Error('Vente introuvable')
  for (const item of sale.items) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, sale.locationId, mainQty, 'returned', sale.invoiceNumber, `Suppression vente #${sale.invoiceNumber} par ${currentUserName()}`)
  }

  if (sale.paymentMethod === 'credit' && sale.customerId) {
    const relatedCredits = await db.credits.where({ invoiceId: saleId }).toArray()
    for (const credit of relatedCredits) {
      await softDelete('credits', credit.id, credit as any, `Crédit ${credit.customerName}`)
      await db.credits.delete(credit.id)
      const payments = await db.creditPayments.where({ creditId: credit.id }).toArray()
      for (const p of payments) {
        try { await softDelete('creditPayments', p.id, p as any, `Paiement ${p.amount}`) } catch {}
        await db.creditPayments.delete(p.id)
      }
      const customer = await db.customers.get(credit.customerId)
      if (customer) {
        await db.customers.update(credit.customerId, {
          currentBalance: Math.max(0, (customer.currentBalance || 0) - credit.balance),
        })
      }
    }
  }

  try { await softDelete('sales', saleId, sale as any, sale.invoiceNumber) } catch {}
  await db.sales.delete(saleId)
  try { await syncDeleteObject('sales', saleId) } catch {}
  await audit('delete', 'sale', saleId, `Vente ${sale.invoiceNumber} supprimée (${currentUserName()})`)
}

export async function editSale(saleId: string, updatedSale: Partial<Sale>) {
  requirePermission('sales', 'edit')
  const oldSale = await db.sales.get(saleId)
  if (!oldSale) throw new Error('Vente introuvable')

  // Restore old stock
  for (const item of oldSale.items) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, oldSale.locationId, mainQty, 'returned', oldSale.invoiceNumber, `Modification - restitution ancien stock #${oldSale.invoiceNumber}`)
  }

  // Apply new stock deduction if items changed
  const newItems = updatedSale.items || oldSale.items
  const newLocationId = updatedSale.locationId || oldSale.locationId
  for (const item of newItems) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, newLocationId, -mainQty, 'sold', oldSale.invoiceNumber, `Modification - nouveau stock #${oldSale.invoiceNumber} (${currentUserName()})`)
  }

  await db.sales.update(saleId, {
    ...updatedSale,
    items: newItems,
    locationId: newLocationId,
  })
  await audit('edit', 'sale', saleId, `Vente ${oldSale.invoiceNumber} modifiée (${currentUserName()})`)
}

export async function processPurchase(purchase: Purchase) {
  requirePermission('purchases', 'create')
  const locationId = purchase.locationId
  for (const item of purchase.items) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, locationId, mainQty, 'purchased', purchase.id, `Achat #${purchase.id} par ${currentUserName()}`)
  }
  await db.purchases.add(purchase)
  await syncAfter('purchases', purchase)
  await audit('create', 'purchase', purchase.id, `Achat ${purchase.total} FCFA (${currentUserName()})`)
}

export async function processTransfer(transfer: Transfer) {
  requirePermission('depots', 'transfer')
  transfer.id = transfer.id || generateId()
  transfer.businessId = currentBizId()
  transfer.createdAt = now()
  transfer.userId = currentUserId()
  transfer.status = 'completed'
  transfer.bonNumber = transfer.bonNumber || `BS-${String(Date.now()).slice(-8)}`

  for (const item of transfer.items) {
    const fromQty = await getStock(item.productId, transfer.fromLocationId)
    if (fromQty < item.quantity) throw new Error(`Stock insuffisant pour ${item.productName} dans l'emplacement source`)
    await adjustStock(item.productId, transfer.fromLocationId, -item.quantity, 'transferred_out', transfer.id, `Transfert vers ${transfer.toLocationId}`)
    await adjustStock(item.productId, transfer.toLocationId, item.quantity, 'transferred_in', transfer.id, `Transfert depuis ${transfer.fromLocationId}`)
  }

  await db.transfers.add(transfer)
  await syncAfter('transfers', transfer)
  await audit('create', 'transfer', transfer.id, `Transfert ${transfer.bonNumber} - ${transfer.fromLocationId} → ${transfer.toLocationId} (${currentUserName()})`)
  return transfer
}

export async function processStockAdjustment(productId: string, locationId: string, newQty: number, note?: string) {
  requirePermission('products', 'adjust_stock')
  const current = await getStock(productId, locationId)
  const delta = newQty - current
  await adjustStock(productId, locationId, delta, 'adjusted', undefined, note || `Ajustement de ${current} à ${newQty} par ${currentUserName()}`)
  await audit('adjust', 'stock', `${productId}-${locationId}`, `Stock ajusté: ${current} → ${newQty} (${currentUserName()})`)
}

export async function processStockRemoval(productId: string, locationId: string, quantity: number, reason: string, comment?: string) {
  requirePermission('products', 'adjust_stock')
  const current = await getStock(productId, locationId)
  if (quantity <= 0) throw new Error('La quantité doit être positive')
  if (current < quantity) throw new Error(`Stock insuffisant: ${current} < ${quantity}`)
  await adjustStock(productId, locationId, -quantity, 'adjusted', reason, `${reason}${comment ? ' - ' + comment : ''} (${currentUserName()})`)
  await audit('remove_stock', 'stock', `${productId}-${locationId}`, `Retrait: ${quantity} pour ${reason} par ${currentUserName()}${comment ? ' - ' + comment : ''}`)
}

export async function processSupplierInvoice(invoice: SupplierInvoice) {
  requirePermission('purchases', 'create')
  invoice.id = invoice.id || generateId()
  invoice.businessId = currentBizId()
  invoice.createdAt = now()
  invoice.userId = currentUserId()
  invoice.status = invoice.total <= invoice.paid ? 'paid' : invoice.paid > 0 ? 'partial' : 'credit'
  invoice.balance = invoice.total - invoice.paid

  const locationId = await getDefaultLocation()

  for (const item of invoice.items) {
    const existing = await db.products.get(item.productId)
    if (existing) {
      await adjustStock(item.productId, locationId, item.quantity, 'supplier_entry', invoice.number, `Entrée fournisseur #${invoice.number} par ${currentUserName()}`)
    }
  }

  await db.supplierInvoices.add(invoice)
  await syncAfter('supplierInvoices', invoice)
  await audit('create', 'supplier_invoice', invoice.id, `Facture fournisseur #${invoice.number} - ${invoice.total} FCFA (${currentUserName()})`)
}

export async function processSupplierPayment(invoiceId: string, payment: SupplierPayment) {
  requirePermission('purchases', 'edit')
  const invoice = await db.supplierInvoices.get(invoiceId)
  if (!invoice) throw new Error('Facture introuvable')

  payment.id = payment.id || generateId()
  payment.createdAt = now()
  payment.userId = currentUserId()

  let cashAmount = 0
  for (const line of payment.lines) {
    if (line.type === 'cash' || line.type === 'bank' || line.type === 'mobile') {
      cashAmount += line.amount
    } else if (line.type === 'product') {
      const locationId = await getDefaultLocation()
      await adjustStock(line.productId!, locationId, -line.productQty!, 'supplier_exit', invoiceId, `Paiement nature facture ${invoice.number} (${currentUserName()})`)
    }
  }

  const updatedPaid = invoice.paid + payment.amount
  const updatedBalance = invoice.total - updatedPaid
  const updatedStatus = updatedBalance <= 0 ? 'paid' : 'partial'

  const payments = [...(invoice.payments || []), payment]
  await db.supplierInvoices.update(invoiceId, {
    paid: updatedPaid,
    balance: updatedBalance,
    status: updatedStatus,
    payments,
  })

  await syncWrite('supplier_invoices', {
    id: invoiceId, paid: updatedPaid, balance: updatedBalance, status: updatedStatus, payments,
  })
  await syncAfter('supplierPayments', payment)
  await audit('payment', 'supplier_invoice', invoiceId, `Paiement ${payment.amount} FCFA sur facture ${invoice.number} (${currentUserName()})`)
  return { invoice: { ...invoice, paid: updatedPaid, balance: updatedBalance, status: updatedStatus, payments }, payment }
}

export async function processCompensation(comp: Compensation) {
  comp.id = comp.id || generateId()
  comp.businessId = currentBizId()
  comp.createdAt = now()
  comp.userId = currentUserId()
  comp.status = 'completed'

  let totalValue = 0
  const locationId = await getDefaultLocation()

  if (comp.direction === 'debt_to_goods') {
    for (const item of comp.items) {
      await adjustStock(item.productId, locationId, item.quantity, 'supplier_entry', comp.referenceInvoiceId, `Compensation: ${item.productName} (${currentUserName()})`)
      totalValue += item.total
    }
  } else {
    for (const item of comp.items) {
      await adjustStock(item.productId, locationId, -item.quantity, 'supplier_exit', comp.referenceInvoiceId, `Compensation sortie: ${item.productName} (${currentUserName()})`)
      totalValue += item.total
    }
  }

  comp.settledAmount = totalValue
  comp.balance = comp.amount - totalValue
  await db.compensations.add(comp)
  await syncAfter('compensations', comp)
  await audit('create', 'compensation', comp.id, `Compensation ${comp.direction} - ${totalValue} FCFA (${currentUserName()})`)
}

export async function getLocationStock(locationId: string) {
  const bizId = currentBizId()
  const stocks = await db.productStocks
    .where('businessId').equals(bizId)
    .filter(s => s.locationId === locationId)
    .toArray()
  const products = await db.products.bulkGet(stocks.map(s => s.productId))
  return stocks.map(s => {
    const p = products.find(pr => pr?.id === s.productId)
    return { ...s, product: p }
  })
}

export async function getLocationStockValue(locationId: string) {
  const bizId = currentBizId()
  const stocks = await db.productStocks
    .where('businessId').equals(bizId)
    .filter(s => s.locationId === locationId)
    .toArray()
  const products = await db.products.bulkGet(stocks.map(s => s.productId))
  return stocks.reduce((sum, s) => {
    const p = products.find(pr => pr?.id === s.productId)
    return sum + s.quantity * (p?.purchasePrice || 0)
  }, 0)
}

export async function getLocationStats(locationId: string) {
  const bizId = currentBizId()
  const sales = await db.sales
    .where('businessId').equals(bizId)
    .filter(s => s.locationId === locationId)
    .toArray()
  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  let totalProfit = 0
  for (const sale of sales) {
    for (const item of sale.items) {
      const product = await db.products.get(item.productId)
      const mainQty = getMainQty(item)
      const cost = mainQty * (product?.purchasePrice || 0)
      totalProfit += item.total - cost
    }
  }
  return { totalSales, totalProfit, saleCount: sales.length }
}

export async function getGlobalStats() {
  const bizId = currentBizId()
  const sales = await db.sales.where('businessId').equals(bizId).toArray()
  const purchases = await db.purchases.where('businessId').equals(bizId).toArray()
  const stocks = await db.productStocks.where('businessId').equals(bizId).toArray()
  const products = await db.products.where('businessId').equals(bizId).toArray()
  const totalSales = sales.reduce((s, x) => s + x.total, 0)
  const totalPurchases = purchases.reduce((s, x) => s + x.total, 0)

  let totalProfit = 0
  for (const sale of sales) {
    for (const item of sale.items) {
      const product = products.find(p => p.id === item.productId)
      const mainQty = getMainQty(item)
      const cost = mainQty * (product?.purchasePrice || 0)
      totalProfit += item.total - cost
    }
  }

  const inventoryValue = stocks.reduce((sum, s) => {
    const p = products.find(pr => pr.id === s.productId)
    return sum + s.quantity * (p?.purchasePrice || 0)
  }, 0)

  return { totalSales, totalPurchases, profit: totalProfit, inventoryValue }
}

async function getDefaultLocation(): Promise<string> {
  const bizId = currentBizId()
  const loc = await db.locations
    .where('businessId').equals(bizId)
    .filter(l => l.type === 'shop')
    .first()
  return loc?.id || ''
}

export async function getProductLocations(productId: string): Promise<ProductStock[]> {
  const bizId = currentBizId()
  return db.productStocks
    .where('businessId').equals(bizId)
    .filter(s => s.productId === productId)
    .toArray()
}

export async function deletePurchase(purchaseId: string) {
  requirePermission('purchases', 'delete')
  const purchase = await db.purchases.get(purchaseId)
  if (!purchase) throw new Error('Achat introuvable')
  for (const item of purchase.items) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, purchase.locationId, -mainQty, 'adjusted', purchase.id, `Suppression achat #${purchase.id} par ${currentUserName()}`)
  }
  await softDelete('purchases', purchaseId, purchase as any, purchase.id)
  await db.purchases.delete(purchaseId)
  await audit('delete', 'purchase', purchaseId, `Achat ${purchase.id} supprimé (${currentUserName()})`)
}

export async function editPurchase(purchaseId: string, updatedPurchase: Partial<Purchase>) {
  requirePermission('purchases', 'edit')
  const old = await db.purchases.get(purchaseId)
  if (!old) throw new Error('Achat introuvable')
  for (const item of old.items) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, old.locationId, -mainQty, 'adjusted', old.id, `Modification achat - restitution stock`)
  }
  const newItems = updatedPurchase.items || old.items
  const newLocationId = updatedPurchase.locationId || old.locationId
  for (const item of newItems) {
    const mainQty = getMainQty(item)
    await adjustStock(item.productId, newLocationId, mainQty, 'purchased', old.id, `Modification achat - nouveau stock par ${currentUserName()}`)
  }
  await db.purchases.update(purchaseId, { ...updatedPurchase, items: newItems, locationId: newLocationId })
  await audit('edit', 'purchase', purchaseId, `Achat ${old.id} modifié (${currentUserName()})`)
}

export async function recordCreditPayment(
  creditId: string,
  amount: number,
  method: PaymentMethod,
  note?: string
) {
  requirePermission('sales', 'create')
  const credit = await db.credits.get(creditId)
  if (!credit) throw new Error('Crédit introuvable')
  if (amount <= 0) throw new Error('Le montant doit être supérieur à 0')
  if (amount > credit.balance) throw new Error('Le montant dépasse le solde restant')

  const newPaid = credit.paid + amount
  const newBalance = credit.balance - amount
  const newStatus = newBalance <= 0 ? 'paid' : credit.status

  const payment: CreditPayment = {
    id: generateId(),
    businessId: currentBizId(),
    creditId,
    saleId: credit.invoiceId,
    customerId: credit.customerId,
    amount,
    method,
    date: now(),
    note,
    userId: currentUserId(),
    createdAt: now(),
  }
  await db.creditPayments.add(payment)
  await db.credits.update(creditId, { paid: newPaid, balance: newBalance, status: newStatus })

  if (credit.invoiceId) {
    const sale = await db.sales.get(credit.invoiceId)
    if (sale) {
      await db.sales.update(credit.invoiceId, { paid: (sale.paid || 0) + amount })
    }
  }

  const customer = await db.customers.get(credit.customerId)
  if (customer) {
    await db.customers.update(credit.customerId, {
      currentBalance: Math.max(0, (customer.currentBalance || 0) - amount),
    })
  }

  await audit('payment', 'credit', creditId, `Paiement ${amount} FCFA sur crédit ${creditId.slice(0, 8)} par ${currentUserName()}${note ? ' - ' + note : ''}`)
  return payment
}

export async function modifyCreditPayment(paymentId: string, newAmount: number, method?: PaymentMethod) {
  requirePermission('sales', 'edit')
  const payment = await db.creditPayments.get(paymentId)
  if (!payment) throw new Error('Paiement introuvable')

  const credit = await db.credits.get(payment.creditId)
  if (!credit) throw new Error('Crédit introuvable')

  const diff = newAmount - payment.amount
  if (diff > credit.balance + payment.amount) throw new Error('Le nouveau montant dépasse le solde du crédit')

  const oldAmount = payment.amount

  await db.creditPayments.update(paymentId, { amount: newAmount, method: method || payment.method })

  const newPaid = credit.paid + diff
  const newBalance = credit.balance - diff
  const newStatus = newBalance <= 0 ? 'paid' : credit.balance > 0 ? 'active' : credit.status
  await db.credits.update(credit.id, { paid: Math.max(0, newPaid), balance: Math.max(0, newBalance), status: newStatus })

  if (credit.invoiceId) {
    const sale = await db.sales.get(credit.invoiceId)
    if (sale) {
      await db.sales.update(credit.invoiceId, { paid: Math.max(0, (sale.paid || 0) + diff) })
    }
  }

  const customer = await db.customers.get(credit.customerId)
  if (customer) {
    await db.customers.update(credit.customerId, {
      currentBalance: Math.max(0, (customer.currentBalance || 0) - diff),
    })
  }

  await audit('edit', 'credit_payment', paymentId, `Paiement modifié: ${oldAmount} → ${newAmount} FCFA (${currentUserName()})`)
}

export async function deleteCreditPayment(paymentId: string) {
  requirePermission('sales', 'delete')
  const payment = await db.creditPayments.get(paymentId)
  if (!payment) throw new Error('Paiement introuvable')

  const credit = await db.credits.get(payment.creditId)
  if (!credit) throw new Error('Crédit introuvable')

  const newPaid = credit.paid - payment.amount
  const newBalance = credit.balance + payment.amount
  const newStatus = newBalance <= 0 ? 'paid' : 'active'
  await db.credits.update(credit.id, { paid: Math.max(0, newPaid), balance: Math.max(0, newBalance), status: newStatus })

  if (credit.invoiceId) {
    const sale = await db.sales.get(credit.invoiceId)
    if (sale) {
      await db.sales.update(credit.invoiceId, { paid: Math.max(0, (sale.paid || 0) - payment.amount) })
    }
  }

  const customer = await db.customers.get(credit.customerId)
  if (customer) {
    await db.customers.update(credit.customerId, {
      currentBalance: Math.max(0, (customer.currentBalance || 0) + payment.amount),
    })
  }

  await db.creditPayments.delete(paymentId)
  await audit('delete', 'credit_payment', paymentId, `Paiement ${payment.amount} FCFA supprimé (${currentUserName()})`)
}
