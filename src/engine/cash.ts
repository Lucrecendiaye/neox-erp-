import db from '@/db'
import { generateId } from '@/lib/utils'
import { syncWriteObject, syncDeleteObject } from '@/lib/realtime'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { requirePermission } from '@/lib/checkPermission'
import { softDelete } from '@/lib/softDelete'
import type { CashOperation, CashCategory, CashOperationType, CashOutNature, AccountingEntry, Account } from '@/types'

export const CASH_OUT_NATURES: { value: CashOutNature; label: string; hint: string }[] = [
  { value: 'charge', label: 'Charge', hint: 'Impacte le bénéfice net (ex: salaires, loyer, transport)' },
  { value: 'dépense', label: 'Dépense', hint: 'Sortie d’argent sans impact sur le bénéfice (ex: achat marchandise)' },
  { value: 'retrait', label: 'Retrait', hint: 'Retrait de caisse (non opérationnelle)' },
  { value: 'transfert', label: 'Transfert', hint: 'Transfert de fonds entre comptes/caisses' },
  { value: 'autre', label: 'Autre', hint: 'Autre sortie non catégorisée' },
]

export function cashOutNatureLabel(nature?: CashOutNature): string {
  if (!nature) return 'Charge'
  return CASH_OUT_NATURES.find(n => n.value === nature)?.label || nature
}

export const CASH_DEFAULT_CATEGORIES: { name: string; type: CashCategory['type'] }[] = [
  { name: 'Ventes marché', type: 'in' },
  { name: 'Commissions', type: 'in' },
  { name: 'Prestations de service', type: 'in' },
  { name: 'Remboursements', type: 'in' },
  { name: 'Encaissement vente', type: 'in' },
  { name: 'Encaissement livraison', type: 'in' },
  { name: 'Acompte crédit', type: 'in' },
  { name: 'Autres entrées', type: 'in' },
  { name: 'Achat extérieur', type: 'out' },
  { name: 'Frais de livraison', type: 'out' },
  { name: 'Transport', type: 'out' },
  { name: 'Manutention', type: 'out' },
  { name: 'Location', type: 'out' },
  { name: 'Salaires & rémunérations', type: 'out' },
  { name: 'Dépenses personnelles', type: 'out' },
  { name: 'Autres sorties', type: 'out' },
]

export const CASH_ACCOUNT_NAMES = {
  cash: 'Caisse',
  external: 'Cash externe',
  revenue: 'Revenus cash',
  expense: 'Dépenses cash',
} as const

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

export async function ensureCashAccounts() {
  const businessId = currentBizId()
  if (!businessId) return
  const defs: { code: string; name: string; type: Account['type'] }[] = [
    { code: '1010', name: CASH_ACCOUNT_NAMES.cash, type: 'asset' },
    { code: '1020', name: CASH_ACCOUNT_NAMES.external, type: 'asset' },
    { code: '7100', name: CASH_ACCOUNT_NAMES.revenue, type: 'revenue' },
    { code: '6100', name: CASH_ACCOUNT_NAMES.expense, type: 'expense' },
  ]
  for (const def of defs) {
    const existing = await db.accounts.where({ businessId, name: def.name }).first()
    if (!existing) {
      const acc: Account = {
        id: generateId(),
        businessId,
        code: def.code,
        name: def.name,
        type: def.type,
        balance: 0,
        createdAt: now(),
      }
      await db.accounts.add(acc)
      await syncAfter('accounts', acc)
    }
  }
}

export async function ensureCashCategories() {
  const businessId = currentBizId()
  if (!businessId) return
  const existing = await db.cashCategories.where('businessId').equals(businessId).count()
  if (existing > 0) return
  const cats: CashCategory[] = CASH_DEFAULT_CATEGORIES.map((c, i) => ({
    id: generateId(),
    businessId,
    name: c.name,
    type: c.type,
    isDefault: true,
    active: true,
    createdAt: now(),
  }))
  await db.cashCategories.bulkAdd(cats)
  for (const cat of cats) await syncAfter('cashCategories', cat)
}

