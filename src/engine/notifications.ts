import db from '@/db'
import { generateId } from '@/lib/utils'
import { useAppStore } from '@/stores/appStore'
import type { Notification } from '@/types'

function bizId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

export async function checkStockAlerts(): Promise<Notification[]> {
  const created: Notification[] = []
  const lowStocks = await db.productStocks.where('stockAlert').above(0).toArray()
  const products = await db.products.toArray()
  const locations = await db.locations.toArray()

  for (const stock of lowStocks) {
    if (stock.quantity <= stock.stockAlert) {
      const p = products.find(pr => pr.id === stock.productId)
      const loc = locations.find(l => l.id === stock.locationId)
      const existing = await db.notifications
        .where({ type: 'stock_alert' })
        .filter(n => n.message?.includes(p?.name || ''))
        .first()

      if (!existing) {
        const notif: Notification = {
          id: generateId(),
          businessId: bizId(),
          type: 'stock_alert',
          title: 'Stock bas',
          message: `${p?.name || 'Produit'} en stock bas (${stock.quantity} restants) chez ${loc?.name || stock.locationId}`,
          read: false,
          link: `/products/${stock.productId}`,
          createdAt: new Date().toISOString(),
        }
        await db.notifications.add(notif)
        created.push(notif)
      }
    }
  }
  return created
}

export async function checkOverdueCredits(): Promise<Notification[]> {
  const created: Notification[] = []
  const overdue = await db.credits
    .where('status').equals('active')
    .filter(c => c.balance > 0 && new Date(c.dueDate) < new Date())
    .toArray()

  for (const credit of overdue) {
    const existing = await db.notifications
      .where({ type: 'credit_due' })
      .filter(n => n.message?.includes(credit.customerName))
      .first()

    if (!existing) {
      const notif: Notification = {
        id: generateId(),
        businessId: bizId(),
        type: 'credit_due',
        title: 'Crédit échu',
        message: `${credit.customerName} a un crédit de ${credit.balance} FCFA échu depuis ${new Date(credit.dueDate).toLocaleDateString('fr-FR')}`,
        read: false,
        link: '/credit',
        createdAt: new Date().toISOString(),
      }
      await db.notifications.add(notif)
      created.push(notif)
    }
  }
  return created
}

export async function checkSupplierInvoices(): Promise<Notification[]> {
  const created: Notification[] = []
  const unpaid = await db.supplierInvoices
      .where('status').equals('credit')
      .filter(inv => inv.balance > 0)
      .toArray()
  const suppliers = await db.suppliers.toArray()

  for (const inv of unpaid) {
    const sup = suppliers.find(s => s.id === inv.supplierId)
    const existing = await db.notifications
      .where({ type: 'invoice_overdue' })
      .filter(n => n.message?.includes(inv.number))
      .first()

    if (!existing) {
      const notif: Notification = {
        id: generateId(),
        businessId: bizId(),
        type: 'invoice_overdue',
        title: 'Facture fournisseur impayée',
        message: `Facture ${inv.number} de ${sup?.name || inv.supplierId} : ${inv.balance} FCFA restants`,
        read: false,
        link: `/suppliers/${inv.supplierId}`,
        createdAt: new Date().toISOString(),
      }
      await db.notifications.add(notif)
      created.push(notif)
    }
  }
  return created
}

let intervalId: ReturnType<typeof setInterval> | null = null

export function startNotificationEngine(intervalMs = 60000) {
  runAllChecks()
  intervalId = setInterval(runAllChecks, intervalMs)
}

export function stopNotificationEngine() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

async function runAllChecks() {
  try {
    await Promise.all([
      checkStockAlerts(),
      checkOverdueCredits(),
      checkSupplierInvoices(),
    ])
  } catch {
    // silent
  }
}
