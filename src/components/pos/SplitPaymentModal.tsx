import { useState } from 'react'
import { Modal, Button, Input } from '@/components/ui'
import { formatCurrency, generateId } from '@/lib/utils'
import { Banknote, Smartphone, CreditCard, Plus, Trash2 } from 'lucide-react'

interface SplitPayment {
  id: string
  method: 'cash' | 'mobile' | 'card' | 'bank'
  amount: number
}

interface SplitPaymentModalProps {
  open: boolean
  onClose: () => void
  total: number
  onConfirm: (payments: SplitPayment[]) => void
}

const methodIcons = {
  cash: Banknote,
  mobile: Smartphone,
  card: CreditCard,
  bank: CreditCard,
}

const methodLabels = {
  cash: 'Espèces',
  mobile: 'Mobile Money',
  card: 'Carte',
  bank: 'Virement',
}

export default function SplitPaymentModal({ open, onClose, total, onConfirm }: SplitPaymentModalProps) {
  const [payments, setPayments] = useState<SplitPayment[]>([
    { id: generateId(), method: 'cash', amount: 0 },
  ])

  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const remaining = total - totalPaid

  function addPayment() {
    if (payments.length >= 4) return
    setPayments(prev => [...prev, { id: generateId(), method: 'mobile', amount: 0 }])
  }

  function removePayment(id: string) {
    if (payments.length <= 1) return
    setPayments(prev => prev.filter(p => p.id !== id))
  }

  function updatePayment(id: string, field: 'method' | 'amount', value: any) {
    setPayments(prev => prev.map(p =>
      p.id === id ? { ...p, [field]: field === 'amount' ? Math.max(0, Math.min(total, Number(value) || 0)) : value } : p
    ))
  }

  function handleConfirm() {
    const valid = payments.filter(p => p.amount > 0)
    if (valid.length === 0 || totalPaid < total) return
    onConfirm(valid)
    setPayments([{ id: generateId(), method: 'cash', amount: 0 }])
  }

  function handleClose() {
    setPayments([{ id: generateId(), method: 'cash', amount: 0 }])
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Paiement fractionné" size="sm">
      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center bg-surface-50 rounded-xl px-4 py-3">
          <span className="text-sm text-surface-500">Total à payer</span>
          <span className="text-lg font-bold text-surface-900">{formatCurrency(total)}</span>
        </div>

        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="flex gap-2 items-start">
              <select
                value={p.method}
                onChange={(e) => updatePayment(p.id, 'method', e.target.value)}
                className="rounded-xl border border-surface-300 bg-white px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {(['cash', 'mobile', 'card', 'bank'] as const).map(m => {
                  const Icon = methodIcons[m]
                  return <option key={m} value={m}>{methodLabels[m]}</option>
                })}
              </select>
              <input
                type="number"
                value={p.amount || ''}
                onChange={(e) => updatePayment(p.id, 'amount', e.target.value)}
                placeholder="Montant"
                className="flex-1 rounded-xl border border-surface-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                min={0}
                max={total}
              />
              <button
                onClick={() => removePayment(p.id)}
                className="p-2.5 rounded-xl text-surface-400 hover:text-danger hover:bg-red-50 transition-colors"
                disabled={payments.length <= 1}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {payments.length < 4 && (
          <button
            onClick={addPayment}
            className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <Plus className="w-4 h-4" /> Ajouter un moyen de paiement
          </button>
        )}

        <div className="flex justify-between items-center pt-2 border-t border-surface-200">
          <span className="text-sm text-surface-500">
            Restant: <span className={remaining > 0 ? 'text-danger font-semibold' : 'text-success font-semibold'}>{formatCurrency(Math.max(0, remaining))}</span>
          </span>
          <span className="text-sm text-surface-500">
            Total payé: <span className="text-surface-900 font-semibold">{formatCurrency(totalPaid)}</span>
          </span>
        </div>

        <Button className="w-full" onClick={handleConfirm} disabled={totalPaid < total || totalPaid === 0}>
          Confirmer le paiement ({formatCurrency(totalPaid)})
        </Button>
      </div>
    </Modal>
  )
}

export type { SplitPayment }
