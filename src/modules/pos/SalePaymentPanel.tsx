import { cn, formatCurrency } from '@/lib/utils'
import { AlertTriangle, Banknote, Calendar } from 'lucide-react'
import { PAY_METHOD_LABELS, PAY_METHODS, PAYMENT_TYPE_LABELS, type PayMethod, type SalePaymentType, type useSalePayment } from './salePayment'

type PaymentHook = ReturnType<typeof useSalePayment>

const TYPE_ORDER: SalePaymentType[] = ['complet', 'partiel', 'credit']

export function SalePaymentPanel({ pay, customerName, total }: {
  pay: PaymentHook
  customerName: string
  total: number
}) {
  const showAmount = pay.paymentType === 'complet' && pay.payMethod === 'cash'
  const showAcompte = pay.paymentType === 'partiel'
  const showDueDate = pay.paymentType !== 'complet'
  const customerRequired = pay.isCredit && !customerName.trim()

  return (
    <div className="shrink-0 bg-surface-100 border-t border-surface-100">
      <div className="px-4 pt-2 pb-1 space-y-2">
        {/* Type de vente */}
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-100 p-1">
          {TYPE_ORDER.map(t => (
            <button
              key={t}
              onClick={() => pay.setPaymentType(t)}
              className={cn(
                'py-1.5 rounded-lg text-xs font-semibold transition-colors',
                pay.paymentType === t
                  ? 'bg-primary-500 text-on-accent shadow'
                  : 'text-surface-500 hover:text-surface-700'
              )}
            >
              {PAYMENT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Mode de paiement */}
        <select
          value={pay.payMethod}
          onChange={(e) => pay.setPayMethod(e.target.value as PayMethod)}
          className="w-full rounded-lg border border-surface-300 bg-surface-100 px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {PAY_METHODS.map(m => (
            <option key={m} value={m}>{PAY_METHOD_LABELS[m]}</option>
          ))}
        </select>

        {/* Montant reçu (complet espèces) */}
        {showAmount && (
          <div className="relative">
            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="number" min="0" value={pay.amountReceived || ''}
              placeholder="Montant reçu"
              onChange={(e) => pay.setAmountReceived(Math.max(0, Number(e.target.value) || 0))}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {/* Acompte (partiel / crédit) */}
        {showAcompte && (
          <div className="relative">
            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="number" min="0" max={total} value={pay.amountReceived || ''}
              placeholder={pay.paymentType === 'credit' ? 'Acompte (optionnel)' : 'Acompte'}
              onChange={(e) => pay.setAmountReceived(Math.min(total, Math.max(0, Number(e.target.value) || 0)))}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {/* Monnaie / Crédit / Manque */}
        {pay.paymentType === 'complet' && pay.payMethod === 'cash' && (pay.change > 0 || pay.isShort) && (
          <p className={cn('text-xs font-semibold', pay.change > 0 ? 'text-emerald-400' : 'text-red-400')}>
            {pay.change > 0 ? `Monnaie à rendre : ${formatCurrency(pay.change)}` : `Manque : ${formatCurrency(total - pay.amountReceived)}`}
          </p>
        )}
        {pay.paymentType === 'complet' && pay.payMethod !== 'cash' && (
          <p className="text-xs text-surface-400">Montant encaissé : {formatCurrency(total)}</p>
        )}
        {pay.paymentType === 'partiel' && pay.creditAmount > 0 && (
          <p className="text-xs font-semibold text-blue-400">Crédit à recouvrer : {formatCurrency(pay.creditAmount)}</p>
        )}
        {pay.paymentType === 'credit' && pay.creditAmount > 0 && (
          <p className="text-xs font-semibold text-blue-400">Montant à créditer : {formatCurrency(pay.creditAmount)}</p>
        )}

        {/* Échéance optionnelle */}
        {showDueDate && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-surface-400 shrink-0" />
            <input
              type="date"
              value={pay.dueDate}
              onChange={(e) => pay.setDueDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {/* Client requis */}
        {customerRequired && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" /> Client requis pour une vente {pay.paymentType === 'credit' ? 'à crédit' : 'partielle'}
          </p>
        )}
      </div>
    </div>
  )
}
