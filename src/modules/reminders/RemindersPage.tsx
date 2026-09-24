import { useEffect, useMemo, useState } from 'react'
import { Card, Button, Input, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { formatCurrency, formatDate, openWhatsApp } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { computeReminderStatus, markReminderDone, postponeReminder, checkReminderDue } from '@/engine/reminders'
import { AlarmClock, BellRing, CalendarClock, Check, ChevronRight, Search, Phone, UserRound } from 'lucide-react'
import type { DebtReminder } from '@/types'

type Filter = 'all' | 'today' | 'overdue' | 'upcoming' | 'done' | 'postponed'

export default function RemindersPage() {
  const businessId = useBusinessId()
  const reminders = useLiveQuery(() => db.reminders.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    void checkReminderDue().catch(() => {})
  }, [])

  const rows = useMemo(() => reminders
    .map(r => ({ ...r, status: computeReminderStatus(r) }))
    .sort((a, b) => (a.remindDate > b.remindDate ? 1 : -1)),
    [reminders])

  const counts = useMemo(() => {
    const active = rows.filter(r => r.status !== 'done' && r.status !== 'postponed')
    return {
      today: rows.filter(r => r.status === 'today').length,
      overdue: rows.filter(r => r.status === 'overdue').length,
      upcoming: active.filter(r => r.status === 'upcoming').length,
      active: active.length,
    }
  }, [rows])

  const filtered = rows.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.customerName.toLowerCase().includes(q) || (r.customerPhone || '').includes(q)
    }
    return true
  })
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  const oldestDebts = useMemo(() => rows
    .filter(r => r.status === 'overdue' || r.status === 'upcoming' || r.status === 'today')
    .sort((a, b) => (a.remindDate > b.remindDate ? 1 : -1))
    .slice(0, 5), [rows])

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Rappels de paiement</h1>
          <p className="text-surface-500 text-sm mt-1">{counts.active} rappel(s) actifs</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-surface-400 flex items-center gap-1"><BellRing className="w-3.5 h-3.5 text-warning" /> À relancer aujourd'hui</p>
          <p className="text-xl font-bold text-warning mt-1">{counts.today}</p>
        </div>
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20">
          <p className="text-xs text-surface-400 flex items-center gap-1"><AlarmClock className="w-3.5 h-3.5 text-danger" /> En retard</p>
          <p className="text-xl font-bold text-danger mt-1">{counts.overdue}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
          <p className="text-xs text-surface-400 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Prochains rappels</p>
          <p className="text-xl font-bold text-surface-900 mt-1">{counts.upcoming}</p>
        </div>
        <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
          <p className="text-xs text-surface-400 flex items-center gap-1"><UserRound className="w-3.5 h-3.5" /> Rappels actifs</p>
          <p className="text-xl font-bold text-surface-900 mt-1">{counts.active}</p>
        </div>
      </div>

      {oldestDebts.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-surface-900 mb-3">Dettes les plus anciennes à traiter</p>
          <div className="space-y-2">
            {oldestDebts.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 text-sm p-2 rounded-xl bg-surface-50 hover:bg-surface-100 transition-colors">
                <span className="font-medium text-surface-800 truncate">{r.customerName}</span>
                <span className="text-xs text-surface-400">{formatDate(r.remindDate)}</span>
                <span className="font-semibold text-danger">{formatCurrency(Math.max(0, r.debtAmount - r.paidAmount))}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input type="text" placeholder="Rechercher par client ou téléphone..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {([['all', 'Tous'], ['today', 'Aujourd’hui'], ['overdue', 'En retard'], ['upcoming', 'À venir'], ['done', 'Effectués'], ['postponed', 'Reportés']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${filter === key ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {paginatedItems.map(r => {
          const remaining = Math.max(0, r.debtAmount - r.paidAmount)
          const statusMeta = {
            upcoming: { label: 'À venir', variant: 'info' as const },
            today: { label: 'Aujourd’hui', variant: 'warning' as const },
            overdue: { label: 'En retard', variant: 'danger' as const },
            done: { label: 'Effectué', variant: 'success' as const },
            postponed: { label: 'Reporté', variant: 'default' as const },
          }[r.status]
          return (
            <Card key={r.id} padding="sm">
              <div className="flex items-center gap-3 p-3 flex-wrap">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${r.status === 'overdue' ? 'bg-danger text-white' : r.status === 'today' ? 'bg-amber-500 text-white' : r.status === 'done' ? 'bg-emerald-500 text-white' : 'bg-surface-200 text-surface-500'}`}>
                  <BellRing className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-900 truncate">{r.customerName}</p>
                  <p className="text-xs text-surface-400 whitespace-nowrap">
                    {formatCurrency(remaining)} restants · {formatCurrency(r.paidAmount)} déjà payés · rappel le {formatDate(r.remindDate)}
                    {r.dueDate && ` · échéance ${formatDate(r.dueDate)}`}
                  </p>
                </div>
                <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                <div className="flex gap-1.5">
                  {r.customerPhone && (
                    <Button size="sm" variant="outline" onClick={() => openWhatsApp(r.customerPhone || '', `Bonjour ${r.customerName}, votre solde de ${formatCurrency(remaining)} reste impayé. Merci de régulariser.`)}>
                      <Phone className="w-4 h-4" /> WhatsApp
                    </Button>
                  )}
                  {r.status !== 'done' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={async () => { await markReminderDone(r.id); toast('Rappel marqué effectué', 'success') }}>
                        <Check className="w-4 h-4" /> Fait
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        const d = prompt('Reporter au :', new Date(r.remindDate).toISOString().slice(0, 10))
                        if (d) { await postponeReminder(r.id, d); toast('Rappel reporté', 'success') }
                      }}>
                        <ChevronRight className="w-4 h-4" /> Reporter
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
        {paginatedItems.length === 0 && (
          <div className="text-center py-16 text-surface-400">
            <BellRing className="w-12 h-12 mx-auto mb-3 text-surface-500" />
            <p className="text-sm">Aucun rappel trouvé</p>
          </div>
        )}
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </div>
    </div>
  )
}
