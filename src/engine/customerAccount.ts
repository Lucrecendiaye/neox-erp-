import db from '@/db'
import { generateId } from '@/lib/utils'
import { syncWriteObject, syncDeleteObject } from '@/lib/realtime'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { requirePermission } from '@/lib/checkPermission'
import { partyLoanSummary } from './loan'
import type { CustomerEntry, CustomerEntryType, PaymentMethod } from '@/types'

function currentBizId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

function currentUser(): { id: string; name: string } {
  const state = useAppStore.getState()
  return { id: state.user?.id || '', name: state.user?.name || '' }
}

function now(): string {
  return new Date().toISOString()
}

async function syncAfter(obj: Record<string, any>) {
  if (isSupabaseConfigured()) await syncWriteObject('customerEntries', obj).catch(() => {})
}

/** Libellés lisibles pour le relevé et l'UI. */
export const CUSTOMER_ENTRY_LABELS: Record<CustomerEntryType, string> = {
  advance_received: 'Avance déposée',
  advance_used: 'Avance utilisée sur une vente',
  advance_refunded: 'Avance remboursée au client',
  loan_given: 'Prêt accordé',
  loan_repaid: 'Prêt remboursé',
  credit_created: 'Dette (vente à crédit)',
  credit_paid: 'Paiement de dette',
}

/**
 * Sens comptable depuis le point de vue de la boutique :
 * +1 : le client doit plus / j'ai moins — géré par `buildCustomerStatement` (débit/crédit).
 */

export interface NewCustomerEntryInput {
  customerId: string
  customerName: string
  type: CustomerEntryType
  amount: number
  date?: string
  reference?: string
  note?: string
  linkedId?: string
  category?: string
  /** Écritures additionnelles à réaliser dans la même transaction atomique. */
  sideEffects?: (tx: typeof db) => Promise<void>
}

/**
 * Enregistre un mouvement de compte client (grand livre append-only).
 * Aucune écriture n'est jamais modifiée : on ajoute toujours une nouvelle ligne.
 */
export async function addCustomerEntry(input: NewCustomerEntryInput): Promise<CustomerEntry> {
  requirePermission('customers', 'create')
  const amount = Math.round(Math.abs(Number(input.amount) || 0))
  if (amount <= 0) throw new Error('Le montant doit être supérieur à 0')

  const entry: CustomerEntry = {
    id: generateId(),
    businessId: currentBizId(),
    customerId: input.customerId,
    customerName: input.customerName,
    type: input.type,
    amount,
    date: input.date || now(),
    reference: input.reference,
    note: input.note,
    linkedId: input.linkedId,
    category: input.category || CUSTOMER_ENTRY_LABELS[input.type],
    userId: currentUser().id,
    createdAt: now(),
  }

  await db.transaction('rw', [db.customerEntries, db.customers], async () => {
    await db.customerEntries.add(entry)
    if (input.sideEffects) await input.sideEffects(db)
    await recomputeAdvanceBalance(input.customerId)
  })

  await syncAfter(entry)
  return entry
}

/**
 * Recalcule l'avance du client depuis le grand livre (jamais de valeur mutable
 * en dehors de ce recalcul). L'avance = son argent que je détiens.
 */
export async function recomputeAdvanceBalance(customerId: string): Promise<number> {
  const entries = await db.customerEntries.where('customerId').equals(customerId).toArray()
  let advance = 0
  for (const e of entries) {
    if (e.type === 'advance_received') advance += e.amount
    else if (e.type === 'advance_used' || e.type === 'advance_refunded') advance -= e.amount
  }
  advance = Math.max(0, Math.round(advance))
  const customer = await db.customers.get(customerId)
  if (customer && customer.advanceBalance !== advance) {
    await db.customers.update(customerId, { advanceBalance: advance, updatedAt: now() })
  }
  return advance
}

export interface CustomerAccountSummary {
  /** Dette du client envers la boutique (crédits non soldés). */
  debt: number
  /** Argent du client détenu par la boutique (avance). */
  advance: number
  /** Prêt accordé par la boutique au client (reste dû). */
  loanBalance: number
  /** Total prêté (historique). */
  loanTotal: number
  /** Total remboursé sur les prêts. */
  loanRepaid: number
  /** Solde net : > 0 le client me doit, < 0 j'ai de l'argent à lui. */
  net: number
}

/** Synthèse complète du compte client (dette + avance + prêt), toujours calculée. */
export async function customerAccountSummary(customerId: string): Promise<CustomerAccountSummary> {
  const credits = await db.credits.where('businessId').equals(currentBizId())
    .filter(c => c.customerId === customerId).toArray()
  const debt = credits.reduce((s, c) => s + (c.status === 'paid' ? 0 : Math.max(0, c.balance)), 0)

  const advance = await recomputeAdvanceBalance(customerId)

  const loans = await partyLoanSummary(customerId)

  const net = Math.round(debt + loans.balance - advance)

  return {
    debt: Math.round(debt),
    advance,
    loanBalance: Math.round(loans.balance),
    loanTotal: Math.round(loans.totalLoaned),
    loanRepaid: Math.round(loans.totalPaid),
    net,
  }
}

