import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { ArrowLeft, History, Package, ArrowRightLeft, ShoppingCart, AlertTriangle, RefreshCw, Plus, Search } from 'lucide-react'
import { useBusinessId } from '@/hooks/useBusinessId'
import type { ProductHistoryAction } from '@/engine/types'

const actionLabels: Record<ProductHistoryAction, { label: string; icon: any; color: string }> = {
  created: { label: 'Création', icon: Plus, color: 'text-blue-600 bg-blue-50' },
  updated: { label: 'Mise à jour', icon: RefreshCw, color: 'text-purple-600 bg-purple-50' },
  deleted: { label: 'Suppression', icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  purchased: { label: 'Achat', icon: Package, color: 'text-green-600 bg-green-50' },
  sold: { label: 'Vente', icon: ShoppingCart, color: 'text-primary-600 bg-primary-50' },
  returned: { label: 'Retour', icon: RefreshCw, color: 'text-amber-600 bg-amber-50' },
  adjusted: { label: 'Ajustement', icon: AlertTriangle, color: 'text-orange-600 bg-orange-50' },
  transferred_in: { label: 'Entrée transfert', icon: ArrowRightLeft, color: 'text-cyan-600 bg-cyan-50' },
  transferred_out: { label: 'Sortie transfert', icon: ArrowRightLeft, color: 'text-rose-600 bg-rose-50' },
  price_changed: { label: 'Changement prix', icon: RefreshCw, color: 'text-violet-600 bg-violet-50' },
  inventory: { label: 'Inventaire', icon: Package, color: 'text-teal-600 bg-teal-50' },
  supplier_entry: { label: 'Entrée fournisseur', icon: Package, color: 'text-emerald-600 bg-emerald-50' },
  supplier_exit: { label: 'Sortie fournisseur', icon: ArrowRightLeft, color: 'text-red-600 bg-red-50' },
}

function inPeriod(iso: string, period: string) {
  const d = new Date(iso)
  const now = new Date()
  if (period === 'jour') return d.toDateString() === now.toDateString()
  if (period === 'semaine') return (now.getTime() - d.getTime()) <= 7 * 86400000
  if (period === 'mois') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (period === 'annee') return d.getFullYear() === now.getFullYear()
  return true
}

export default function DepotHistoryPage() {
  const { locationId } = useParams()
  const businessId = useBusinessId()
  const navigate = useNavigate()

  const location = useLiveQuery(() => db.locations.get(locationId!), [locationId])
  const history = useLiveQuery(() =>
    db.productHistory.where('locationId').equals(locationId!).reverse().sortBy('createdAt'),
    [locationId]
  )
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const users = useLiveQuery(() => db.users.where('businessId').equals(businessId).toArray(), [businessId])

  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')

  const productMap = useMemo(() => new Map(products?.map(p => [p.id, p])), [products])
  const userMap = useMemo(() => new Map(users?.map(u => [u.id, u])), [users])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (history || []).filter(h => {
      if (actionFilter !== 'all' && h.action !== actionFilter) return false
      if (periodFilter !== 'all' && !inPeriod(h.createdAt, periodFilter)) return false
      if (q) {
        const prod = productMap.get(h.productId)
        const hay = `${prod?.name || h.productId} ${h.comment || ''} ${h.reference || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [history, search, actionFilter, periodFilter, productMap])

  const actionIcons: Record<string, any> = {
    sold: ShoppingCart,
    purchased: Package,
    transferred_in: ArrowRightLeft,
    transferred_out: ArrowRightLeft,
    adjusted: AlertTriangle,
    returned: RefreshCw,
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Mouvements — {location?.name}</h1>
          <p className="text-surface-500 text-sm">Historique des mouvements de stock</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Produit, commentaire, référence..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-white">
          <option value="all">Toutes les actions</option>
          {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-white">
          <option value="all">Toutes périodes</option>
          <option value="jour">Aujourd'hui</option>
          <option value="semaine">7 derniers jours</option>
          <option value="mois">Ce mois-ci</option>
          <option value="annee">Cette année</option>
        </select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto responsive-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Date</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Action</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Produit</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Avant</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Après</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Delta</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Utilisateur</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Commentaire</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map(h => {
                const action = actionLabels[h.action] || { label: h.action, icon: RefreshCw, color: 'text-surface-600 bg-surface-100' }
                const Icon = action.icon
                const product = productMap.get(h.productId)
                const user = userMap.get(h.userId)
                const delta = h.quantityAfter - h.quantityBefore
                return (
                  <tr key={h.id} className="hover:bg-surface-50">
                    <td data-label="Date" className="px-6 py-4 text-xs text-surface-500 whitespace-nowrap">{formatDateTime(h.createdAt)}</td>
                    <td data-label="Action" className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${action.color}`}>
                        <Icon className="w-3 h-3" />
                        {action.label}
                      </span>
                    </td>
                    <td data-label="Produit" className="px-6 py-4 text-sm font-medium text-surface-900">{product?.name || h.productId}</td>
                    <td data-label="Avant" className="px-6 py-4 text-right text-sm text-surface-600">{h.quantityBefore}</td>
                    <td data-label="Après" className="px-6 py-4 text-right text-sm text-surface-600">{h.quantityAfter}</td>
                    <td data-label="Delta" className="px-6 py-4 text-right text-sm font-semibold" style={{ color: delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#6b7280' }}>
                      {delta > 0 ? '+' : ''}{delta}
                    </td>
                    <td data-label="Utilisateur" className="px-6 py-4 text-sm text-surface-600">{user?.name || 'Inconnu'}</td>
                    <td data-label="Commentaire" className="px-6 py-4 text-sm text-surface-400 max-w-[200px] truncate">{h.comment || h.reference || '-'}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-8 text-center text-surface-400">Aucun mouvement trouvé</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}