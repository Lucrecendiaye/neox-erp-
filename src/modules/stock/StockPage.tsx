import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { usePagination } from '@/hooks/usePagination'
import { isSupabaseConfigured } from '@/lib/supabase'
import db from '@/db'
import { generateId, formatCurrency } from '@/lib/utils'
import { Search, Plus, Package, AlertTriangle, TrendingUp, TrendingDown, ClipboardList, BarChart3 } from 'lucide-react'

export default function StockPage() {
  const isCloud = isSupabaseConfigured()
  const [tab, setTab] = useState<'movements' | 'valuation' | 'inventory'>('movements')
  const dexieMovements = useLiveQuery(() => db.stockMovements.orderBy('createdAt').reverse().limit(100).toArray(), [])
  const dexieProducts = useLiveQuery(() => db.products.toArray(), [])
  const { data: supabaseMovements } = useSupabaseQuery<any>('stock_movements', (q) => q.order('createdAt', { ascending: false }).limit(100), [])
  const { data: supabaseProducts } = useSupabaseQuery<any>('products', undefined, [])
  const movements = isCloud ? supabaseMovements : dexieMovements
  const products = isCloud ? supabaseProducts : dexieProducts
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [moveForm, setMoveForm] = useState({ productId: '', type: 'in' as 'in' | 'out' | 'adjustment', quantity: 1, unitPrice: 0, note: '' })

  const productStock = useMemo(() => {
    const map = new Map<string, number>()
    movements?.forEach(m => {
      let qty = m.quantity
      if (m.type === 'in' || m.type === 'inventory') qty = Math.abs(m.quantity)
      else if (m.type === 'out') qty = -Math.abs(m.quantity)
      else if (m.type === 'adjustment' || m.type === 'transfer') qty = m.quantity
      map.set(m.productId, (map.get(m.productId) || 0) + qty)
    })
    return map
  }, [movements])

  const valuation = useMemo(() => {
    let totalValue = 0
    let totalCost = 0
    const details: { product: string; qty: number; avgPrice: number; value: number }[] = []

    products?.forEach(p => {
      const qty = productStock.get(p.id) || 0
      if (qty <= 0) return
      const productMoves = movements?.filter(m => m.productId === p.id && m.type === 'in') || []
      const totalQty = productMoves.reduce((s, m) => s + m.quantity, 0)
      const avgPrice = totalQty > 0 ? productMoves.reduce((s, m) => s + (m.unitPrice || 0) * m.quantity, 0) / totalQty : p.purchasePrice
      const value = qty * avgPrice
      totalValue += value
      totalCost += qty * p.purchasePrice
      details.push({ product: p.name, qty, avgPrice, value })
    })

    return { totalValue, totalCost, details, profit: totalValue - totalCost }
  }, [products, productStock, movements])

  const lowStock = products?.filter(p => p.stockAlert && (productStock.get(p.id) || 0) <= p.stockAlert) || []

  const filteredMovements = movements?.filter(m => {
    if (!search) return true
    const product = products?.find(p => p.id === m.productId)
    return (product?.name || '').toLowerCase().includes(search.toLowerCase()) || m.reference?.includes(search) || m.type.includes(search)
  })
  const { paginatedItems, ...pag } = usePagination(filteredMovements, 15)

  async function handleMove() {
    const now = new Date().toISOString()
    const product = products?.find(p => p.id === moveForm.productId)
    const movement = {
      id: generateId(),
      businessId: 'biz-default',
      productId: moveForm.productId,
      type: moveForm.type,
      quantity: moveForm.type === 'out' ? -Math.abs(moveForm.quantity) : moveForm.quantity,
      unitPrice: moveForm.unitPrice || undefined,
      reference: `MANUAL-${Date.now()}`,
      note: moveForm.note || `${moveForm.type}: ${product?.name || ''}`,
      createdAt: now,
      userId: 'admin',
    }
    if (isCloud) {
      await sb.insert('stock_movements', movement)
    } else {
      await db.stockMovements.add(movement)
    }
    setModalOpen(false)
    setMoveForm({ productId: '', type: 'in', quantity: 1, unitPrice: 0, note: '' })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Gestion du stock</h1>
        <p className="text-surface-500 text-sm mt-1">{products?.length || 0} produits · {formatCurrency(valuation.totalValue)} valorisation</p>
      </div>

      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Alertes stock</p>
            <p className="text-sm text-amber-700">{lowStock.length} produit{lowStock.length > 1 ? 's' : ''} sous le seuil d'alerte</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {(['movements', 'valuation', 'inventory'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-primary-600 text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>
            {t === 'movements' ? 'Mouvements' : t === 'valuation' ? 'Valorisation' : 'Inventaire'}
          </button>
        ))}
      </div>

      {tab === 'movements' && (
        <>
          <div className="flex items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Mouvement</Button>
          </div>

          <Card padding="sm">
            <div className="space-y-1">
              {paginatedItems?.map(m => {
                const product = products?.find(p => p.id === m.productId)
                return (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${m.type === 'in' ? 'bg-emerald-50 text-emerald-600' : m.type === 'out' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        {m.type === 'in' ? <TrendingUp className="w-4 h-4" /> : m.type === 'out' ? <TrendingDown className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-900">{product?.name || 'Produit supprimé'}</p>
                        <p className="text-xs text-surface-400 capitalize">{m.type} · {m.reference || '—'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${m.quantity > 0 ? 'text-success' : 'text-danger'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </p>
                      {m.note && <p className="text-xs text-surface-400">{m.note}</p>}
                    </div>
                  </div>
                )
              })}
              <div className="flex justify-center pt-4">
                <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
              </div>
              {(!filteredMovements || filteredMovements.length === 0) && (
                <p className="text-center py-8 text-surface-400 text-sm">Aucun mouvement</p>
              )}
            </div>
          </Card>
        </>
      )}

      {tab === 'valuation' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="sm"><div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-blue-50 text-blue-600"><Package className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Valeur du stock</p><p className="text-lg font-bold">{formatCurrency(valuation.totalValue)}</p></div></div></Card>
            <Card padding="sm"><div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><BarChart3 className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Marge potentielle</p><p className="text-lg font-bold text-success">{formatCurrency(valuation.profit)}</p></div></div></Card>
            <Card padding="sm"><div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-amber-50 text-amber-600"><AlertTriangle className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Alertes</p><p className="text-lg font-bold">{lowStock.length}</p></div></div></Card>
          </div>

          <Card>
            <CardTitle>Détail par produit</CardTitle>
            <div className="mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 text-surface-500 text-xs">
                    <th className="text-left pb-3">Produit</th>
                    <th className="text-right pb-3">Qté</th>
                    <th className="text-right pb-3">Prix moyen</th>
                    <th className="text-right pb-3">Valeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {valuation.details.map(d => (
                    <tr key={d.product} className="hover:bg-surface-50">
                      <td className="py-3 font-medium text-surface-900">{d.product}</td>
                      <td className="py-3 text-right text-surface-600">{d.qty}</td>
                      <td className="py-3 text-right text-surface-600">{formatCurrency(d.avgPrice)}</td>
                      <td className="py-3 text-right font-semibold">{formatCurrency(d.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {valuation.details.length === 0 && <p className="text-center py-8 text-surface-400">Stock vide</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'inventory' && (
        <Card>
          <CardTitle>État des stocks</CardTitle>
          <div className="mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-surface-500 text-xs">
                  <th className="text-left pb-3">Produit</th>
                  <th className="text-right pb-3">Stock</th>
                  <th className="text-right pb-3">Seuil</th>
                  <th className="text-center pb-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {products?.map(p => {
                  const qty = productStock.get(p.id) || 0
                  const isLow = p.stockAlert && qty <= p.stockAlert
                  return (
                    <tr key={p.id} className={`hover:bg-surface-50 ${isLow ? 'bg-amber-50/50' : ''}`}>
                      <td className="py-3 font-medium text-surface-900">{p.name}</td>
                      <td className="py-3 text-right font-semibold">{qty}</td>
                      <td className="py-3 text-right text-surface-500">{p.stockAlert || '—'}</td>
                      <td className="py-3 text-center">
                        <Badge variant={qty <= 0 ? 'danger' : isLow ? 'warning' : 'success'}>
                          {qty <= 0 ? 'Rupture' : isLow ? 'Faible' : 'OK'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau mouvement de stock" size="md">
        <div className="p-6 space-y-4">
          <Select label="Produit" value={moveForm.productId} onChange={(e) => setMoveForm({ ...moveForm, productId: e.target.value })}
            options={(products || []).map(p => ({ value: p.id, label: p.name }))} placeholder="Sélectionner..." />
          <Select label="Type" value={moveForm.type} onChange={(e) => setMoveForm({ ...moveForm, type: e.target.value as 'in' | 'out' | 'adjustment' })}
            options={[{ value: 'in', label: 'Entrée' }, { value: 'out', label: 'Sortie' }, { value: 'adjustment', label: 'Ajustement' }, { value: 'inventory', label: 'Inventaire' }, { value: 'transfer', label: 'Transfert' }]} />
          <Input label="Quantité" type="number" value={moveForm.quantity} onChange={(e) => setMoveForm({ ...moveForm, quantity: +e.target.value })} />
          <Input label="Prix unitaire" type="number" value={moveForm.unitPrice} onChange={(e) => setMoveForm({ ...moveForm, unitPrice: +e.target.value })} />
          <Input label="Note" value={moveForm.note} onChange={(e) => setMoveForm({ ...moveForm, note: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleMove}>Valider</Button>
        </div>
      </Modal>
    </div>
  )
}
