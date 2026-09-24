import db from '@/db'
import { generateId, generateInvoiceNumber } from '@/lib/utils'
import { nextInvoiceNumber } from './invoiceNumbers'
import { syncWriteObject, syncDeleteObject } from '@/lib/realtime'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { requirePermission } from '@/lib/checkPermission'
import { softDelete } from '@/lib/softDelete'
import { adjustStockPublic, processSale } from './operations'
import { createNotification } from './notifications'
import { notifySensitive } from './sensitiveNotifications'
import type { Delivery, DeliveryItem, DeliveryPayment, DeliveryPaymentStatus, Notification, PaymentMethod, Sale, SaleItem } from '@/types'

export interface DeliveryDraftItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  unitName?: string
  unitQuantity?: number
  locationId?: string
}

export interface NewDeliveryInput {
  locationId: string
  customerId?: string
  customerName: string
  customerPhone?: string
  customerAddress?: string
  quarter?: string
  deliveryNote?: string
  items: DeliveryDraftItem[]
  deliveryFeeClient: number
  deliveryFeeShop: number
  discount: number
  paymentMethod: PaymentMethod | ''
  advance: number
  courierId?: string
  plannedDate?: string
}

interface MutatedDelivery {
  amount: number
  method: PaymentMethod
  note?: string
}

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

function now(): string {
  return new Date().toISOString()
}

async function syncAfter(dexieTable: keyof typeof db, obj: Record<string, any>) {
  if (isSupabaseConfigured()) {
    await syncWriteObject(dexieTable, obj).catch(() => {})
  }
}

async function audit(action: string, entity: string, entityId: string, details?: string) {
  const state = useAppStore.getState()
  await db.auditLogs.add({
    id: generateId(),
    businessId: currentBizId(),
    userId: currentUserId(),
    userName: state.user?.name || '',
    userLoginId: state.user?.loginId || '',
    userRole: state.user?.role || '',
    action: `${action} (${currentUserName()})`,
    entity,
    entityId,
    details,
    createdAt: now(),
  })
}

function deliveryMainQty(item: { quantity: number; unitQuantity?: number }): number {
  return item.unitQuantity ? item.quantity * item.unitQuantity : item.quantity
}

function deliveryPaymentStatus(d: Pick<Delivery, 'payments' | 'paid' | 'total'>): DeliveryPaymentStatus {
  if (d.paid >= d.total && d.total > 0) {
    return (d.payments || []).some(p => p.kind === 'cod') ? 'full' : 'prepaid'
  }
  return d.paid > 0 ? 'partial' : 'pending'
}

function assertCourierAccess(delivery: Delivery) {
  const user = useAppStore.getState().user
  if (user?.permissions?.includes('*')) return
  if (!delivery.courierId) return
  if (delivery.courierId !== currentUserId()) {
    throw new Error('Cette livraison ne vous est pas assignée')
  }
}

function notifyUser(
  recipientId: string | undefined,
  type: DeliveryNotificationType,
  title: string,
  message: string,
  link?: string,
  extra?: { senderId?: string; transferId?: string; shopId?: string }
) {
  void createNotification({
    type,
    title,
    message,
    link,
    recipientId,
    senderId: extra?.senderId,
    transferId: extra?.transferId,
    shopId: extra?.shopId,
  }).catch(() => {})
}

type DeliveryNotificationType = Notification['type']

async function returnStock(delivery: Delivery) {
  for (const item of delivery.items) {
    const locationId = item.locationId || delivery.locationId
    await adjustStockPublic(item.productId, locationId, deliveryMainQty(item), 'returned', delivery.number, `Retour livraison ${delivery.number} par ${currentUserName()}`)
  }
}

export async function getDeliveries(): Promise<Delivery[]> {
  const bizId = currentBizId()
  const all = await db.deliveries.where('businessId').equals(bizId).toArray()
  return all.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
}

export async function getDelivery(id: string): Promise<Delivery | undefined> {
  return db.deliveries.get(id)
}

export async function getCourierDeliveries(courierId: string): Promise<Delivery[]> {
  const bizId = currentBizId()
  const all = await db.deliveries.where('businessId').equals(bizId).toArray()
  return all
    .filter(d => d.courierId === courierId && (d.status === 'validated' || d.status === 'prepared' || d.status === 'in_transit'))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
}

