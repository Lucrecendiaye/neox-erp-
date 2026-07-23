import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate, openWhatsApp } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, MessageSquare, Send, CheckCircle, Clock, AlertTriangle, History } from 'lucide-react'
import type { Credit } from '@/types'

export default function SmsRemindersPage() {
  const credits = useLiveQuery(() => db.credits.orderBy('createdAt').reverse().toArray(), [])
  const customers = useLiveQuery(() => db.customers.toArray(), [])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [historyCredit, setHistoryCredit] = useState<Credit | null>(null)

  const outstanding = useMemo(() => {
    return credits?.filter(c => c.balance > 0) || []
  }, [credits])

  const filtered = useMemo(() => {
    if (!search) return outstanding
    const q = search.toLowerCase()
    return outstanding.filter(c => c.customerName.toLowerCase().includes(q))
  }, [outstanding, search])

  const { paginatedItems, ...pag } = usePagination(filtered, 10)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === paginatedItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(paginatedItems.map(c => c.id)))
    }
  }

  function buildMessage(credit: Credit) {
    return `Bonjour ${credit.customerName}, votre solde impayé de ${formatCurrency(credit.balance)} arrive à échéance le ${formatDate(credit.dueDate)}. Merci de régulariser.`
  }

  async function sendReminder(creditId: string) {
    const credit = credits?.find(c => c.id === creditId)
    if (!credit) return
    const customer = customers?.find(c => c.id === credit.customerId)
    if (!customer?.phone) {
      toast('Aucun numéro de téléphone pour ce client', 'error')
      return
    }
    openWhatsApp(customer.phone, buildMessage(credit))
    const reminders = [...(credit.reminderSent || []), new Date().toISOString()]
    try {
      await db.credits.update(creditId, { reminderSent: reminders })
      toast('Rappel envoyé avec succès', 'success')
    } catch {
      toast('Erreur lors de l\'envoi du rappel', 'error')
    }
  }

  async function sendBatch() {
    if (selected.size === 0) {
      toast('Sélectionnez au moins un crédit', 'warning')
      return
    }
    for (const id of selected) {
      const credit = credits?.find(c => c.id === id)
      if (!credit) continue
      const customer = customers?.find(c => c.id === credit.customerId)
      if (!customer?.phone) continue
      openWhatsApp(customer.phone, buildMessage(credit))
      const reminders = [...(credit.reminderSent || []), new Date().toISOString()]
      try {
        await db.credits.update(id, { reminderSent: reminders })
      } catch {
        // skip individual errors in batch
      }
    }
    toast(`${selected.size} rappel(s) envoyé(s)`, 'success')
    setSelected(new Set())
  }

  const totalOutstanding = outstanding.reduce((s, c) => s + c.balance, 0)
  const overdueCount = outstanding.filter(c => c.status === 'overdue' || (c.status === 'active' && new Date(c.dueDate) < new Date())).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Rappels SMS</h1>
          <p className="text-surface-500 text-sm mt-1">Envoyer des relances aux clients</p>
        </div>
        <Button onClick={sendBatch} disabled={selected.size === 0}>
          <Send className="w-4 h-4" /> Envoyer en lot ({selected.size})
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-50 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-surface-500">Encours total</p>
              <p className="text-xl font-bold text-surface-900">{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-red-50 text-red-600">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-surface-500">Crédits échus</p>
              <p className="text-xl font-bold text-surface-900">{overdueCount}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-surface-500">Clients à relancer</p>
              <p className="text-xl font-bold text-surface-900">{outstanding.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 sm:max-w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text" placeholder="Rechercher un client..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="w-10 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={paginatedItems.length > 0 && selected.size === paginatedItems.length}
                    onChange={toggleSelectAll}
                    className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-4 py-4">Client</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-4 py-4">Montant</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-4 py-4">Solde</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-4 py-4">Échéance</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-4 py-4">Statut</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-4 py-4">Relances</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems.map((credit) => {
                const isOverdue = new Date(credit.dueDate) < new Date() && credit.status === 'active'
                const reminderCount = credit.reminderSent?.length || 0
                return (
                  <tr key={credit.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selected.has(credit.id)}
                        onChange={() => toggleSelect(credit.id)}
                        className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-surface-900">{credit.customerName}</td>
                    <td className="px-4 py-4 text-right text-sm text-surface-600">{formatCurrency(credit.amount)}</td>
                    <td className="px-4 py-4 text-right text-sm font-semibold text-surface-900">{formatCurrency(credit.balance)}</td>
                    <td className="px-4 py-4 text-center text-sm text-surface-500">{formatDate(credit.dueDate)}</td>
                    <td className="px-4 py-4 text-center">
                      <Badge variant={credit.status === 'paid' ? 'success' : isOverdue ? 'danger' : 'warning'}>
                        {credit.status === 'paid' ? 'Payé' : isOverdue ? 'Échu' : 'Actif'}
                      </Badge>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => setHistoryCredit(credit)}
                        className="inline-flex items-center gap-1 text-xs text-surface-400 hover:text-primary-600 transition-colors"
                      >
                        <History className="w-3 h-3" />
                        {reminderCount}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => sendReminder(credit.id)}
                          className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600"
                          title="Envoyer rappel WhatsApp"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Send className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-400">Aucun crédit en cours</p>
          </div>
        )}
        {filtered.length > 0 && (
          <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
        )}
      </Card>

      <Modal open={!!historyCredit} onClose={() => setHistoryCredit(null)} title="Historique des relances">
        <div className="p-6">
          {historyCredit && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-4 border-b border-surface-200">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-surface-900">{historyCredit.customerName}</p>
                  <p className="text-xs text-surface-400">{formatCurrency(historyCredit.balance)} restant</p>
                </div>
              </div>
              {historyCredit.reminderSent && historyCredit.reminderSent.length > 0 ? (
                <div className="space-y-2">
                  {historyCredit.reminderSent.map((date, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-surface-600">Relance envoyée le {formatDate(date)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-400 text-center py-8">Aucune relance envoyée</p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
