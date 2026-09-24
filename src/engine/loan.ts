import db from '@/db'
import { generateId } from '@/lib/utils'
import { syncWriteObject, syncDeleteObject } from '@/lib/realtime'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { requirePermission } from '@/lib/checkPermission'
import { softDelete } from '@/lib/softDelete'
import { notifySensitive } from './sensitiveNotifications'
import type { Loan, LoanPayment, PaymentMethod } from '@/types'

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

async function syncAfter(table: keyof typeof db, obj: Record<string, any>) {
  if (isSupabaseConfigured()) {
    await syncWriteObject(table, obj).catch(() => {})
  }
}

async function nextLoanNumber(): Promise<string> {
  let max = 0
  const all = await db.loans.where('businessId').equals(currentBizId()).toArray()
  for (const l of all) {
    const m = /(\d+)\s*$/.exec(l.number || '')
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `PRET-${String(max + 1).padStart(4, '0')}`
}

/** Recherche intelligente d'une personne existante (téléphone prioritaire, sinon nom exact). */
export async function findParty(opts: { kind: 'customer' | 'supplier'; name?: string; phone?: string }): Promise<{ id: string; name: string } | null> {
  const phone = (opts.phone || '').replace(/[^\d]/g, '')
  if (phone) {
    const table = opts.kind === 'customer' ? db.customers : db.suppliers
    const found = await table.where('businessId').equals(currentBizId()).toArray()
    const byPhone = found.find(p => (p.phone || '').replace(/[^\d]/g, '') === phone)
    if (byPhone) return { id: byPhone.id, name: byPhone.name }
  }
  const name = (opts.name || '').trim().toLowerCase()
  if (name) {
    const table = opts.kind === 'customer' ? db.customers : db.suppliers
    const found = await table.where('businessId').equals(currentBizId()).toArray()
    const byName = found.find(p => p.name.trim().toLowerCase() === name)
    if (byName) return { id: byName.id, name: byName.name }
  }
  return null
}

export interface NewLoanInput {
  partyKind: 'customer' | 'supplier'
  /** Id de la fiche (client/fournisseur) existante — obligatoire, jamais de doublon. */
  partyId: string
  amount: number
  dueDate?: string
  rate?: number
  note?: string
}

export async function createLoan(input: NewLoanInput): Promise<Loan> {
  requirePermission('sales', 'create')
  let party: { id: string; name: string } | null = null
  if (input.partyKind === 'customer') {
    const c = await db.customers.get(input.partyId)
    if (c) party = { id: c.id, name: c.name }
  } else {
    const s = await db.suppliers.get(input.partyId)
    if (s) party = { id: s.id, name: s.name }
  }
  if (!party) throw new Error('Client ou fournisseur introuvable — impossible de créer un prêt sans fiche existante')
  const amount = Math.round(Math.abs(Number(input.amount) || 0))
  if (amount <= 0) throw new Error('Le montant du prêt doit être supérieur à 0')

  const loan: Loan = {
    id: generateId(),
    businessId: currentBizId(),
    number: await nextLoanNumber(),
    partyKind: input.partyKind,
    partyId: party.id,
    partyName: party.name,
    amount,
    paid: 0,
    balance: amount,
    dueDate: input.dueDate || undefined,
    rate: input.rate,
    note: input.note,
    status: 'active',
    createdAt: now(),
    userId: currentUser().id,
    userName: currentUser().name,
  }
  await db.loans.add(loan)
  await syncAfter('loans', loan)

  await db.auditLogs.add({
    id: generateId(),
    businessId: currentBizId(),
    userId: currentUser().id,
    userName: currentUser().name,
    action: 'loan_create',
    entity: 'loan',
    entityId: loan.id,
    details: `Prêt ${loan.number} de ${amount} FCFA pour ${party.name}`,
    createdAt: now(),
  })
  return loan
}

export async function listLoans(partyId: string): Promise<Loan[]> {
  const all = await db.loans.where('partyId').equals(partyId).toArray()
  return all.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))
}

export interface PartyLoanSummary {
  totalLoaned: number
  totalPaid: number
  balance: number
  activeCount: number
}

export async function partyLoanSummary(partyId: string): Promise<PartyLoanSummary> {
  const loans = await listLoans(partyId)
  return {
    totalLoaned: loans.reduce((s, l) => s + l.amount, 0),
    totalPaid: loans.reduce((s, l) => s + l.paid, 0),
    balance: loans.reduce((s, l) => s + (l.status === 'cancelled' ? 0 : l.balance), 0),
    activeCount: loans.filter(l => l.status !== 'paid' && l.status !== 'cancelled').length,
  }
}