export async function nextDeliveryNumber(): Promise<string> {
  const settings = await db.settings.get('default')
  return generateInvoiceNumber(settings?.deliveryPrefix || 'VL-', settings?.deliveryNextNumber || 1)
}

export async function createDelivery(input: NewDeliveryInput): Promise<Delivery> {
  requirePermission('deliveries', 'create')

  if (!input.customerName?.trim()) throw new Error('Le nom du client est requis')
  if (!input.items?.length) throw new Error('Ajoutez au moins un article')
  if (!input.locationId) throw new Error('Emplacement boutique manquant')

  let subtotal = 0
  const items: DeliveryItem[] = input.items.map(it => {
    if (!it.productId) throw new Error('Tous les articles doivent être avec des produits du catalogue')
    const qty = Number(it.quantity) || 0
    if (qty <= 0) throw new Error(`Quantité invalide pour "${it.productName}"`)
    const price = Number(it.unitPrice) || 0
    if (price < 0) throw new Error(`Prix invalide pour "${it.productName}"`)
    const total = Math.round(qty * price)
    subtotal += total
    return {
      id: generateId(),
      productId: it.productId,
      productName: it.productName,
      quantity: qty,
      unitPrice: price,
      unitName: it.unitName,
      unitQuantity: it.unitQuantity,
      total,
      locationId: it.locationId,
    }
  })

  const deliveryFeeClient = Math.max(0, Number(input.deliveryFeeClient) || 0)
  const deliveryFeeShop = Math.max(0, Number(input.deliveryFeeShop) || 0)
  const deliveryFee = deliveryFeeClient + deliveryFeeShop
  const discount = Math.max(0, Number(input.discount) || 0)
  const total = Math.max(0, subtotal - discount + deliveryFeeClient)
  const advance = Math.min(Math.max(0, Number(input.advance) || 0), total)

  const settings = await db.settings.get('default')
  const number = generateInvoiceNumber(settings?.deliveryPrefix || 'VL-', settings?.deliveryNextNumber || 1)
  if (settings) {
    await db.settings.update('default', { deliveryNextNumber: (settings.deliveryNextNumber || 1) + 1 })
  }

  const payments: DeliveryPayment[] = []
  if (advance > 0) {
    const method: PaymentMethod = input.paymentMethod || 'cash'
    payments.push({
      id: generateId(),
      kind: 'advance',
      method,
      amount: advance,
      date: now(),
      userId: currentUserId(),
      userName: currentUserName(),
    })
  }

  let courierName: string | undefined
  if (input.courierId) {
    const courier = await db.users.get(input.courierId)
    courierName = courier?.name
  }

  const delivery: Delivery = {
    id: generateId(),
    businessId: currentBizId(),
    number,
    locationId: input.locationId,
    status: 'draft',
    paymentStatus: deliveryPaymentStatus({ payments, paid: advance, total }),
    paymentMethod: input.paymentMethod || '',
    customerId: input.customerId || undefined,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone,
    customerAddress: input.customerAddress,
    quarter: input.quarter,
    deliveryNote: input.deliveryNote,
    items,
    subtotal,
    discount,
    deliveryFee,
    deliveryFeeClient,
    deliveryFeeShop,
    total,
    paid: advance,
    courierId: input.courierId || undefined,
    courierName,
    plannedDate: input.plannedDate,
    createdById: currentUserId(),
    createdByName: currentUserName(),
    createdAt: now(),
    updatedAt: now(),
    payments,
  }

  await db.deliveries.add(delivery)
  await syncAfter('deliveries', delivery)
  await audit('create', 'delivery', delivery.id, `Livraison ${number} créée - ${delivery.customerName} (${currentUserName()})`)
  return delivery
}

