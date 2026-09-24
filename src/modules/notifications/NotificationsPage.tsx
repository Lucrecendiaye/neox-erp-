import { useEffect, useState } from 'react'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { Card, Button, Badge, Pagination, Input } from '@/components/ui'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { formatDateTime } from '@/lib/utils'
import { Bell, BellRing, CheckCheck, Trash2, AlertTriangle, CreditCard, ShoppingCart, DollarSign, Clock, UserCheck, Target, Truck, Package, ArrowLeftRight, ShieldAlert, PencilLine, CalendarClock, HandCoins } from 'lucide-react'
import type { Notification } from '@/types'


import { useBusinessId } from '@/hooks/useBusinessId'
import { softDelete } from '@/lib/softDelete'
import { getAlertSettings, setAlertSettings } from '@/engine/sensitiveNotifications'
import { toast } from '@/lib/toast'
import { Settings2 } from 'lucide-react'
import type { AlertSettings } from '@/types'

const typeIcons = {
  stock_alert: AlertTriangle,
  credit_due: CreditCard,
  new_sale: ShoppingCart,
  payment_received: DollarSign,
  invoice_overdue: Clock,
  payroll: UserCheck,
  lead: Target,
  delivery_assigned: Truck,
  delivery_reassigned: Truck,
  delivery_return: Package,
  stock_transfer: ArrowLeftRight,
  sensitive_delete: ShieldAlert,
  sensitive_edit: PencilLine,
  reminder_due: CalendarClock,
  loan_alert: HandCoins,
}

const typeColors = {
  stock_alert: 'warning',
  credit_due: 'danger',
  new_sale: 'success',
  payment_received: 'success',
  invoice_overdue: 'danger',
  payroll: 'info',
  lead: 'warning',
  delivery_assigned: 'info',
  delivery_reassigned: 'warning',
  delivery_return: 'info',
  stock_transfer: 'warning',
  sensitive_delete: 'danger',
  sensitive_edit: 'warning',
  reminder_due: 'warning',
  loan_alert: 'info',
} as const

const typeLabels = {
  stock_alert: 'Stock',
  credit_due: 'Crédit',
  new_sale: 'Vente',
  payment_received: 'Paiement',
  invoice_overdue: 'Facture',
  payroll: 'Paie',
  lead: 'CRM',
  delivery_assigned: 'Livraison',
  delivery_reassigned: 'Livraison',
  delivery_return: 'Livraison',
  stock_transfer: 'Transfert',
  sensitive_delete: '⚠️ Sensible',
  sensitive_edit: '🟠 Modification',
  reminder_due: 'Rappel',
  loan_alert: 'Prêt',
}

