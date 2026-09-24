import { cn, formatCurrency } from '@/lib/utils'
import { AlertTriangle, Banknote, Calendar, Layers, Plus, Trash2 } from 'lucide-react'
import { PAY_METHOD_LABELS, PAY_METHODS, type PayMethod, type useSalePayment } from './salePayment'
import { NumericInput } from '@/components/ui'

type PaymentHook = ReturnType<typeof useSalePayment>

const TYPE_ORDER: { key: ReturnType<typeof useSalePayment>['paymentType']; label: string }[] = [
  { key: 'complet', label: 'Complet' },
  { key: 'partiel', label: 'Partiel' },
  { key: 'credit', label: 'Crédit' },
  { key: 'split', label: 'Mixte' },
]

export function SalePaymentPanel({ pay, customerName, total }: {
  pay: PaymentHook
  customerName: string
  total: number
}) {
  const showAmount = pay.paymentType === 'complet' && pay.payMethod === 'cash'
  const showAcompte = pay.paymentType === 'partiel'
  const showDueDate = pay.paymentType !== 'complet' && (pay.paymentType !== 'split' || pay.splitPaid < total)
  const customerRequired = pay.isCredit && !customerName.trim()

  return (
    <div className="shrink-0 bg-surface-100 border-t border-surface-100">
      <div className="px-4 pt-2 pb-1 space-y-2">
        {/* Type de vente */}
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-100 p-1">
          {TYPE_ORDER.map(t => (
            <button
              key={t.key}
              onClick={() => pay.setPaymentType(t.key)}
              className={cn(
                'py-1.5 rounded-lg text-xs font-semibold transition-colors',
                pay.paymentType === t.key
                  ? 'bg-primary-500 text-on-accent shadow'
                  : 'text-surface-500 hover:text-surface-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mode de paiement (simple) */}
        {!pay.isSplit && (
          <select
            value={pay.payMethod}
            onChange={(e) => pay.setPayMethod(e.target.value as PayMethod)}
            className="w-full rounded-lg border border-surface-300 bg-surface-100 px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {PAY_METHODS.map(m => (
              <option key={m} value={m}>{PAY_METHOD_LABELS[m]}</option>
            ))}
          </select>
        )}

        {/* Paiement mixte */}
        {pay.isSplit && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-surface-700">
              <Layers className="w-3.5 h-3.5 text-primary-500" /> Répartition des paiements
            </p>
            {pay.splitPayments.map(p => (
              <div key={p.id} className="flex gap-2 items-center">
                <select
                  value={p.method}
                  onChange={(e) => pay.setSplitMethod(p.id, e.target.value as PayMethod)}
                  className="w-1/2 rounded-lg border border-surface-300 bg-surface-50 px-2 py-2 text-xs text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {PAY_METHODS.map(m => (
                    <option key={m} value={m}>{PAY_METHOD_LABELS[m]}</option>
                  ))}
                </select>
                <NumericInput min="0" value={p.amount || ''}
                  placeholder="Montant"
                  onChange={(e) => pay.setSplitAmount(p.id, Number(e.target.value) || 0)}
                  className="flex-1 rounded-lg bg-surface-50 border border-surface-300 px-3 py-2 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={() => pay.removeSplitPayment(p.id)}
                  disabled={pay.splitPayments.length <= 1}
                  className="p-2 rounded-lg text-surface-400 hover:text-danger disabled:opacity-40"
                  aria-label="Supprimer le moyen de paiement"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {pay.splitPayments.length < 5 && (
              <button
                onClick={() => pay.addSplitPayment()}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-500 hover:text-primary-700"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter un moyen
              </button>
            )}
            <div className="flex justify-between text-xs font-semibold pt-1 border-t border-surface-200">
              <span className="text-surface-500">Total payé : <span className={pay.splitPaid >= total ? 'text-emerald-500' : 'text-surface-900'}>{formatCurrency(Math.min(pay.splitPaid, total))}</span></span>
              <span className={pay.splitPaid >= total ? 'text-emerald-500' : 'text-amber-500'}>
                {pay.splitPaid >= total ? 'Payé' : `Reste : ${formatCurrency(Math.max(0, total - pay.splitPaid))}`}
              </span>
            </div>
            {pay.splitPaid > total && (
              <p className="text-xs font-semibold text-emerald-500">Monnaie à rendre : {formatCurrency(pay.splitPaid - total)}</p>
            )}
          </div>
        )}

        {/* Montant reçu (complet espèces) */}
        {showAmount && (
          <div className="relative">
            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <NumericInput min="0" value={pay.amountReceived || ''}
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
            <NumericInput min="0" max={total} value={pay.amountReceived || ''}
              placeholder={pay.paymentType === 'credit' ? 'Acompte (optionnel)' : 'Acompte'}
              onChange={(e) => pay.setAmountReceived(Math.min(total, Math.max(0, Number(e.target.value) || 0)))}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}

        {/* Monnaie / Crédit / Manque */}
        {pay.paymentType === 'complet' && pay.payMethod === 'cash' && (pay.change > 0 || pay.isShort) && (
          <div className="space-y-1.5">
            {pay.change > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => pay.setOverpayAction('change')}
                    className={cn(
                      'py-2 rounded-lg text-xs font-semibold border transition-colors',
                      pay.overpayAction === 'change'
                        ? 'bg-primary-500 text-on-accent border-primary-500'
                        : 'bg-surface-50 border-surface-300 text-surface-600'
                    )}
                  >
                    Rendre la monnaie
                  </button>
                  <button
                    type="button"
                    onClick={() => pay.setOverpayAction('advance')}
                    className={cn(
                      'py-2 rounded-lg text-xs font-semibold border transition-colors',
                      pay.overpayAction === 'advance'
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-surface-50 border-surface-300 text-surface-600'
                    )}
                  >
                    Garder en avance
                  </button>
                </div>
                <p className={cn('text-xs font-semibold', pay.overpayAction === 'advance' ? 'text-emerald-400' : 'text-surface-500')}>
                  {pay.overpayAction === 'advance'
                    ? `Avance client conservée : ${formatCurrency(pay.change)} (hors chiffre d'affaires)`
                    : `Monnaie à rendre : ${formatCurrency(pay.change)}`}
                </p>
              </>
            ) : (
              <p className="text-xs font-semibold text-red-400">
                Manque : {formatCurrency(total - pay.amountReceived)}
              </p>
            )}
          </div>
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
        {pay.isSplit && pay.splitPaid < total && (
          <p className="text-xs font-semibold text-blue-400">Crédit à recouvrer : {formatCurrency(total - pay.splitPaid)}</p>
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
            <AlertTriangle className="w-3.5 h-3.5" /> Client requis pour une vente {pay.isSplit ? 'mixte partielle' : pay.paymentType === 'credit' ? 'à crédit' : 'partielle'}
          </p>
        )}
      </div>
    </div>
  )
}