export async function editDraft(id: string, input: NewDeliveryInput): Promise<Delivery> {
  requirePermission('deliveries', 'edit')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  if (delivery.status !== 'draft') {
    throw new Error('Seul un brouillon peut être modifié')
  }
  if (!input.customerName?.trim()) throw new Error('Le nom du client est requis')
  if (!input.items?.length) throw new Error('Ajoutez au moins un article')

  let subtotal = 0
  const items: DeliveryItem[] = input.items.map(it => {
    if (!it.productId) throw new Error('Tous les articles doivent être avec des produits du catalogue')
    const qty = Number(it.quantity) || 0
    if (qty <= 0) throw new Error(`Quantité invalide pour "${it.productName}"`)
    const price = Number(it.unitPrice) || 0
    if (price < 0) throw new Error(`Prix invalide pour "${it.productName}"`)
    const total = Math.round(qty * price)
    subtotal += total
    return {
      id: generateId(),
      productId: it.productId,
      productName: it.productName,
      quantity: qty,
      unitPrice: price,
      unitName: it.unitName,
      unitQuantity: it.unitQuantity,
      total,
      locationId: it.locationId,
    }
  })

  const deliveryFeeClient = Math.max(0, Number(input.deliveryFeeClient) || 0)
  const deliveryFeeShop = Math.max(0, Number(input.deliveryFeeShop) || 0)
  const deliveryFee = deliveryFeeClient + deliveryFeeShop
  const discount = Math.max(0, Number(input.discount) || 0)
  const total = Math.max(0, subtotal - discount + deliveryFeeClient)

  const existingAdvance = (delivery.payments || []).filter(p => p.kind === 'advance').map(p => p.amount).reduce((s, a) => s + a, 0)
  const paid = Math.min(existingAdvance, total)

  const updated: Delivery = {
    ...delivery,
    locationId: input.locationId,
    customerId: input.customerId || undefined,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone,
    customerAddress: input.customerAddress,
    quarter: input.quarter,
    deliveryNote: input.deliveryNote,
    items,
    subtotal,
    discount,
    deliveryFee,
    deliveryFeeClient,
    deliveryFeeShop,
    total,
    paid,
    paymentStatus: deliveryPaymentStatus({ payments: delivery.payments || [], paid, total }),
    updatedAt: now(),
  }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('edit', 'delivery', delivery.id, `Livraison ${delivery.number} modifiée (${currentUserName()})`)
  return updated
}

export async function assignCourier(id: string, courierId?: string): Promise<Delivery> {
  requirePermission('deliveries', 'edit')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')

  let courierName: string | undefined
  if (courierId) {
    const courier = await db.users.get(courierId)
    courierName = courier?.name
  }

  const updated = { ...delivery, courierId: courierId || undefined, courierName, updatedAt: now() }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('assign', 'delivery', delivery.id, `Livreur assigné: ${courierName || 'aucun'} pour ${delivery.number} (${currentUserName()})`)

  const changed = (delivery.courierId || undefined) !== (courierId || undefined)
  if (courierId && changed) {
    notifyUser(courierId, 'delivery_assigned', '🛵 Nouvelle livraison assignée', `Livraison ${updated.number} - ${updated.customerName} à livrer`, '/mes-livraisons', { senderId: currentUserId() })
    if (delivery.courierId && delivery.courierId !== courierId) {
      notifyUser(delivery.courierId, 'delivery_reassigned', '🛵 Livraison réaffectée', `Livraison ${updated.number} attribuée à ${courierName || 'un autre livreur'}`, '/deliveries', { senderId: currentUserId() })
    }
  }
  return updated
}

export async function prepareDelivery(id: string): Promise<Delivery> {
  requirePermission('deliveries', 'edit')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  if (delivery.status !== 'validated') {
    throw new Error('Seule une livraison validée peut être préparée')
  }
  const updated = { ...delivery, status: 'prepared' as const, updatedAt: now() }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('prepare', 'delivery', delivery.id, `Livraison ${delivery.number} préparée (${currentUserName()})`)
  return updated
}

export async function startDelivery(id: string): Promise<Delivery> {
  requirePermission('deliveries', 'edit')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  assertCourierAccess(delivery)
  if (delivery.status !== 'prepared' && delivery.status !== 'validated') {
    throw new Error(`Impossible de démarrer une livraison au statut "${delivery.status}"`)
  }
  const updated = { ...delivery, status: 'in_transit' as const, updatedAt: now() }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('start', 'delivery', delivery.id, `Livraison ${delivery.number} en cours par ${currentUserName()}`)
  return updated
}

