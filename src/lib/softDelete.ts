import db from '@/db'
import { generateId } from './utils'
import { useAppStore } from '@/stores/appStore'

export type DeletableEntity =
  | 'products' | 'categories' | 'customers' | 'suppliers'
  | 'sales' | 'purchases' | 'invoices' | 'credits'
  | 'employees' | 'attendance' | 'payrolls' | 'leads'
  | 'locations' | 'cashBook' | 'notifications' | 'businesses'
  | 'users' | 'creditPayments'

export interface DeletedRecord {
  id: string
  businessId: string
  userId: string
  userName: string
  entity: DeletableEntity
  entityId: string
  entityName: string
  data: Record<string, unknown>
  deletedAt: string
}

function now(): string {
  return new Date().toISOString()
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

function entityLabel(entity: DeletableEntity): string {
  const labels: Record<string, string> = {
    products: 'Produit',
    categories: 'Catégorie',
    customers: 'Client',
    suppliers: 'Fournisseur',
    sales: 'Vente',
    purchases: 'Achat',
    creditPayments: 'Paiement crédit',
    invoices: 'Facture',
    credits: 'Crédit',
    employees: 'Employé',
    attendance: 'Présence',
    payrolls: 'Paie',
    leads: 'Lead',
    locations: 'Emplacement',
    cashBook: 'Caisse',
    notifications: 'Notification',
    businesses: 'Boutique',
    users: 'Utilisateur',
  }
  return labels[entity] || entity
}

export async function softDelete(
  entity: DeletableEntity,
  entityId: string,
  record: Record<string, unknown>,
  entityName?: string
): Promise<void> {
  const bizId = currentBizId()
  const userId = currentUserId()
  const userName = currentUserName()
  const name = entityName || (record?.name as string) || (record?.loginId as string) || entityId

  const deletedRecord: DeletedRecord = {
    id: generateId(),
    businessId: bizId,
    userId,
    userName,
    entity,
    entityId,
    entityName: name,
    data: record,
    deletedAt: now(),
  }

  await db.deletedRecords.add(deletedRecord)
}

export async function restore(entity: DeletableEntity, entityId: string): Promise<Record<string, unknown> | null> {
  const bizId = currentBizId()
  const record = await db.deletedRecords
    .where({ businessId: bizId, entity, entityId })
    .first()

  if (!record) return null

  const data = record.data

  if (entity === 'products') {
    await db.products.add(data as any)
  } else if (entity === 'categories') {
    await db.categories.add(data as any)
  } else if (entity === 'customers') {
    await db.customers.add(data as any)
  } else if (entity === 'suppliers') {
    await db.suppliers.add(data as any)
  } else if (entity === 'sales') {
    await db.sales.add(data as any)
    const saleData = data as any
    if (saleData.items && saleData.locationId) {
      for (const item of saleData.items) {
        const mainQty = item.unitQuantity ? item.quantity * item.unitQuantity : item.quantity
        const stockRecords = await db.productStocks.where({ productId: item.productId, locationId: saleData.locationId }).toArray()
        if (stockRecords.length > 0) {
          const sr = stockRecords[0]
          const before = sr.quantity
          const after = Math.max(0, before - mainQty)
          await db.productStocks.update(sr.id, { quantity: after, updatedAt: now() })
          await db.productHistory.add({
            id: generateId(),
            businessId: currentBizId(),
            productId: item.productId,
            locationId: saleData.locationId,
            action: 'sold',
            quantityBefore: before,
            quantityAfter: after,
            userId: currentUserId(),
            reference: saleData.invoiceNumber,
            comment: `Restauration vente #${saleData.invoiceNumber} par ${currentUserName()}`,
            createdAt: now(),
          })
        }
      }
    }
  } else if (entity === 'purchases') {
    await db.purchases.add(data as any)
  } else if (entity === 'invoices') {
    await db.invoices.add(data as any)
  } else if (entity === 'credits') {
    await db.credits.add(data as any)
    const creditData = data as any
    const customer = await db.customers.get(creditData.customerId)
    if (customer) {
      await db.customers.update(creditData.customerId, {
        currentBalance: (customer.currentBalance || 0) + creditData.balance,
      })
    }
  } else if (entity === 'creditPayments') {
    await db.creditPayments.add(data as any)
  } else if (entity === 'employees') {
    await db.employees.add(data as any)
  } else if (entity === 'attendance') {
    await db.attendance.add(data as any)
  } else if (entity === 'payrolls') {
    await db.payrolls.add(data as any)
  } else if (entity === 'leads') {
    await db.leads.add(data as any)
  } else if (entity === 'locations') {
    await db.locations.add(data as any)
  } else if (entity === 'cashBook') {
    await db.cashBook.add(data as any)
  } else if (entity === 'notifications') {
    await db.notifications.add(data as any)
  } else if (entity === 'businesses') {
    await db.businesses.add(data as any)
  } else if (entity === 'users') {
    await db.users.add(data as any)
  }

  await db.deletedRecords.where({ businessId: bizId, entity, entityId }).delete()

  return data
}

export async function permanentDelete(entity: DeletableEntity, entityId: string): Promise<void> {
  const bizId = currentBizId()
  await db.deletedRecords.where({ businessId: bizId, entity, entityId }).delete()
}

export async function getDeletedRecords(businessId: string): Promise<(DeletedRecord & { entityLabel: string })[]> {
  const records = await db.deletedRecords
    .where('businessId').equals(businessId)
    .reverse()
    .sortBy('deletedAt')

  return records.map(r => ({ ...r, entityLabel: entityLabel(r.entity) }))
}

export async function getDeletedRecordsByEntity(businessId: string, entity: DeletableEntity): Promise<DeletedRecord[]> {
  return db.deletedRecords
    .where({ businessId, entity })
    .reverse()
    .sortBy('deletedAt') as Promise<DeletedRecord[]>
}

export async function emptyTrash(businessId: string): Promise<void> {
  const records = await db.deletedRecords
    .where('businessId').equals(businessId)
    .toArray()

  for (const r of records) {
    await db.deletedRecords.delete(r.id)
  }
}

export async function emptyTrashByEntity(businessId: string, entity: DeletableEntity): Promise<void> {
  await db.deletedRecords
    .where({ businessId, entity })
    .delete()
}
