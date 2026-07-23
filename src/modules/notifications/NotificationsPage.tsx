import { useLiveQuery } from '@/hooks/useLiveQuery'
import { Card, Button, Badge, Pagination } from '@/components/ui'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { formatDateTime } from '@/lib/utils'
import { Bell, BellRing, CheckCheck, Trash2, AlertTriangle, CreditCard, ShoppingCart, DollarSign, Clock, UserCheck, Target } from 'lucide-react'
import type { Notification } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const typeIcons = {
  stock_alert: AlertTriangle,
  credit_due: CreditCard,
  new_sale: ShoppingCart,
  payment_received: DollarSign,
  invoice_overdue: Clock,
  payroll: UserCheck,
  lead: Target,
}

const typeColors = {
  stock_alert: 'warning',
  credit_due: 'danger',
  new_sale: 'success',
  payment_received: 'success',
  invoice_overdue: 'danger',
  payroll: 'info',
  lead: 'warning',
} as const

const typeLabels = {
  stock_alert: 'Stock',
  credit_due: 'Crédit',
  new_sale: 'Vente',
  payment_received: 'Paiement',
  invoice_overdue: 'Facture',
  payroll: 'Paie',
  lead: 'CRM',
}

export default function NotificationsPage() {
  const isCloud = isSupabaseConfigured()
  const dexieNotifications = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().toArray(), [])
  const { data: supabaseNotifications } = useSupabaseQuery<Notification>('notifications', undefined, [])
  const notifications = isCloud ? (supabaseNotifications || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : dexieNotifications

  async function markAllRead() {
    const unread = notifications?.filter(n => !n.read) || []
    for (const n of unread) {
      if (isCloud) { await sb.update('notifications', n.id, { read: true }) } else { await db.notifications.update(n.id, { read: true }) }
    }
  }

  async function markRead(id: string) {
    if (isCloud) { await sb.update('notifications', id, { read: true }) } else { await db.notifications.update(id, { read: true }) }
  }

  async function deleteNotification(id: string) {
    if (isCloud) { await sb.remove('notifications', id) } else { await db.notifications.delete(id) }
  }

  const unread = notifications?.filter(n => !n.read) || []
  const read = notifications?.filter(n => n.read) || []
  const allNotifications = [...unread, ...read]
  const { paginatedItems, ...pag } = usePagination(allNotifications, 10)

  return (
    <div className="space-y-6">
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
      </div>

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
          <Bell className="w-12 h-12 text-surface-300 mx-auto mb-3" />
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
      className={`cursor-pointer transition-colors hover:bg-surface-50 ${unread ? 'border-primary-200 bg-primary-50/30' : ''}`}
      onClick={() => onRead(n.id)}
    >
      <div className="flex items-start gap-3 p-2">
        <div className={`p-2 rounded-xl ${unread ? 'bg-primary-100 text-primary-600' : 'bg-surface-100 text-surface-400'}`}>
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
          className="p-1.5 rounded-lg hover:bg-red-50 text-surface-300 hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </Card>
  )
}