export async function validateDelivery(id: string, sourceSelections: Record<string, string> = {}): Promise<Delivery> {
  requirePermission('deliveries', 'validate')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  if (delivery.status !== 'draft') {
    throw new Error('Cette livraison a déjà été validée')
  }

  const saleId = generateId()
  const invoiceNumber = await nextInvoiceNumber()

  const selectedSources = { ...sourceSelections }
  for (const item of delivery.items) {
    if (item.locationId && item.locationId !== delivery.locationId) selectedSources[item.productId] = item.locationId
  }

  const saleItems: SaleItem[] = delivery.items.map(it => ({
    productId: it.productId,
    productName: it.productName,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    unitName: it.unitName,
    unitQuantity: it.unitQuantity,
    discount: 0,
    taxRate: 0,
    total: it.total,
  }))

  // Le frais de livraison client appartient au livreur, pas à la boutique :
  // il est donc exclu du total de la vente (le CA entreprise ne compte que les produits).
  const subtotal = delivery.subtotal
  const total = Math.max(0, subtotal - delivery.discount)
  const paid = Math.min(delivery.paid, total)
  const advanceLines = (delivery.payments || []).filter(p => p.kind === 'advance' && p.amount > 0)
  const isSplit = advanceLines.length > 1
  const method: PaymentMethod = delivery.paymentMethod || 'cash'

  const sale: Sale = {
    id: saleId,
    businessId: delivery.businessId,
    locationId: delivery.locationId,
    invoiceNumber,
    customerId: delivery.customerId || undefined,
    customerName: delivery.customerName,
    customerPhone: delivery.customerPhone,
    saleType: 'delivery',
    items: saleItems,
    subtotal,
    discountTotal: delivery.discount,
    taxTotal: 0,
    total,
    paid,
    change: 0,
    paymentMethod: isSplit ? 'split' : method,
    splitPayments: isSplit ? advanceLines.map(p => ({ method: p.method, amount: p.amount })) : undefined,
    status: 'completed',
    paymentStatus: paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    createdAt: now(),
    userId: currentUserId(),
  }

  await processSale(sale, { sourceSelections: selectedSources })

  // Les frais de livraison (client + boutique) appartiennent au livreur :
  // la part client encaissée (acompte) ne doit pas gonfler la caisse de l'entreprise.
  const companyPortion = Math.max(0, delivery.subtotal - delivery.discount)
  if (delivery.paid > 0 && delivery.paid > companyPortion) {
    const advanceEntries = await db.cashBook.filter(e => e.linkedId === saleId && e.type === 'in').toArray()
    const advanceTotal = advanceEntries.reduce((s, e) => s + e.amount, 0)
    if (advanceTotal > 0) {
      const ratio = companyPortion / advanceTotal
      for (const e of advanceEntries) {
        const amount = Math.round(e.amount * ratio)
        await db.cashBook.update(e.id, { amount })
      }
    }
  }

  // Les frais de livraison appartiennent au livreur, pas à l'entreprise :
  // aucune sortie de caisse automatique n'est créée ici (la part boutique reste
  // une charge documentée dans l'audit / les statistiques des livreurs).
  if (delivery.deliveryFeeShop > 0) {
    await audit('expense', 'delivery', delivery.id, `Part boutique frais de livraison ${delivery.deliveryFeeShop} FCFA (non déduite de la caisse) - ${delivery.number}`)
  }

  const updated: Delivery = {
    ...delivery,
    saleId,
    status: 'validated',
    paymentStatus: deliveryPaymentStatus({ payments: delivery.payments || [], paid, total }),
    updatedAt: now(),
    items: sale.items.map(item => ({ ...item, id: generateId() })),
  }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('validate', 'delivery', delivery.id, `Livraison ${delivery.number} validée - vente ${invoiceNumber} - ${total} FCFA (${currentUserName()})`)
  return updated
}