/** Liste chronologique des mouvements du compte client. */
export async function listCustomerEntries(customerId: string): Promise<CustomerEntry[]> {
  const all = await db.customerEntries.where('customerId').equals(customerId).toArray()
  return all.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : a.createdAt > b.createdAt ? 1 : -1))
}

/**
 * Relevé complet du client, combinant ventes, crédits, paiements, prêts,
 * avances et rappels — pour impression / litige.
 */
export interface StatementLine {
  date: string
  kind: 'sale' | 'credit' | 'credit_payment' | 'loan' | 'loan_payment' | 'advance'
  label: string
  reference: string
  debit: number
  credit: number
  /** Solde courant après ce mouvement (positif = il me doit). */
  running: number
}

export async function buildCustomerStatement(customerId: string): Promise<{ lines: StatementLine[]; summary: CustomerAccountSummary }> {
  const biz = currentBizId()
  const sales = await db.sales.where('businessId').equals(biz).filter(s => s.customerId === customerId).toArray()
  const creditPayments = await db.creditPayments.where('businessId').equals(biz).filter(p => p.customerId === customerId).toArray()
  const loans = await db.loans.where('partyId').equals(customerId).toArray()
  const loanPayments = await db.loanPayments.where('partyId').equals(customerId).toArray()
  const entries = await listCustomerEntries(customerId)

  const raw: Omit<StatementLine, 'running'>[] = []

  for (const s of sales) {
    if (s.status === 'cancelled') continue
    raw.push({
      date: s.createdAt,
      kind: 'sale',
      label: 'Vente',
      reference: s.invoiceNumber || s.id.slice(0, 8),
      debit: s.total,
      credit: s.paid || 0,
    })
  }
  for (const p of creditPayments) {
    raw.push({ date: p.date, kind: 'credit_payment', label: 'Paiement de dette', reference: String(p.method), debit: 0, credit: p.amount })
  }
  for (const l of loans) {
    if (l.status === 'cancelled') continue
    raw.push({ date: l.createdAt, kind: 'loan', label: `Prêt ${l.number}`, reference: l.number, debit: l.amount, credit: l.paid || 0 })
  }
  for (const p of loanPayments) {
    raw.push({ date: p.date, kind: 'loan_payment', label: 'Remboursement de prêt', reference: String(p.method), debit: 0, credit: p.amount })
  }
  for (const e of entries) {
    if (e.type === 'advance_received') {
      raw.push({ date: e.date, kind: 'advance', label: 'Avance déposée', reference: e.reference || '—', debit: 0, credit: e.amount })
    } else if (e.type === 'advance_used') {
      raw.push({ date: e.date, kind: 'advance', label: 'Avance utilisée', reference: e.reference || '—', debit: e.amount, credit: 0 })
    } else if (e.type === 'advance_refunded') {
      raw.push({ date: e.date, kind: 'advance', label: 'Avance rendue au client', reference: e.reference || '—', debit: e.amount, credit: 0 })
    }
  }

  raw.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0))

  let running = 0
  const lines: StatementLine[] = raw.map(l => {
    running += l.debit - l.credit
    return { ...l, running }
  })

  const summary = await customerAccountSummary(customerId)
  return { lines, summary }
}

/** Enregistre un remboursement d'avance (sortie de caisse). */
export async function refundAdvance(opts: { customerId: string; customerName: string; amount: number; method: PaymentMethod; note?: string }): Promise<void> {
  requirePermission('customers', 'edit')
  const amount = Math.round(Math.abs(Number(opts.amount) || 0))
  const current = await recomputeAdvanceBalance(opts.customerId)
  if (amount > current) throw new Error(`L'avance disponible est de ${current} FCFA`)

  const entryId = generateId()
  await addCustomerEntry({
    customerId: opts.customerId,
    customerName: opts.customerName,
    type: 'advance_refunded',
    amount,
    note: opts.note,
    category: 'Avance remboursée',
    sideEffects: async () => {
      await db.cashBook.add({
        id: generateId(),
        businessId: currentBizId(),
        date: now(),
        type: 'out',
        category: 'Remboursement avance client',
        amount,
        description: `Remboursement d'avance à ${opts.customerName}${opts.note ? ` — ${opts.note}` : ''}`,
        partyId: opts.customerId,
        partyName: opts.customerName,
        paymentMethod: opts.method,
        reference: 'AVANCE',
        linkedId: entryId,
        createdAt: now(),
        userId: currentUser().id,
      })
    },
  })
}

/** Supprime un mouvement du grand livre (usage admin, traçabilité via audit). */
export async function deleteCustomerEntry(entryId: string): Promise<void> {
  requirePermission('customers', 'delete')
  const entry = await db.customerEntries.get(entryId)
  if (!entry) return
  await db.customerEntries.delete(entryId)
  try { await syncDeleteObject('customerEntries', entryId) } catch {}
  await recomputeAdvanceBalance(entry.customerId)
}
