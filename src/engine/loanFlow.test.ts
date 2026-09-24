import { describe, it, expect, beforeAll, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: null,
}))

;(globalThis as any).window = { innerWidth: 1024 }
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: { _s: {} as any, getItem(k: string) { return this._s[k] ?? null }, setItem(k: string, v: string) { this._s[k] = v }, removeItem(k: string) { delete this._s[k] } }, configurable: true })

const { useAppStore } = await import('@/stores/appStore')
const db = (await import('@/db')).default
const { createLoan, repayLoan, partyLoanSummary, listLoans, findParty } = await import('./loan')
const { ensureReminder, resolveRemindersForCredit, computeReminderStatus, markReminderDone } = await import('./reminders')

beforeAll(async () => {
  useAppStore.getState().setUser({
    id: 'u1', businessId: 'b1', name: 'Testeur', loginId: 'test', role: 'admin', permissions: ['*'],
  } as any)
  useAppStore.getState().setCurrentBusiness({ id: 'b1', name: 'Biz' } as any)
  await db.customers.add({
    id: 'c1', businessId: 'b1', name: 'Mamadou DIALLO', phone: '+226 70 12 34 56',
    email: '', address: '', creditLimit: 0, currentBalance: 0, notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as any)
})

describe('Prêts multiples (compte centralisé, FIFO)', () => {
  it('crée deux prêts pour la même personne sans doublon', async () => {
    const l1 = await createLoan({ partyKind: 'customer', partyId: 'c1', amount: 50000, dueDate: '' })
    const l2 = await createLoan({ partyKind: 'customer', partyId: 'c1', amount: 40000, dueDate: '' })
    expect(l1.number).toMatch(/PRET-\d+/)
    expect(l1.number).not.toBe(l2.number)
    const loans = await listLoans('c1')
    expect(loans.length).toBe(2)
    expect(loans.every(l => l.partyName === 'Mamadou DIALLO')).toBe(true)
    const customers = await db.customers.toArray()
    expect(customers.length).toBe(1) // aucun doublon
  })

  it('rembourse FIFO : le plus ancien d’abord', async () => {
    await repayLoan({ partyKind: 'customer', partyId: 'c1', amount: 30000, method: 'cash' })
    const loans = await listLoans('c1')
    const oldest = loans[0]
    const newest = loans[1]
    expect(oldest.paid).toBe(30000)
    expect(oldest.status).toBe('partial')
    expect(newest.paid).toBe(0)
    const summary = await partyLoanSummary('c1')
    expect(summary.balance).toBe(60000) // 20k restant + 40k
  })

  it('soldé complet + statut', async () => {
    await repayLoan({ partyKind: 'customer', partyId: 'c1', amount: 60000, method: 'cash' })
    const summary = await partyLoanSummary('c1')
    expect(summary.balance).toBe(0)
    const loans = await listLoans('c1')
    expect(loans.every(l => l.status === 'paid')).toBe(true)
  })
})

describe('Rappels de dettes', () => {
  it('crée un rappel, détecte le retard et se résout quand la dette est soldée', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const r = await ensureReminder({
      creditId: 'credit-1', saleId: 'sale-1', customerId: 'c1', customerName: 'Mamadou DIALLO',
      customerPhone: '7123456', debtAmount: 25000, paidAmount: 0, dueDate: yesterday, remindDate: yesterday,
    })
    expect(r).not.toBeNull()
    expect(computeReminderStatus(r!)).toBe('overdue')
    await db.credits.add({
      id: 'credit-1', businessId: 'b1', customerId: 'c1', customerName: 'Mamadou DIALLO',
      invoiceId: 'sale-1', amount: 25000, paid: 0, balance: 25000, dueDate: yesterday,
      status: 'active', reminderSent: [], createdAt: new Date().toISOString(),
    } as any)
    await db.credits.update('credit-1', { paid: 25000, balance: 0, status: 'paid' })
    await resolveRemindersForCredit('credit-1')
    const after = await db.reminders.get(r!.id)
    expect(after!.status).toBe('done')
  })

  it('trouver la même personne par téléphone', async () => {
    const found = await findParty({ kind: 'customer', name: 'X', phone: '+226 70 12 34 56' })
    expect(found?.id).toBe('c1')
  })
})