export async function markDelivered(id: string, payment?: MutatedDelivery): Promise<Delivery> {
  requirePermission('deliveries', 'edit')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  assertCourierAccess(delivery)
  if (delivery.status === 'delivered') throw new Error('Cette livraison est déjà marquée livrée')
  if (delivery.status === 'cancelled' || delivery.status === 'failed') {
    throw new Error('Cette livraison est annulée ou en échec, impossible de la livrer')
  }

  const remaining = delivery.total - delivery.paid
  let newPaid = delivery.paid
  const payments = [...(delivery.payments || [])]
  let companyCash = 0

  if (payment) {
    if (payment.amount <= 0) throw new Error('Le montant encaissé doit être supérieur à 0')
    if (remaining <= 0) throw new Error('Cette commande est déjà entièrement payée')
    if (payment.amount > remaining) {
      throw new Error(`Le montant dépasse le solde restant (reste ${remaining} FCFA)`)
    }
    const p: DeliveryPayment = {
      id: generateId(),
      kind: 'cod',
      method: payment.method,
      amount: payment.amount,
      date: now(),
      userId: currentUserId(),
      userName: currentUserName(),
      note: payment.note,
    }
    payments.push(p)
    newPaid = delivery.paid + payment.amount

    // La part client des frais de livraison appartient au livreur (pas à la caisse
    // de l'entreprise) : seule la part produit est encaissée côté boutique.
    companyCash = Math.max(0, payment.amount - (delivery.deliveryFeeClient || 0))

    if (delivery.saleId) {
      const sale = await db.sales.get(delivery.saleId)
      if (sale) {
        const salePaid = (sale.paid || 0) + companyCash
        const newPaymentStatus: 'paid' | 'partial' | 'unpaid' =
          salePaid >= sale.total ? 'paid' : salePaid > 0 ? 'partial' : 'unpaid'
        const updatedSale = {
          ...sale,
          paid: salePaid,
          paymentStatus: newPaymentStatus,
          updatedAt: now(),
        }
        await db.sales.update(sale.id, { paid: salePaid, paymentStatus: newPaymentStatus })
        await syncAfter('sales', updatedSale)
      }
    }

    if (companyCash > 0) {
      const cashEntry = {
        id: generateId(),
        businessId: delivery.businessId,
        date: now(),
        type: 'in' as const,
        category: 'Encaissement livraison',
        amount: companyCash,
        description: `Encaissement livraison ${delivery.number} - ${delivery.customerName} (${payment.method})`,
        partyId: delivery.customerId,
        partyName: delivery.customerName,
        paymentMethod: payment.method,
        reference: delivery.number,
        linkedId: delivery.id,
        createdAt: now(),
        userId: currentUserId(),
      }
      await db.cashBook.add(cashEntry)
      await syncAfter('cashBook', cashEntry)
    }
  }

  const updated: Delivery = {
    ...delivery,
    status: 'delivered',
    deliveredAt: now(),
    payments,
    paid: newPaid,
    paymentStatus: deliveryPaymentStatus({ payments, paid: newPaid, total: delivery.total }),
    updatedAt: now(),
  }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit(
    'deliver',
    'delivery',
    delivery.id,
    `Livraison ${delivery.number} livrée${payment ? ` - ${payment.amount} FCFA encaissés (caisse entreprise ${companyCash} FCFA) (${currentUserName()})` : ''}`
  )
  return updated
}

export async function failDelivery(id: string, reason?: string): Promise<Delivery> {
  requirePermission('deliveries', 'edit')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  assertCourierAccess(delivery)
  if (delivery.status === 'delivered') throw new Error('Cette livraison a déjà été livrée')
  if (delivery.status === 'cancelled' || delivery.status === 'failed') throw new Error('Déjà annulée / en échec')

  const progressed = delivery.status === 'validated' || delivery.status === 'prepared' || delivery.status === 'in_transit'
  if (progressed && !delivery.stockReturned) {
    await returnStock(delivery)
  }

  // Client non payeur / refus : le produit revient au stock et la vente est annulée
  // (elle ne doit plus apparaître "en attente" dans Ventes / Factures).
  if (delivery.saleId) {
    await db.sales.update(delivery.saleId, { status: 'cancelled' })
  }

  const updated: Delivery = {
    ...delivery,
    status: 'failed',
    returnedAt: now(),
    cancelReason: reason || 'Client absent ou introuvable',
    stockReturned: progressed ? true : delivery.stockReturned,
    updatedAt: now(),
  }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('fail', 'delivery', delivery.id, `Livraison ${delivery.number} en échec: ${reason || 'client absent'} (${currentUserName()})`)
  return updated
}

export interface CourierPayDecision {
  payCourier: boolean
  amount?: number
}

/** Décision explicite du gestionnaire : le livreur est-il payé pour une livraison retournée ?
 *  Rien n'est débité de la caisse automatiquement, la décision est enregistrée dans l'historique. */