export interface RepayLoanInput {
  partyId: string
  partyKind: 'customer' | 'supplier'
  amount: number
  method: PaymentMethod
  loanId?: string
  note?: string
}

/**
 * Remboursement de prêt. Par défaut les prêts actifs sont remboursés du plus ancien
 * au plus récent (FIFO) ; un prêt précis peut être ciblé via loanId.
 */
export async function repayLoan(input: RepayLoanInput): Promise<LoanPayment> {
  requirePermission('sales', 'create')
  const amount = Math.round(Math.abs(Number(input.amount) || 0))
  if (amount <= 0) throw new Error('Le montant du remboursement doit être supérieur à 0')

  const loans = (await listLoans(input.partyId))
    .filter(l => l.status !== 'cancelled' && l.balance > 0)
  const totalBalance = loans.reduce((s, l) => s + l.balance, 0)
  if (amount > totalBalance) throw new Error(`Le montant dépasse le solde restant dû (${totalBalance} FCFA)`)

  let remaining = amount
  const touched: string[] = []
  const pool = input.loanId
    ? loans.filter(l => l.id === input.loanId)
    : loans.sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1))

  for (const loan of pool) {
    if (remaining <= 0) break
    const take = Math.min(loan.balance, remaining)
    const newPaid = loan.paid + take
    const newBalance = loan.balance - take
    const status = newBalance <= 0 ? 'paid' as const : 'partial' as const
    await db.loans.update(loan.id, { paid: newPaid, balance: newBalance, status })
    await syncAfter('loans', { id: loan.id, paid: newPaid, balance: newBalance, status })
    touched.push(loan.id)
    remaining -= take
  }
  if (remaining > 0) throw new Error('Remboursement non affecté : aucune fiche de prêt')

  const user = currentUser()
  const payment: LoanPayment = {
    id: generateId(),
    businessId: currentBizId(),
    loanIds: touched,
    partyKind: input.partyKind,
    partyId: input.partyId,
    amount,
    method: input.method,
    note: input.note,
    date: now(),
    userId: user.id,
    createdAt: now(),
  }
  await db.loanPayments.add(payment)
  await syncAfter('loanPayments', payment)

  const partyName = loans[0]?.partyName || ''
  const entry = {
    id: generateId(),
    businessId: currentBizId(),
    date: now(),
    type: 'in' as const,
    category: 'Remboursement prêt',
    amount,
    description: `Remboursement de prêt (${partyName})${input.note ? ` — ${input.note}` : ''}`,
    partyId: input.partyId,
    partyName,
    paymentMethod: input.method,
    reference: 'PRET',
    linkedId: payment.id,
    createdAt: now(),
    userId: user.id,
  }
  await db.cashBook.add(entry)
  await syncAfter('cashBook', entry)

  await db.auditLogs.add({
    id: generateId(),
    businessId: currentBizId(),
    userId: user.id,
    userName: user.name,
    action: 'loan_repay',
    entity: 'loan',
    entityId: input.partyId,
    details: `Remboursement de prêt ${amount} FCFA à ${partyName}`,
    createdAt: now(),
  })
  return payment
}

export async function deleteLoan(loanId: string): Promise<void> {
  requirePermission('sales', 'delete')
  const loan = await db.loans.get(loanId)
  if (!loan) throw new Error('Prêt introuvable')
  try { await softDelete('loans', loan.id, loan as any, loan.number) } catch {}
  await db.loans.delete(loan.id)
  try { await syncDeleteObject('loans', loanId) } catch {}
  await notifySensitive({
    category: 'loanDelete',
    title: '🔴 Prêt supprimé',
    message: `L'utilisateur ${currentUser().name} a supprimé le prêt ${loan.number} de ${loan.amount} FCFA (${loan.partyName})`,
    link: '/customers',
  })
  await db.auditLogs.add({
    id: generateId(),
    businessId: currentBizId(),
    userId: currentUser().id,
    userName: currentUser().name,
    action: 'loan_delete',
    entity: 'loan',
    entityId: loan.id,
    details: `Prêt ${loan.number} (${loan.amount} FCFA) supprimé pour ${loan.partyName}`,
    createdAt: now(),
  })
}

export async function cancelLoan(loanId: string): Promise<void> {
  requirePermission('sales', 'delete')
  const loan = await db.loans.get(loanId)
  if (!loan) throw new Error('Prêt introuvable')
  await db.loans.update(loanId, { status: 'cancelled', balance: 0 })
  await syncAfter('loans', { id: loanId, status: 'cancelled', balance: 0 })
}
