import { useEffect, useMemo, useState } from 'react'
import db from '@/db'
import { generateId } from '@/lib/utils'
import type { Customer } from '@/types'

export type SalePaymentType = 'complet' | 'partiel' | 'credit'
export type PayMethod = 'cash' | 'mobile' | 'card' | 'bank'

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  cash: 'Espèces',
  mobile: 'Mobile Money',
  card: 'Carte',
  bank: 'Virement',
}

export const PAYMENT_TYPE_LABELS: Record<SalePaymentType, string> = {
  complet: 'Complet',
  partiel: 'Partiel',
  credit: 'Crédit',
}

export function useSalePayment(total: number) {
  const [paymentType, setPaymentTypeState] = useState<SalePaymentType>('complet')
  const [payMethodState, setPayMethodState] = useState<PayMethod>('cash')
  const [amountReceived, setAmountReceived] = useState(0)
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    setAmountReceived(a => Math.min(a, total))
  }, [total])

  function setPaymentType(t: SalePaymentType) {
    setPaymentTypeState(t)
    if (t === 'complet') {
      setAmountReceived(total)
      setDueDate('')
    } else if (t === 'partiel') {
      setAmountReceived(0)
    } else {
      setAmountReceived(0)
    }
  }

  function setPayMethod(m: PayMethod) {
    setPayMethodState(m)
    if (paymentType === 'complet') setAmountReceived(total)
  }

  const paid = useMemo(() => {
    if (paymentType === 'complet') {
      return payMethodState === 'cash' ? Math.min(amountReceived || 0, total) : total
    }
    return Math.min(amountReceived || 0, total)
  }, [paymentType, payMethodState, amountReceived, total])

  const change = useMemo(() => (
    paymentType === 'complet' && payMethodState === 'cash'
      ? Math.max(0, (amountReceived || 0) - total)
      : 0
  ), [paymentType, payMethodState, amountReceived, total])

  const creditAmount = paymentType === 'complet' ? 0 : Math.max(0, total - paid)
  const isCredit = paymentType !== 'complet'
  const isShort = paymentType === 'complet' && payMethodState === 'cash' && (amountReceived || 0) < total

  function reset() {
    setPaymentTypeState('complet')
    setPayMethodState('cash')
    setAmountReceived(0)
    setDueDate('')
  }

  return {
    paymentType, setPaymentType,
    payMethod: payMethodState, setPayMethod,
    amountReceived, setAmountReceived,
    dueDate, setDueDate,
    paid, change, creditAmount, isCredit, isShort, reset,
  }
}

export async function ensureCustomer(opts: {
  businessId: string
  name: string
  phone: string
  address: string
  customerId: string
  allCustomers: Customer[]
}): Promise<{ id?: string; name: string }> {
  const name = opts.name.trim()
  if (opts.customerId) {
    const c = opts.allCustomers.find(x => x.id === opts.customerId)
    return { id: opts.customerId, name: c?.name || name }
  }
  if (!name) return { id: undefined, name }
  const existing = opts.allCustomers.find(c =>
    c.name.toLowerCase() === name.toLowerCase() &&
    (!opts.phone || (c.phone || '').toLowerCase() === opts.phone.toLowerCase())
  )
  if (existing) return { id: existing.id, name: existing.name }
  const now = new Date().toISOString()
  const record = {
    id: generateId(),
    businessId: opts.businessId,
    name,
    phone: opts.phone,
    email: '',
    address: opts.address,
    creditLimit: 0,
    currentBalance: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
  await db.customers.add(record)
  return { id: record.id, name }
}