export async function decideCourierPay(id: string, decision: CourierPayDecision): Promise<Delivery> {
  requirePermission('deliveries', 'validate')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  if (delivery.status !== 'cancelled' && delivery.status !== 'failed') {
    throw new Error('La décision de paiement ne concerne que les livraisons retournées/échouées')
  }

  const amount = Math.max(0, Number(decision.amount) || 0)
  const updated: Delivery = {
    ...delivery,
    courierPayDecision: {
      decided: true,
      payCourier: decision.payCourier,
      amount,
      decidedAt: now(),
      decidedBy: currentUserId(),
      decidedByName: currentUserName(),
    },
    updatedAt: now(),
  }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)

  const detail = decision.payCourier
    ? `Livreur À PAYER - ${amount > 0 ? `${amount} FCFA` : 'frais de livraison prévus'}`
    : 'Livreur NON payé'
  await audit('courier-pay', 'delivery', delivery.id, `Décision paiement livreur pour ${delivery.number}: ${detail} (décidée par ${currentUserName()})`)

  if (decision.payCourier && delivery.courierId) {
    notifyUser(delivery.courierId, 'delivery_return', '🛵 Paiement livraison retournée approuvé', `La décision de paiement (${amount > 0 ? `${amount} FCFA` : 'frais prévus'}) pour ${delivery.number} a été approuvée`, '/mes-livraisons', { senderId: currentUserId() })
  }
  return updated
}

export async function cancelDelivery(id: string, reason?: string): Promise<Delivery> {
  requirePermission('deliveries', 'validate')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  if (delivery.status === 'delivered') throw new Error('Une livraison livrée ne peut pas être annulée, utilisez le retour')
  if (delivery.status === 'cancelled') throw new Error('Cette livraison est déjà annulée')

  const progressed = delivery.status === 'validated' || delivery.status === 'prepared' || delivery.status === 'in_transit'
  if (progressed && !delivery.stockReturned) {
    await returnStock(delivery)
  }

  let refunded = delivery.paid
  if (refunded > 0) {
    const refundEntry = {
      id: generateId(),
      businessId: delivery.businessId,
      date: now(),
      type: 'out' as const,
      category: 'Remboursements',
      amount: refunded,
      description: `Remboursement avance - ${delivery.number} (${delivery.customerName})`,
      partyId: delivery.customerId,
      partyName: delivery.customerName,
      paymentMethod: 'cash' as const,
      reference: delivery.number,
      linkedId: delivery.id,
      createdAt: now(),
      userId: currentUserId(),
    }
    await db.cashBook.add(refundEntry)
    await syncAfter('cashBook', refundEntry)
    await audit('refund', 'delivery', delivery.id, `Remboursement avance ${refunded} FCFA pour ${delivery.number} (${currentUserName()})`)
  }

  // La vente rattachée à la livraison annulée est annulée aussi (même sans avance).
  if (delivery.saleId) {
    await db.sales.update(delivery.saleId, { status: 'cancelled' })
  }

  const updated: Delivery = {
    ...delivery,
    status: 'cancelled',
    cancelledAt: now(),
    cancelReason: reason || 'Annulation',
    stockReturned: progressed ? true : delivery.stockReturned,
    refund: refunded,
    updatedAt: now(),
  }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('cancel', 'delivery', delivery.id, `Livraison ${delivery.number} annulée: ${reason || 'annulation'} (${currentUserName()})`)
  await notifySensitive({
    category: 'saleDelete',
    title: '🔴 Livraison annulée',
    message: `A annulé la livraison ${delivery.number} de ${delivery.customerName} (${reason || 'annulation'})`,
    link: '/deliveries',
  })
  return updated
}