export async function generateCashNumber(): Promise<string> {
  const businessId = currentBizId()
  const all = await db.cashOps.where('businessId').equals(businessId).toArray()
  const max = all.reduce((m, o) => {
    const n = parseInt(o.number?.replace(/\D/g, '') || '0', 10)
    return isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `CASH-${String(max + 1).padStart(6, '0')}`
}

export async function getCashBalance(businessId: string): Promise<number> {
  const ops = await db.cashOps.where('businessId').equals(businessId).filter(o => o.status === 'completed').toArray()
  return ops.reduce((s, o) => s + (o.type === 'in' ? o.amount : -o.amount), 0)
}

async function recomputeBalances(businessId: string) {
  const ops = await db.cashOps.where('businessId').equals(businessId).toArray()
  const completed = ops.filter(o => o.status === 'completed').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  let balance = 0
  for (const op of completed) {
    balance += op.type === 'in' ? op.amount : -op.amount
    if (op.balanceAfter !== balance) {
      await db.cashOps.update(op.id, { balanceAfter: balance })
    }
  }
}

async function writeAccountingEntries(op: CashOperation) {
  await ensureCashAccounts()
  const cashAccountName = op.paymentMethod === 'cash' ? CASH_ACCOUNT_NAMES.cash : CASH_ACCOUNT_NAMES.external
  const cashAccount = await db.accounts.where({ businessId: op.businessId, name: cashAccountName }).first()
  const resultAccountName = op.type === 'in' ? CASH_ACCOUNT_NAMES.revenue : CASH_ACCOUNT_NAMES.expense
  const resultAccount = await db.accounts.where({ businessId: op.businessId, name: resultAccountName }).first()

  const entries: AccountingEntry[] = [
    {
      id: generateId(),
      businessId: op.businessId,
      date: op.createdAt,
      type: op.type === 'in' ? 'revenue' : 'expense',
      accountId: cashAccount?.id || '',
      accountName: cashAccountName,
      amount: op.amount,
      direction: op.type === 'in' ? 'debit' : 'credit',
      reference: op.number,
      description: op.description || op.categoryName || 'Opération cash',
      linkedId: op.id,
      linkedType: 'cash-operation',
      createdAt: op.createdAt,
      userId: op.userId,
    },
    {
      id: generateId(),
      businessId: op.businessId,
      date: op.createdAt,
      type: op.type === 'in' ? 'revenue' : 'expense',
      accountId: resultAccount?.id || '',
      accountName: resultAccountName,
      amount: op.amount,
      direction: op.type === 'in' ? 'credit' : 'debit',
      reference: op.number,
      description: op.description || op.categoryName || 'Opération cash',
      linkedId: op.id,
      linkedType: 'cash-operation',
      createdAt: op.createdAt,
      userId: op.userId,
    },
  ]
  await db.accountingEntries.bulkAdd(entries)
  for (const e of entries) await syncAfter('accountingEntries', e)
}

async function removeAccountingEntries(opId: string) {
  const entries = await db.accountingEntries.where('businessId').equals(currentBizId()).filter(e => e.linkedId === opId).toArray()
  for (const e of entries) {
    await db.accountingEntries.delete(e.id)
    if (isSupabaseConfigured()) {
      await syncDeleteObject('accountingEntries', e.id).catch(() => {})
    }
  }
}

function buildDate(dateInput: string): string {
  const today = new Date().toISOString().split('T')[0]
  if (dateInput === today || !dateInput) return now()
  return `${dateInput}T12:00:00.000Z`
}

export interface CashOperationInput {
  type: CashOperationType
  amount: number
  categoryId?: string
  categoryName?: string
  description?: string
  partyName?: string
  paymentMethod: CashOperation['paymentMethod']
  locationId?: string
  date: string
  reference?: string
  receiptPhoto?: string
  nature?: CashOutNature
}

export async function processCashOperation(input: CashOperationInput): Promise<CashOperation> {
  requirePermission('cash', 'create')
  const businessId = currentBizId()
  const userId = currentUserId()
  if (!businessId) throw new Error('Aucune boutique active')
  if (!input.amount || input.amount <= 0) throw new Error('Montant invalide')
  if (!input.type) throw new Error('Type d\'opération invalide')
  if (!input.paymentMethod) throw new Error('Moyen de paiement requis')

  const op: CashOperation = {
    id: generateId(),
    businessId,
    number: await generateCashNumber(),
    type: input.type,
    amount: input.amount,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    description: input.description,
    partyName: input.partyName,
    paymentMethod: input.paymentMethod,
    locationId: input.locationId,
    locationName: input.locationId
      ? (await db.locations.get(input.locationId))?.name
      : undefined,
    status: 'completed',
    nature: input.type === 'out' ? (input.nature || 'charge') : undefined,
    date: buildDate(input.date),
    reference: input.reference,
    receiptPhoto: input.receiptPhoto,
    userId,
    userName: currentUserName(),
    createdAt: now(),
  }

  await db.cashOps.add(op)
  await writeAccountingEntries(op)
  await recomputeBalances(businessId)
  const updated = (await db.cashOps.get(op.id)) as CashOperation
  await syncAfter('cashOps', updated)
  await audit('create', 'cash-operation', op.id, `Opération ${op.number} - ${op.type === 'in' ? 'Entrée' : 'Sortie'} ${op.amount} FCFA (${op.categoryName || 'Sans catégorie'}) par ${op.userName}`)
  return updated
}

export async function editCashOperation(id: string, updates: Partial<CashOperationInput>): Promise<CashOperation> {
  requirePermission('cash', 'edit')
  const existing = await db.cashOps.get(id)
  if (!existing) throw new Error('Opération introuvable')
  if (existing.status === 'cancelled') throw new Error('Cette opération est annulée')

  const patch: Partial<CashOperation> = {
    type: updates.type || existing.type,
    amount: updates.amount ?? existing.amount,
    categoryId: updates.categoryId !== undefined ? updates.categoryId : existing.categoryId,
    categoryName: updates.categoryName !== undefined ? updates.categoryName : existing.categoryName,
    description: updates.description !== undefined ? updates.description : existing.description,
    partyName: updates.partyName !== undefined ? updates.partyName : existing.partyName,
    paymentMethod: updates.paymentMethod || existing.paymentMethod,
    locationId: updates.locationId !== undefined ? updates.locationId : existing.locationId,
    reference: updates.reference !== undefined ? updates.reference : existing.reference,
    receiptPhoto: updates.receiptPhoto !== undefined ? updates.receiptPhoto : existing.receiptPhoto,
    updatedAt: now(),
  }
  if (updates.date) patch.date = buildDate(updates.date)
  if ((patch.type ?? existing.type) === 'out') {
    patch.nature = updates.nature !== undefined ? updates.nature : (existing.nature || 'charge')
  } else {
    patch.nature = undefined
  }

  if (patch.amount! <= 0) throw new Error('Montant invalide')

  await db.cashOps.update(id, patch)
  await removeAccountingEntries(id)
  await writeAccountingEntries({ ...existing, ...patch } as CashOperation)
  await recomputeBalances(existing.businessId)

  const updated = (await db.cashOps.get(id)) as CashOperation
  await syncAfter('cashOps', updated)
  await audit('edit', 'cash-operation', id, `Modification ${updated.number} - ${updated.amount} FCFA par ${currentUserName()}`)
  return updated
}

export async function cancelCashOperation(id: string, reason?: string): Promise<CashOperation> {
  requirePermission('cash', 'edit')
  const existing = await db.cashOps.get(id)
  if (!existing) throw new Error('Opération introuvable')
  if (existing.status === 'cancelled') throw new Error('Cette opération est déjà annulée')

  const cancelledAt = now()
  await db.cashOps.update(id, { status: 'cancelled', cancelledAt, cancelledBy: currentUserId(), cancelReason: reason, balanceAfter: undefined, updatedAt: cancelledAt })
  await removeAccountingEntries(id)
  await recomputeBalances(existing.businessId)

  const updated = (await db.cashOps.get(id)) as CashOperation
  await syncAfter('cashOps', updated)
  await audit('delete', 'cash-operation', id, `Annulation ${updated.number} - ${reason || 'sans motif'} par ${currentUserName()}`)
  return updated
}

export async function deleteCashOperation(id: string): Promise<void> {
  requirePermission('cash', 'delete')
  const existing = await db.cashOps.get(id)
  if (!existing) throw new Error('Opération introuvable')

  await removeAccountingEntries(id)
  await db.cashOps.delete(id)
  await softDelete('cashOps', id, existing as any, `${existing.number} - ${existing.categoryName || ''}`)
  await recomputeBalances(existing.businessId)
  if (isSupabaseConfigured()) {
    await syncDeleteObject('cashOps', id).catch(() => {})
  }
  await audit('delete', 'cash-operation', id, `Suppression ${existing.number} par ${currentUserName()}`)
}

export async function addCashCategory(name: string, type: CashCategory['type']): Promise<CashCategory> {
  requirePermission('cash', 'create')
  const businessId = currentBizId()
  if (!name.trim()) throw new Error('Nom requis')
  const cat: CashCategory = {
    id: generateId(),
    businessId,
    name: name.trim(),
    type,
    active: true,
    createdAt: now(),
  }
  await db.cashCategories.add(cat)
  await syncAfter('cashCategories', cat)
  await audit('create', 'cash-category', cat.id, `Catégorie cash « ${cat.name} » créée par ${currentUserName()}`)
  return cat
}

export async function editCashCategory(id: string, updates: { name?: string; type?: CashCategory['type']; active?: boolean }): Promise<void> {
  requirePermission('cash', 'edit')
  const existing = await db.cashCategories.get(id)
  if (!existing) throw new Error('Catégorie introuvable')
  if (existing.isDefault && updates.active === false) throw new Error('Impossible de désactiver une catégorie par défaut')
  const patch: Partial<CashCategory> = {}
  if (updates.name !== undefined) {
    if (!updates.name.trim()) throw new Error('Nom requis')
    patch.name = updates.name.trim()
    await db.cashOps.where('categoryId').equals(id).modify(o => {
      o.categoryName = patch.name!
    })
  }
  if (updates.type !== undefined) patch.type = updates.type
  if (updates.active !== undefined) patch.active = updates.active
  await db.cashCategories.update(id, patch)
  await syncAfter('cashCategories', { ...existing, ...patch, id })
  await audit('edit', 'cash-category', id, `Catégorie cash modifiée par ${currentUserName()}`)
}

export async function deleteCashCategory(id: string): Promise<void> {
  requirePermission('cash', 'delete')
  const existing = await db.cashCategories.get(id)
  if (!existing) throw new Error('Catégorie introuvable')
  if (existing.isDefault) throw new Error('Impossible de supprimer une catégorie par défaut')
  const used = await db.cashOps.where('categoryId').equals(id).count()
  if (used > 0) throw new Error('Cette catégorie est utilisée. Désactivez-la à la place.')
  await db.cashCategories.delete(id)
  await softDelete('cashCategories', id, existing as any, existing.name)
  if (isSupabaseConfigured()) {
    await syncDeleteObject('cashCategories', id).catch(() => {})
  }
  await audit('delete', 'cash-category', id, `Catégorie cash « ${existing.name} » supprimée par ${currentUserName()}`)
}