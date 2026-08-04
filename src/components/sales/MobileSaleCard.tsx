import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import type { Sale } from '@/types'
import { ShoppingBag, CreditCard, Clock } from 'lucide-react'

function statusVariant(sale: Sale): { badge: string; label: string } {
  if (sale.status === 'cancelled') return { badge: 'bg-red-100 text-red-700', label: 'Annulée' }
  if (sale.paid >= sale.total) return { badge: 'bg-emerald-100 text-emerald-700', label: 'Payée' }
  if (sale.paymentMethod === 'credit') return { badge: 'bg-blue-100 text-blue-700', label: 'Crédit' }
  if (sale.paid > 0) return { badge: 'bg-amber-100 text-amber-700', label: 'Partielle' }
  return { badge: 'bg-amber-100 text-amber-700', label: 'En attente' }
}

export default function MobileSaleCard({ sale, onTap }: { sale: Sale; onTap: () => void }) {
  const st = statusVariant(sale)
  return (
    <div onClick={onTap} className="bg-white rounded-2xl border border-surface-200 shadow-sm p-4 active:bg-surface-50 transition-colors cursor-pointer">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-primary-600">{sale.invoiceNumber || '—'}</span>
        <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', st.badge)}>{st.label}</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-surface-700 mb-1">
        <ShoppingBag className="w-3.5 h-3.5 text-surface-400 shrink-0" />
        <span className="truncate">{sale.customerName || 'Client divers'}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-surface-500 mb-2">
        <Clock className="w-3 h-3 shrink-0" />
        <span>{formatDateTime(sale.createdAt)}</span>
        <span className="ml-auto font-bold text-surface-900 text-sm">{formatCurrency(sale.total)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-surface-400">
        <CreditCard className="w-3 h-3" />
        <span className="capitalize">{sale.paymentMethod}</span>
      </div>
    </div>
  )
}