export async function editDelivery(id: string, input: NewDeliveryInput): Promise<Delivery> {
  requirePermission('deliveries', 'edit')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  if (delivery.status === 'delivered' || delivery.status === 'cancelled' || delivery.status === 'failed') {
    throw new Error('Une livraison livrée, annulée ou en échec ne peut plus être modifiée')
  }
  if (!input.customerName?.trim()) throw new Error('Le nom du client est requis')
  if (!input.items?.length) throw new Error('Ajoutez au moins un article')

  let subtotal = 0
  const items: DeliveryItem[] = input.items.map(it => {
    if (!it.productId) throw new Error('Tous les articles doivent être avec des produits du catalogue')
    const qty = Number(it.quantity) || 0
    if (qty <= 0) throw new Error(`Quantité invalide pour "${it.productName}"`)
    const price = Number(it.unitPrice) || 0
    if (price < 0) throw new Error(`Prix invalide pour "${it.productName}"`)
    const total = Math.round(qty * price)
    subtotal += total
    return {
      id: generateId(),
      productId: it.productId,
      productName: it.productName,
      quantity: qty,
      unitPrice: price,
      unitName: it.unitName,
      unitQuantity: it.unitQuantity,
      total,
      locationId: it.locationId,
    }
  })

  const deliveryFeeClient = Math.max(0, Number(input.deliveryFeeClient) || 0)
  const deliveryFeeShop = Math.max(0, Number(input.deliveryFeeShop) || 0)
  const discount = Math.max(0, Number(input.discount) || 0)
  const total = Math.max(0, subtotal - discount + deliveryFeeClient)
  const paid = Math.min(delivery.paid || 0, total)

  // --- Stock : différence ligne par ligne (mêmes unités que la vente) ---
  const oldItems = delivery.items
  const deltaMap = new Map<string, { productId: string; locationId: string; delta: number; name: string }>()
  const applyDelta = (productId: string, locationId: string, delta: number, name: string) => {
    const key = `${productId}::${locationId}`
    const cur = deltaMap.get(key) || { productId, locationId, delta: 0, name }
    cur.delta += delta
    deltaMap.set(key, cur)
  }
  for (const it of oldItems) {
    const locId = it.locationId || delivery.locationId
    applyDelta(it.productId, locId, +deliveryMainQty(it), it.productName)
  }
  for (const it of items) {
    const locId = it.locationId || input.locationId || delivery.locationId
    applyDelta(it.productId, locId, -deliveryMainQty(it), it.productName)
  }
  for (const d of deltaMap.values()) {
    if (d.delta === 0) continue
    await adjustStockPublic(d.productId, d.locationId, d.delta, d.delta > 0 ? 'returned' : 'sold', delivery.number, `Modification livraison ${delivery.number} - ${d.name} (${currentUserName()})`)
  }

  // --- Vente rattachée : mise à jour des lignes & totaux ---
  if (delivery.saleId) {
    const sale = await db.sales.get(delivery.saleId)
    if (sale) {
      const saleItems: SaleItem[] = items.map(it => ({
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        unitName: it.unitName,
        unitQuantity: it.unitQuantity,
        discount: 0,
        taxRate: 0,
        total: it.total,
        locationId: it.locationId || delivery.locationId,
      }))
      const saleTotal = Math.max(0, subtotal - discount)
      await db.sales.update(sale.id, {
        items: saleItems,
        subtotal,
        discountTotal: discount,
        taxTotal: 0,
        total: saleTotal,
        customerId: input.customerId || undefined,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone,
        paymentStatus: paid >= saleTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
      })
      await syncAfter('sales', { id: sale.id, customerName: input.customerName.trim(), customerPhone: input.customerPhone })
      await notifySensitive({
        category: 'saleEdit',
        title: '🟠 Livraison modifiée',
        message: `A modifié la livraison ${delivery.number} (${delivery.customerName}) — vente ${sale.invoiceNumber}`,
        link: '/deliveries',
      })
    }
  }

  const updated: Delivery = {
    ...delivery,
    locationId: input.locationId || delivery.locationId,
    customerId: input.customerId || undefined,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone,
    customerAddress: input.customerAddress,
    quarter: input.quarter,
    deliveryNote: input.deliveryNote,
    items,
    subtotal,
    discount,
    deliveryFee: deliveryFeeClient + deliveryFeeShop,
    deliveryFeeClient,
    deliveryFeeShop,
    total,
    paid,
    paymentStatus: deliveryPaymentStatus({ payments: delivery.payments || [], paid, total }),
    updatedAt: now(),
  }
  await db.deliveries.put(updated)
  await syncAfter('deliveries', updated)
  await audit('edit', 'delivery', delivery.id, `Livraison ${delivery.number} modifiée (${currentUserName()})`)
  return updated
}

export async function deleteDelivery(id: string): Promise<void> {
  requirePermission('deliveries', 'delete')
  const delivery = await db.deliveries.get(id)
  if (!delivery) throw new Error('Livraison introuvable')
  if (delivery.status !== 'draft') {
    throw new Error('Seul un brouillon peut être supprimé. Annulez d’abord la livraison.')
  }
  try { await softDelete('deliveries', delivery.id, delivery as any, delivery.number) } catch {}
  await db.deliveries.delete(delivery.id)
  try { await syncDeleteObject('deliveries', delivery.id) } catch {}
  await audit('delete', 'delivery', delivery.id, `Livraison ${delivery.number} supprimée (${currentUserName()})`)
  await notifySensitive({
    category: 'saleDelete',
    title: '🔴 Livraison supprimée',
    message: `A supprimé la livraison ${delivery.number} (${delivery.customerName})`,
    link: '/deliveries',
  })
}
