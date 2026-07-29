import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Badge, Select } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { ArrowLeft, Package, Truck, ShoppingCart, RefreshCw, ArrowRightLeft, AlertTriangle, Edit2 } from 'lucide-react'
import { useBusinessId } from '@/hooks/useBusinessId'

const actionLabels: Record<string, string> = {
  purchased: 'Achat',
  sold: 'Vente',
  returned: 'Retour',
  adjusted: 'Ajustement',
  transferred_in: 'Transfert entrant',
  transferred_out: 'Transfert sortant',
  supplier_entry: 'Entrée fournisseur',
  supplier_exit: 'Sortie fournisseur',
  created: 'Création',
  inventory: 'Inventaire',
  price_changed: 'Changement prix',
}

const actionIcons: Record<string, typeof Package> = {
  purchased: Truck,
  sold: ShoppingCart,
  transferred_in: ArrowRightLeft,
  transferred_out: ArrowRightLeft,
  adjusted: RefreshCw,
  supplier_entry: Package,
  supplier_exit: Package,
}

export default function ProductDetailPage() {
  const { productId } = useParams()
  const navigate = useNavigate()
  const product = useLiveQuery(() => db.products.get(productId!), [productId])
  const history = useLiveQuery(() => db.productHistory.where('productId').equals(productId!).reverse().sortBy('createdAt'), [productId])
  const stocks = useLiveQuery(() => db.productStocks.where('productId').equals(productId!).toArray(), [productId])
  const businessId = useBusinessId()
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])
  const categories = useLiveQuery(() => db.categories.where('businessId').equals(businessId).toArray(), [businessId])
  const [filterAction, setFilterAction] = useState('all')
  const [filterLocation, setFilterLocation] = useState('all')

  const filtered = useMemo(() => {
    if (!history) return []
    return history.filter(h => {
      if (filterAction !== 'all' && h.action !== filterAction) return false
      if (filterLocation !== 'all' && h.locationId !== filterLocation) return false
      return true
    })
  }, [history, filterAction, filterLocation])

  const stockByLocation = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of stocks || []) {
      const loc = locations?.find(l => l.id === s.locationId)
      map[loc?.name || s.locationId] = s.quantity
    }
    return map
  }, [stocks, locations])

  const categoryName = useMemo(() => {
    if (!product?.categoryId) return ''
    return categories?.find(c => c.id === product.categoryId)?.name || ''
  }, [product, categories])

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/products')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 overflow-hidden">
            {product?.photos?.[0] ? <img src={product.photos[0]} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">{product?.name || 'Produit'}</h1>
            <p className="text-xs text-surface-400">{product?.barcode || product?.reference || ''} {categoryName && `• ${categoryName}`}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-surface-500">{formatCurrency(product?.purchasePrice || 0)} → {formatCurrency(product?.sellingPrice || 0)}</p>
          {product && <Badge variant={product.margin >= 20 ? 'success' : product.margin >= 10 ? 'warning' : 'danger'}>{product.margin.toFixed(0)}% marge</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 text-center">
            <p className="text-sm text-surface-500">Prix achat</p>
            <p className="text-xl font-bold text-surface-900">{formatCurrency(product?.purchasePrice || 0)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-sm text-surface-500">Prix vente</p>
            <p className="text-xl font-bold text-surface-900">{formatCurrency(product?.sellingPrice || 0)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-sm text-surface-500">Stock total</p>
            <p className="text-xl font-bold text-surface-900">{stocks?.reduce((s, x) => s + x.quantity, 0) || 0}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-sm text-surface-500">Mouvements</p>
            <p className="text-xl font-bold text-surface-900">{history?.length || 0}</p>
          </div>
        </Card>
      </div>

      {Object.keys(stockByLocation).length > 0 && (
        <Card>
          <CardHeader><CardTitle><Package className="w-5 h-5 inline mr-2" />Stock par emplacement</CardTitle></CardHeader>
          <div className="flex flex-wrap gap-3 p-4">
            {Object.entries(stockByLocation).map(([loc, qty]) => (
              <div key={loc} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-50">
                <span className="text-sm text-surface-500">{loc}</span>
                <span className="text-sm font-semibold">{qty}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle><RefreshCw className="w-5 h-5 inline mr-2" />Historique des mouvements</CardTitle>
            <div className="flex gap-2">
              <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-surface-300 text-xs">
                <option value="all">Toutes actions</option>
                {Object.entries(actionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-surface-300 text-xs">
                <option value="all">Tous lieux</option>
                {locations?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Action</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Emplacement</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Avant</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Après</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Delta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Référence</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {filtered.map(h => {
                const delta = h.quantityAfter - h.quantityBefore
                const Icon = actionIcons[h.action] || RefreshCw
                const locName = locations?.find(l => l.id === h.locationId)?.name || h.locationId
                return (
                  <tr key={h.id} className="hover:bg-surface-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-surface-400'}`} />
                        <span className="text-sm font-medium">{actionLabels[h.action] || h.action}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-500">{locName}</td>
                    <td className="px-4 py-3 text-sm text-right">{h.quantityBefore}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{h.quantityAfter}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold">
                      <span className={delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : ''}>
                        {delta > 0 ? '+' : ''}{delta}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-surface-400">{h.reference || h.comment || '—'}</td>
                    <td className="px-4 py-3 text-sm text-surface-400 text-right whitespace-nowrap">{formatDateTime(h.createdAt)}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-400">Aucun mouvement</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
