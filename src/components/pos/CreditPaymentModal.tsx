import { useState } from 'react'
import { Modal, Button, Badge } from '@/components/ui'
import { useBusinessId } from '@/hooks/useBusinessId'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, formatDate, generateId } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { sb } from '@/lib/supabase-db'
import { CreditCard, CheckCircle, Clock, AlertTriangle, Plus, X } from 'lucide-react'

interface CreditPaymentModalProps {
  open: boolean
  onClose: () => void
  customerId?: string | null
  onPaymentComplete?: () => void
}

export default function CreditPaymentModal({ open, onClose, customerId, onPaymentComplete }: CreditPaymentModalProps) {
  const isCloud = isSupabaseConfigured()
  const businessId = useBusinessId()
  const [amount, setAmount] = useState('')

  const allCredits = useLiveQuery(() => db.credits
    .filter(c => c.status === 'active' || c.status === 'overdue')
    .toArray(), [])

  const activeCredits = customerId
    ? allCredits?.filter(c => c.customerId === customerId)
    : allCredits

  const totalBalance = activeCredits?.reduce((s, c) => s + c.balance, 0) || 0

  async function handlePayment() {
    const payAmount = Number(amount)
    if (!payAmount || payAmount <= 0) return toast('Montant invalide', 'warning')
    if (!activeCredits || activeCredits.length === 0) return toast('Aucun crédit actif', 'warning')

    const now = new Date().toISOString()
    let remaining = payAmount

    for (const credit of activeCredits) {
      if (remaining <= 0) break
      const pay = Math.min(remaining, credit.balance)
      remaining -= pay

      const newPaid = credit.paid + pay
      const newBalance = credit.balance - pay
      const newStatus = newBalance <= 0 ? 'paid' as const : credit.status

      if (isCloud) {
        await sb.update('credits', credit.id, {
          paid: newPaid,
          balance: newBalance,
          status: newStatus,
          lastPaymentDate: now,
          lastPaymentAmount: pay,
        })
      } else {
        await db.credits.update(credit.id, {
          paid: newPaid,
          balance: newBalance,
          status: newStatus,
        } as any)
      }

    }

    toast(`Paiement de ${formatCurrency(payAmount)} enregistré`, 'success')
    setAmount('')
    onPaymentComplete?.()
  }

  return (
    <Modal open={open} onClose={onClose} title={customerId ? "Paiement crédit client" : "Paiement crédit"} size="md">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 bg-amber-500/15 text-amber-300 px-4 py-3 rounded-xl flex-1">
            <AlertTriangle className="w-5 h-5" />
            <div>
              <p className="text-sm font-medium">Solde impayé</p>
              <p className="text-lg font-bold">{formatCurrency(totalBalance)}</p>
            </div>
          </div>
        </div>



        <div className="space-y-2">
          {activeCredits?.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-surface-50 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-medium text-surface-900">{c.customerName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={c.status === 'overdue' ? 'danger' : 'warning'}>{c.status}</Badge>
                  <span className="text-xs text-surface-400">Échéance: {formatDate(c.dueDate)}</span>
                </div>
              </div>
              <p className="text-sm font-bold text-surface-900">{formatCurrency(c.balance)}</p>
            </div>
          ))}
          (!activeCredits || activeCredits.length === 0) && (
            <div className="text-center py-6 text-surface-400 text-sm">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success" />
              Aucun crédit impayé
            </div>
          )
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-surface-700">Montant du paiement</label>
          <div className="flex gap-2">
            {[totalBalance * 0.25, totalBalance * 0.5, totalBalance * 0.75, totalBalance].map((val) => (
              <button
                key={val}
                onClick={() => setAmount(String(Math.round(val)))}
                className="flex-1 py-2 rounded-lg border border-surface-200 text-xs font-medium text-surface-600 hover:bg-primary-50 hover:border-primary-300 transition-colors"
              >
                {Math.round((val / totalBalance) * 100)}%
              </button>
            ))}
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant à payer"
            className="w-full rounded-xl border border-surface-300 px-4 py-3 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
            min={0}
            max={totalBalance}
            autoFocus
          />
        </div>

        <Button className="w-full" size="lg" onClick={handlePayment} disabled={!amount || Number(amount) <= 0 || Number(amount) > totalBalance}>
          <CreditCard className="w-4 h-4" /> Payer {amount ? formatCurrency(Number(amount)) : ''}
        </Button>
      </div>
    </Modal>
  )
}