export default function NotificationsPage() {
  const businessId = useBusinessId()
  const notifications = useLiveQuery(() => db.notifications.where('businessId').equals(businessId).reverse().sortBy('createdAt'), [businessId]) ?? []
  const [alertCfg, setAlertCfg] = useState<AlertSettings | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    getAlertSettings().then(setAlertCfg)
  }, [])

  async function updateAlert(patch: Partial<AlertSettings>) {
    if (!alertCfg) return
    const next = { ...alertCfg, ...patch }
    setAlertCfg(next)
    await setAlertSettings(patch)
    toast('Alertes mises à jour', 'success')
  }

  async function markAllRead() {
    const unread = notifications?.filter(n => !n.read) || []
    for (const n of unread) {
      await db.notifications.update(n.id, { read: true })
    }
  }

  async function markRead(id: string) {
    await db.notifications.update(id, { read: true })
  }

  async function deleteNotification(id: string) {
    const notification = notifications?.find(n => n.id === id)
    if (notification) await softDelete('notifications', id, notification as any, notification.title)
    await db.notifications.delete(id)
  }

  const unread = notifications?.filter(n => !n.read) || []
  const read = notifications?.filter(n => n.read) || []
  const allNotifications = [...unread, ...read]
  const { paginatedItems, ...pag } = usePagination(allNotifications, 10)

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Notifications</h1>
          <p className="text-surface-500 text-sm mt-1">
            {unread.length} non lue{unread.length > 1 ? 's' : ''}
          </p>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4" /> Tout marquer lu
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
          <Settings2 className="w-4 h-4" /> Alertes
        </Button>
      </div>

      {showSettings && alertCfg && (
        <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
          <p className="text-sm font-semibold text-surface-900 mb-3">Réglages des alertes du gérant</p>
          <p className="text-xs text-surface-500 mb-3">Les opérations normales (ventes, paiements) sont seulement journalisées. Seules les actions sensibles notifient — activez/désactivez chaque alerte :</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {([
              ['saleDelete', '🔴 Suppression de vente'],
              ['saleEdit', '🟠 Modification de vente'],
              ['paymentEdit', '🟠 Modification/suppression de paiement'],
              ['loanDelete', '🔴 Suppression de prêt'],
              ['stockManual', '🟡 Modification manuelle de stock'],
              ['cashEdit', '🔴 Opérations de caisse sensibles'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 p-2 rounded-xl bg-surface-50 border border-surface-200 cursor-pointer">
                <input type="checkbox" checked={alertCfg[key]} onChange={e => updateAlert({ [key]: e.target.checked } as any)}
                  className="w-4 h-4 accent-primary-500" />
                <span className="text-sm text-surface-700">{label}</span>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <Input label="Seuil modif. vente (FCFA)" type="number" min="0" value={alertCfg.thresholdSaleEdit} onChange={e => updateAlert({ thresholdSaleEdit: +e.target.value || 0 })} />
            <Input label="Seuil dépense (FCFA)" type="number" min="0" value={alertCfg.thresholdExpense} onChange={e => updateAlert({ thresholdExpense: +e.target.value || 0 })} />
            <Input label="Seuil prêt (FCFA)" type="number" min="0" value={alertCfg.thresholdLoan} onChange={e => updateAlert({ thresholdLoan: +e.target.value || 0 })} />
            <Input label="Seuil stock (unités)" type="number" min="0" value={alertCfg.thresholdStock} onChange={e => updateAlert({ thresholdStock: +e.target.value || 0 })} />
          </div>
          <p className="text-xs text-surface-400 mt-2">0 = toujours (aucun seuil). Les notifications répétées d'un même utilisateur sont regroupées sur 30 minutes.</p>
        </div>
      )}

      {paginatedItems.length > 0 && (
        <div className="space-y-2">
          {paginatedItems.map((n) => (
            <NotificationCard key={n.id} notification={n} onRead={markRead} onDelete={deleteNotification} unread={!n.read} />
          ))}
        </div>
      )}

      {allNotifications.length > 0 && (
        <div className="flex justify-center pt-4">
          <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
        </div>
      )}
      {(!notifications || notifications.length === 0) && (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-surface-500 mx-auto mb-3" />
          <p className="text-surface-400 font-medium">Aucune notification</p>
          <p className="text-surface-400 text-sm">Les alertes apparaîtront ici</p>
        </div>
      )}
    </div>
  )
}

function NotificationCard({ notification: n, onRead, onDelete, unread }: { notification: Notification; onRead: (id: string) => void; onDelete: (id: string) => void; unread?: boolean }) {
  const Icon = typeIcons[n.type]

  return (
    <Card
      padding="sm"
      className={`group cursor-pointer transition-colors hover:bg-surface-50 ${unread ? 'border-primary-300 bg-primary-50/30' : ''}`}
      onClick={() => onRead(n.id)}
    >
      <div className="flex items-start gap-3 p-2">
        <div className={`p-2 rounded-xl ${unread ? 'bg-primary-100 text-primary-400' : 'bg-surface-100 text-surface-400'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={typeColors[n.type] as 'warning' | 'danger' | 'success'}>{typeLabels[n.type]}</Badge>
            {unread && <span className="w-2 h-2 bg-primary-500 rounded-full" />}
          </div>
          <p className={`text-sm mt-1 ${unread ? 'font-semibold text-surface-900' : 'text-surface-600'}`}>{n.title}</p>
          <p className="text-xs text-surface-400 mt-0.5">{n.message}</p>
          <p className="text-xs text-surface-400 mt-1">{formatDateTime(n.createdAt)}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(n.id) }}
          className="p-1.5 rounded-lg hover:bg-red-500/15 text-surface-500 hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </Card>
  )
}
