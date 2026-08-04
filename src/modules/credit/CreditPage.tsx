import { useState } from 'react'
import { Card, Badge, StatCard, Pagination, Button, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePermission } from '@/hooks/usePermission'
import db from '@/db'
import { formatCurrency, formatDate, formatDateTime, openWhatsApp } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { recordCreditPayment, modifyCreditPayment, deleteCreditPayment } from '@/engine/operations'
import {
  Search, AlertTriangle, Clock, CheckCircle, MessageSquare,
  CreditCard, DollarSign, History, Edit2, Trash2, X, Save, Plus
} from 'lucide-react'
import type { Credit, CreditPayment, PaymentMethod } from '@/types'

export default function CreditPage() {
  const businessId = useBusinessId()
  const { permissions } = usePermission()
  const canCreate = permissions.includes('credit:create') || permissions.includes('*')
  const canEdit = permissions.includes('credit:edit') || permissions.includes('*')
  const canDelete = permissions.includes('credit:delete') || permissions.includes('*')

  const credits = useLiveQuery(
    () => db.credits.where('businessId').equals(businessId).reverse().sortBy('createdAt'),
    [businessId]
  ) || []

  const allPayments = useLiveQuery(
    () => db.creditPayments.where('businessId').equals(businessId).reverse().sortBy('createdAt'),
    [businessId]
  ) || []

  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) || []

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedCredit, setSelectedCredit] = useState<Credit | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const [payModal, setPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [payNote, setPayNote] = useState('')
  const [payCredit, setPayCredit] = useState<Credit | null>(null)

  const [editPayModal, setEditPayModal] = useState(false)
  const [editPayTarget, setEditPayTarget] = useState<CreditPayment | null>(null)
  const [editPayAmount, setEditPayAmount] = useState('')
  const [editPayMethod, setEditPayMethod] = useState<PaymentMethod>('cash')

  const [deletePayTarget, setDeletePayTarget] = useState<CreditPayment | null>(null)

  const totalOutstanding = credits.reduce((s, x) => s + x.balance, 0)
  const overdue = credits.filter(c => c.status === 'overdue' || (c.status === 'active' && new Date(c.dueDate).getFullYear() < 2100 && new Date(c.dueDate) < new Date()))
  const totalOverdue = overdue.reduce((s, x) => s + x.balance, 0)
  const activeCount = credits.filter(c => c.status === 'active').length

  const filtered = credits.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return c.customerName?.toLowerCase().includes(q)
    }
    return true
  })
  const { paginatedItems, ...pag } = usePagination(filtered, 10)

  const creditPayments = (creditId: string) =>
    allPayments.filter(p => p.creditId === creditId).reverse()

  async function handlePay() {
    if (!payCredit) return
    const amount = parseFloat(payAmount)
    if (isNaN(amount) || amount <= 0) { toast('Montant invalide', 'error'); return }
    try {
      await recordCreditPayment(payCredit.id, amount, payMethod, payNote || undefined)
      toast('Paiement enregistré', 'success')
      setPayModal(false)
      setPayAmount(''); setPayNote(''); setPayCredit(null)
    } catch (err: any) { toast(err?.message || 'Erreur', 'error') }
  }

  async function handleEditPay() {
    if (!editPayTarget) return
    const amount = parseFloat(editPayAmount)
    if (isNaN(amount) || amount <= 0) { toast('Montant invalide', 'error'); return }
    try {
      await modifyCreditPayment(editPayTarget.id, amount, editPayMethod)
      toast('Paiement modifié', 'success')
      setEditPayModal(false)
      setEditPayTarget(null)
    } catch (err: any) { toast(err?.message || 'Erreur', 'error') }
  }

  async function handleDeletePay() {
    if (!deletePayTarget) return
    try {
      await deleteCreditPayment(deletePayTarget.id)
      toast('Paiement supprimé', 'success')
      setDeletePayTarget(null)
    } catch (err: any) { toast(err?.message || 'Erreur', 'error') }
  }

  function openPayModal(credit: Credit) {
    setPayCredit(credit)
    setPayAmount(String(credit.balance))
    setPayMethod('cash')
    setPayNote('')
    setPayModal(true)
  }

  function openHistory(credit: Credit) {
    setSelectedCredit(credit)
    setShowHistory(true)
  }

  const methodLabel: Record<string, string> = {
    cash: 'Espèces', card: 'Carte', mobile: 'Mobile Money',
    credit: 'Crédit', bank: 'Virement', split: 'Mixte',
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Gestion du Crédit</h1>
        <p className="text-surface-500 text-sm mt-1">Suivi des créances, paiements et échéanciers</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard title="Encours total" value={formatCurrency(totalOutstanding)} icon={<CreditCard className="w-5 h-5" />} color="warning" />
        <StatCard title="Créances échues" value={formatCurrency(totalOverdue)} icon={<AlertTriangle className="w-5 h-5" />} color="danger" />
        <StatCard title="Crédits actifs" value={activeCount} icon={<Clock className="w-5 h-5" />} color="info" />
        <StatCard title="Total crédits" value={credits.length} icon={<DollarSign className="w-5 h-5" />} color="primary" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center w-full">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input type="text" placeholder="Rechercher un client..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="paid">Payés</option>
          <option value="overdue">Échus</option>
          <option value="defaulted">Défauts</option>
        </select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto responsive-table">
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
              {paginatedItems?.map((c) => {
                const isOverdue = new Date(c.dueDate).getFullYear() < 2100 && new Date(c.dueDate) < new Date() && c.status === 'active'
                return (
                  <tr key={c.id} className="hover:bg-surface-50 transition-colors group">
                    <td data-label="Client" className="px-6 py-4">
                      <p className="text-sm font-medium text-surface-900">{c.customerName}</p>
                      <p className="text-xs text-surface-400 font-mono">{c.id.slice(0, 10)}...</p>
                    </td>
                    <td data-label="Montant" className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(c.amount)}</td>
                    <td data-label="Payé" className="px-6 py-4 text-right text-sm text-emerald-600 font-medium">{formatCurrency(c.paid)}</td>
                    <td data-label="Solde" className="px-6 py-4 text-right text-sm font-semibold text-surface-900">{formatCurrency(c.balance)}</td>
                    <td data-label="Échéance" className="px-6 py-4 text-center text-sm text-surface-500">{new Date(c.dueDate).getFullYear() >= 2100 ? '—' : formatDate(c.dueDate)}</td>
                    <td data-label="Statut" className="px-6 py-4 text-center">
                      <Badge variant={c.status === 'paid' ? 'success' : isOverdue ? 'danger' : 'warning'}>
                        {c.status === 'paid' ? 'Payé' : isOverdue ? 'Échu' : c.status === 'defaulted' ? 'Défaut' : 'Actif'}
                      </Badge>
                    </td>
                    <td data-label="Actions" className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openHistory(c)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-primary-600" title="Historique">
                          <History className="w-4 h-4" />
                        </button>
                        <button onClick={() => openHistory(c)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Voir paiements">
                          <DollarSign className="w-4 h-4" />
                        </button>
                        {c.status !== 'paid' && canCreate && (
                          <button onClick={() => openPayModal(c)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Enregistrer un paiement">
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                        {c.status !== 'paid' && (
                          <button onClick={() => {
                            const phone = customers.find(x => x.id === c.customerId)?.phone || ''
                            const msg = `Bonjour ${c.customerName},\nRappel: solde impayé de ${formatCurrency(c.balance)}. Merci de régulariser.`
                            openWhatsApp(phone, msg)
                            toast('WhatsApp ouvert', 'success')
                          }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Envoyer rappel WhatsApp">
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {(!filtered || filtered.length === 0) && (
                <tr><td colSpan={7} className="text-center py-16 text-surface-400">
                  <CreditCard className="w-14 h-14 mx-auto mb-4 text-surface-300" />
                  <p className="text-sm font-medium">Aucun crédit</p>
                  <p className="text-xs mt-1">Les crédits apparaîtront ici après les ventes à crédit</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered && filtered.length > 0 && (
          <div className="flex justify-center p-4 border-t border-surface-200">
            <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
          </div>
        )}
      </Card>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Enregistrer un paiement" size="sm">
        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-surface-500">Client: <span className="font-semibold text-surface-900">{payCredit?.customerName}</span></p>
            <p className="text-sm text-surface-500">Solde restant: <span className="font-semibold text-amber-600">{formatCurrency(payCredit?.balance || 0)}</span></p>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Montant</label>
            <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Mode de paiement</label>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="cash">Espèces</option>
              <option value="mobile">Mobile Money</option>
              <option value="card">Carte</option>
              <option value="bank">Virement</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Note (optionnelle)</label>
            <input type="text" value={payNote} onChange={(e) => setPayNote(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setPayModal(false)}>Annuler</Button>
            <Button onClick={handlePay}><Save className="w-4 h-4" /> Enregistrer</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showHistory} onClose={() => setShowHistory(false)}
        title={`Paiements - ${selectedCredit?.customerName || ''}`} size="md">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card className="p-4"><p className="text-xs text-surface-500">Total</p><p className="text-lg font-bold">{formatCurrency(selectedCredit?.amount || 0)}</p></Card>
            <Card className="p-4"><p className="text-xs text-surface-500">Payé</p><p className="text-lg font-bold text-emerald-600">{formatCurrency(selectedCredit?.paid || 0)}</p></Card>
            <Card className="p-4"><p className="text-xs text-surface-500">Solde</p><p className="text-lg font-bold text-amber-600">{formatCurrency(selectedCredit?.balance || 0)}</p></Card>
          </div>

          {selectedCredit && creditPayments(selectedCredit.id).length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-surface-700">Historique des paiements</h3>
              {creditPayments(selectedCredit.id).map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-surface-50 rounded-xl border border-surface-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-surface-900">{formatCurrency(p.amount)}</p>
                      <p className="text-xs text-surface-400">
                        {formatDateTime(p.date)} · {methodLabel[p.method] || p.method}
                        {p.note ? ` · ${p.note}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <button onClick={() => {
                        setEditPayTarget(p)
                        setEditPayAmount(String(p.amount))
                        setEditPayMethod(p.method)
                        setEditPayModal(true)
                      }} className="p-1.5 rounded-lg hover:bg-surface-200 text-surface-400 hover:text-amber-600" title="Modifier">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => setDeletePayTarget(p)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-red-600" title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-400 text-center py-8">Aucun paiement enregistré</p>
          )}

          {selectedCredit && selectedCredit.status !== 'paid' && canCreate && (
            <div className="flex justify-center pt-2">
              <Button onClick={() => { setShowHistory(false); openPayModal(selectedCredit) }}>
                <Plus className="w-4 h-4" /> Ajouter un paiement
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={editPayModal} onClose={() => setEditPayModal(false)} title="Modifier le paiement" size="sm">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Montant</label>
            <input type="number" value={editPayAmount} onChange={(e) => setEditPayAmount(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Mode de paiement</label>
            <select value={editPayMethod} onChange={(e) => setEditPayMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="cash">Espèces</option>
              <option value="mobile">Mobile Money</option>
              <option value="card">Carte</option>
              <option value="bank">Virement</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditPayModal(false)}>Annuler</Button>
            <Button onClick={handleEditPay}><Save className="w-4 h-4" /> Enregistrer</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deletePayTarget} onClose={() => setDeletePayTarget(null)}
        title="Supprimer le paiement" size="sm">
        <div className="p-6 space-y-4 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-danger" />
          </div>
          <p className="text-sm text-surface-600">
            Supprimer ce paiement de {formatCurrency(deletePayTarget?.amount || 0)} ? Cette action est réversible via la corbeille.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="ghost" onClick={() => setDeletePayTarget(null)}>Annuler</Button>
            <Button variant="danger" onClick={handleDeletePay}><Trash2 className="w-4 h-4" /> Supprimer</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}