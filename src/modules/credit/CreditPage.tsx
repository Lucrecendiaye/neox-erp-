import { useState } from 'react'
import { Card, Badge, StatCard, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { usePagination } from '@/hooks/usePagination'
import { isSupabaseConfigured } from '@/lib/supabase'
import db from '@/db'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, AlertTriangle, Clock, CheckCircle, MessageSquare, CreditCard } from 'lucide-react'

export default function CreditPage() {
  const isCloud = isSupabaseConfigured()
  const dexieCredits = useLiveQuery(() => db.credits.orderBy('createdAt').reverse().toArray(), [])
  const { data: supabaseCredits } = useSupabaseQuery<any>('credits', (q) => q.order('createdAt', { ascending: false }), [])
  const credits = isCloud ? (supabaseCredits as any[]) : (dexieCredits as any[])
  const [search, setSearch] = useState('')

  const totalOutstanding = credits?.reduce((s: number, x: any) => s + x.balance, 0) || 0
  const overdue = credits?.filter((c: any) => c.status === 'overdue' || (c.status === 'active' && new Date(c.dueDate) < new Date())) || []
  const totalOverdue = overdue.reduce((s: number, x: any) => s + x.balance, 0)

  const filtered = credits?.filter((c: any) =>
    c.customerName?.toLowerCase().includes(search.toLowerCase())
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 10) as any

  const sendReminder = async (id: string) => {
    try {
      if (isCloud) {
        await sb.update('credits', id, { lastReminderSent: new Date().toISOString() })
      }
      toast('Rappel envoyé', 'success')
    } catch {
      toast('Erreur rappel', 'error')
    }
  }

  const markAsPaid = async (id: string) => {
    try {
      if (isCloud) {
        await sb.update('credits', id, { status: 'paid', balance: 0, paid: (credits?.find((c: any) => c.id === id) as any)?.amount || 0 })
      } else {
        const c = await db.credits.get(id)
        if (c) await db.credits.update(id, { status: 'paid', balance: 0, paid: c.amount })
      }
      toast('Crédit marqué comme payé', 'success')
    } catch {
      toast('Erreur', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Gestion du Crédit</h1>
        <p className="text-surface-500 text-sm mt-1">Suivi des créances et échéanciers</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Encours total" value={formatCurrency(totalOutstanding)} icon={<CreditCard className="w-5 h-5" />} color="warning" />
        <StatCard title="Créances échues" value={formatCurrency(totalOverdue)} icon={<AlertTriangle className="w-5 h-5" />} color="danger" />
        <StatCard title="Crédits actifs" value={credits?.filter((c: any) => c.status === 'active').length || 0} icon={<Clock className="w-5 h-5" />} color="info" />
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input type="text" placeholder="Rechercher un client..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Client</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Montant</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Payé</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Solde</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-6 py-4">Échéance</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-6 py-4">Statut</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems?.map((c: any) => {
                const isOverdue = new Date(c.dueDate) < new Date() && c.status === 'active'
                return (
                  <tr key={c.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-surface-900">{c.customerName}</td>
                    <td className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(c.amount)}</td>
                    <td className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(c.paid)}</td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-surface-900">{formatCurrency(c.balance)}</td>
                    <td className="px-6 py-4 text-center text-sm text-surface-500">{formatDate(c.dueDate)}</td>
                    <td className="px-6 py-4 text-center">
                      <Badge variant={c.status === 'paid' ? 'success' : isOverdue ? 'danger' : 'warning'}>
                        {c.status === 'paid' ? 'Payé' : isOverdue ? 'Échu' : 'Actif'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => sendReminder(c.id)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Envoyer rappel WhatsApp">
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        {c.status !== 'paid' && (
                          <button onClick={() => markAsPaid(c.id)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Marquer payé">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered && filtered.length > 0 && (
          <div className="flex justify-center p-4 border-t border-surface-200">
            <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
          </div>
        )}
      </Card>
    </div>
  )
}
