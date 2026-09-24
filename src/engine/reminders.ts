import db from '@/db'
import { generateId } from '@/lib/utils'
import { syncWriteObject } from '@/lib/realtime'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { requirePermission } from '@/lib/checkPermission'
import { createNotification } from './notifications'
import type { DebtReminder, ReminderStatus } from '@/types'

function currentBizId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

function currentUserId(): string {
  return useAppStore.getState().user?.id || ''
}

function now(): string {
  return new Date().toISOString()
}

async function syncAfter(obj: DebtReminder) {
  if (isSupabaseConfigured()) await syncWriteObject('reminders', obj).catch(() => {})
}

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeReminderStatus(r: Pick<DebtReminder, 'status' | 'remindDate' | 'dueDate'>): ReminderStatus {
  if (r.status === 'done' || r.status === 'postponed') return r.status
  const today = dayStr(new Date())
  const target = r.remindDate || r.dueDate || today
  if (target === today) return 'today'
  if (target < today) return 'overdue'
  return 'upcoming'
}

export interface NewReminderInput {
  creditId?: string
  saleId?: string
  customerId: string
  customerName: string
  customerPhone?: string
  debtAmount: number
  paidAmount: number
  dueDate?: string
  remindDate?: string
  note?: string
}

/** Crée un rappel s'il n'en existe pas déjà pour le crédit / la vente. */
export async function ensureReminder(input: NewReminderInput): Promise<DebtReminder | null> {
  if (input.debtAmount <= 0) return null
  const existing = input.creditId
    ? await db.reminders.where('creditId').equals(input.creditId).first()
    : input.saleId
      ? await db.reminders.where('saleId').equals(input.saleId).first()
      : null
  if (existing) return existing

  const reminder: DebtReminder = {
    id: generateId(),
    businessId: currentBizId(),
    creditId: input.creditId,
    saleId: input.saleId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    debtAmount: Math.round(input.debtAmount),
    paidAmount: Math.round(input.paidAmount),
    dueDate: input.dueDate,
    remindDate: input.remindDate || input.dueDate || dayStr(new Date()),
    status: 'upcoming',
    note: input.note,
    createdAt: now(),
    updatedAt: now(),
    userId: currentUserId(),
  }
  await db.reminders.add(reminder)
  await syncAfter(reminder)
  return reminder
}

export async function markReminderDone(id: string): Promise<void> {
  await db.reminders.update(id, { status: 'done', updatedAt: now() })
  const r = await db.reminders.get(id)
  if (r) await syncAfter({ ...r, status: 'done' })
}

export async function postponeReminder(id: string, newDate: string): Promise<void> {
  if (!newDate) throw new Error('Date de report requise')
  await db.reminders.update(id, { status: 'postponed', remindDate: newDate, updatedAt: now() })
  const r = await db.reminders.get(id)
  if (r) await syncAfter({ ...r, status: 'postponed' })
}

export async function deleteReminder(id: string): Promise<void> {
  requirePermission('sales', 'delete')
  await db.reminders.delete(id)
  try { await syncAfter({ ...(await db.reminders.get(id))!, id } as any) } catch {}
  if (isSupabaseConfigured()) {
    const { syncDeleteObject } = await import('@/lib/realtime')
    await syncDeleteObject('reminders', id).catch(() => {})
  }
}

/** Résout automatiquement les rappels associés à un crédit soldé. */
export async function resolveRemindersForCredit(creditId: string): Promise<void> {
  const reminders = await db.reminders.where('creditId').equals(creditId).toArray()
  const credit = await db.credits.get(creditId)
  const resolved = credit && credit.balance <= 0
  for (const r of reminders) {
    if (!resolved) break
    if (r.status !== 'done' && r.status !== 'postponed') {
      await db.reminders.update(r.id, { status: 'done', updatedAt: now() })
      await syncAfter({ ...r, status: 'done' })
    }
  }
}

/** Statut de rappel : échéance atterrit → notification unique par rappel. */
export async function checkReminderDue(): Promise<void> {
  const today = new Date()
  const all = await db.reminders.where('businessId').equals(currentBizId()).toArray()
  for (const r of all) {
    const st = computeReminderStatus(r)
    const due = st === 'overdue' || st === 'today'
    if (due && !r.notified) {
      const label = st === 'overdue' ? 'En retard' : 'À relancer aujourd\'hui'
      const remaining = Math.max(0, r.debtAmount - r.paidAmount)
      await createNotification({
        type: 'reminder_due',
        title: `Rappel de paiement — ${label}`,
        message: `${r.customerName} : ${remaining} FCFA restants${r.dueDate ? ` (échéance ${new Date(r.dueDate).toLocaleDateString('fr-FR')})` : ''}`,
        link: '/reminders',
        recipientId: undefined,
      })
      await db.reminders.update(r.id, { notified: true, updatedAt: now() })
      await syncAfter({ ...r, notified: true })
    }
  }
  void today
}

export async function listReminders(): Promise<DebtReminder[]> {
  const all = await db.reminders.where('businessId').equals(currentBizId()).toArray()
  return all
    .map(r => ({ ...r, status: computeReminderStatus(r) }))
    .sort((a, b) => (a.remindDate > b.remindDate ? 1 : -1))
}
