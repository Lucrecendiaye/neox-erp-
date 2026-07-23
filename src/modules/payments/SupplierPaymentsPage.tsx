import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, DollarSign, CheckCircle, Clock, AlertTriangle, FileText } from 'lucide-react'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { Purchase, Supplier, AccountingEntry } from '@/types'

export default function SupplierPaymentsPage() {
  const isCloud = isSupabaseConfigured()
  const dexiePurchases = useLiveQuery(() => db.purchases.orderBy('createdAt').reverse().toArray(), [])
  const { data: supabasePurchases } = useSupabaseQuery<Purchase>('purchases', undefined, [])
  const purchases = isCloud ? (supabasePurchases || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : dexiePurchases
  const dexieSuppliers = useLiveQuery(() => db.suppliers.toArray(), [])
  const { data: supabaseSuppliers } = useSupabaseQuery<Supplier>('suppliers', undefined, [])
  const suppliers = isCloud ? supabaseSuppliers : dexieSuppliers
  const [search, setSearch] = useState('')
  const [payModal, setPayModal] = useState(false)
  const [selectedPurchase, setSelectedPurchase] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState(0)

  const unpaid = useMemo(() => {
    const map = new Map<string, { supplierId: string; supplierName: string; total: number; paid: number; balance: number }>()
    purchases?.forEach(p => {
      const id = p.supplierId || 'unknown'
      const existing = map.get(id) || { supplierId: id, supplierName: p.supplierName || 'Inconnu', total: 0, paid: 0, balance: 0 }
      existing.total += p.total
      existing.paid += p.paid || 0
      existing.balance = existing.total - existing.paid
      map.set(id, existing)
    })
    return [...map.values()].filter(s => s.balance > 0)
  }, [purchases])

  const filteredPurchases = purchases?.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (p.supplierName || '').toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  })

  const duePurchases = filteredPurchases?.filter(p => (p.paid || 0) < p.total) || []
  const { paginatedItems, ...pag } = usePagination(duePurchases, 10)

  async function handlePay() {
    if (!selectedPurchase) return
    const purchase = purchases?.find(p => p.id === selectedPurchase)
    if (!purchase) return

    const newPaid = (purchase.paid || 0) + payAmount
    const newStatus = newPaid >= purchase.total ? 'completed' : purchase.status

    try {
      if (isCloud) { await sb.update('purchases', selectedPurchase, { paid: newPaid, status: newStatus }) } else { await db.purchases.update(selectedPurchase, { paid: newPaid, status: newStatus }) }
      if (isCloud) { await sb.insert('accounting_entries', { id: generateId(), businessId: 'biz-default', date: new Date().toISOString(), type: 'expense', accountId: 'acc-expense', accountName: 'Dépenses', amount: payAmount, direction: 'debit', reference: `PAY-${purchase.id}`, description: `Paiement fournisseur: ${purchase.supplierName || 'N/A'} - ${purchase.id}`, createdAt: new Date().toISOString(), userId: 'admin' }) } else { await db.accountingEntries.add({ id: generateId(), businessId: 'biz-default', date: new Date().toISOString(), type: 'expense', accountId: 'acc-expense', accountName: 'Dépenses', amount: payAmount, direction: 'debit', reference: `PAY-${purchase.id}`, description: `Paiement fournisseur: ${purchase.supplierName || 'N/A'} - ${purchase.id}`, createdAt: new Date().toISOString(), userId: 'admin' }) }
      toast('Paiement enregistré avec succès', 'success')
      setPayModal(false)
      setPayAmount(0)
      setSelectedPurchase(null)
    } catch (error) {
      toast('Erreur lors de l\'enregistrement du paiement', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Paiements fournisseurs</h1>
        <p className="text-surface-500 text-sm mt-1">{unpaid.length} fournisseur{unpaid.length > 1 ? 's' : ''} avec solde impayé</p>
      </div>

      {unpaid.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {unpaid.map(s => (
            <Card key={s.supplierId} padding="sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-surface-900">{s.supplierName}</p>
                  <p className="text-xs text-surface-400">{s.total} achat{s.total > 1 ? 's' : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-surface-500">Solde</p>
                  <p className="text-lg font-bold text-danger">{formatCurrency(s.balance)}</p>
                </div>
              </div>
              <div className="mt-3 w-full bg-surface-100 rounded-full h-2">
                <div className="bg-success h-2 rounded-full" style={{ width: `${Math.min(100, (s.paid / s.total) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-surface-400 mt-1">
                <span>Payé: {formatCurrency(s.paid)}</span>
                <span>Total: {formatCurrency(s.total)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Achats impayés</CardTitle>
          <div className="relative w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        </CardHeader>
        <div className="space-y-1">
          {paginatedItems.map(p => {
            const remaining = p.total - (p.paid || 0)
            return (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg ${remaining > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {remaining > 0 ? <Clock className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-900">{p.supplierName || 'N/A'}</p>
                    <p className="text-xs text-surface-400">{formatDate(p.createdAt)} · {p.items.length} article{p.items.length > 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-surface-900">{formatCurrency(p.total)}</p>
                    <Badge variant={remaining > 0 ? 'warning' : 'success'}>{remaining > 0 ? `${formatCurrency(remaining)} dû` : 'Payé'}</Badge>
                  </div>
                  {remaining > 0 && (
                    <Button size="sm" onClick={() => { setSelectedPurchase(p.id); setPayAmount(remaining); setPayModal(true) }}>
                      <DollarSign className="w-4 h-4" /> Payer
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
          {duePurchases.length > 0 && (
            <div className="flex justify-center pt-4">
              <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
            </div>
          )}
          {duePurchases.length === 0 && (
            <div className="text-center py-12 text-surface-400">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success" />
              <p className="text-sm">Tous les achats sont payés</p>
            </div>
          )}
        </div>
      </Card>

      <Modal open={payModal} onClose={() => setPayModal(false)} title="Enregistrer un paiement" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-surface-600">
            Paiement pour l'achat <span className="font-medium text-surface-900">{selectedPurchase}</span>
          </p>
          <Input label="Montant à payer" type="number" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} icon={<DollarSign className="w-4 h-4" />} />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setPayModal(false)}>Annuler</Button>
          <Button onClick={handlePay} disabled={payAmount <= 0}>Confirmer le paiement</Button>
        </div>
      </Modal>
    </div>
  )
}
