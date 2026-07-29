import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, Package, Search, Warehouse, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function DepotGlobalStockPage() {
  const businessId = useBusinessId()
  const navigate = useNavigate()
  const allProducts = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const allStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).filter(l => l.type === 'warehouse').toArray(), [businessId])
  const [search, setSearch] = useState('')

  const locationMap = useMemo(() => new Map(locations?.map(l => [l.id, l])), [locations])

  const stocksByProduct = useMemo(() => {
    const map = new Map<string, { id: string; name: string; quantity: number }[]>()
    allStocks?.forEach(s => {
      if (!map.has(s.productId)) map.set(s.productId, [])
      map.get(s.productId)!.push({
        id: s.locationId, name: locationMap.get(s.locationId)?.name || 'Inconnu', quantity: s.quantity,
      })
    })
    return map
  }, [allStocks, locationMap])

  const stats = useMemo(() => {
    let totalValue = 0, totalProducts = 0, totalStock = 0
    allStocks?.forEach(s => {
      const p = allProducts?.find(x => x.id === s.productId)
      totalValue += s.quantity * (p?.purchasePrice || 0)
      totalStock += s.quantity
    })
    totalProducts = new Set(allStocks?.map(s => s.productId)).size
    return { totalValue, totalProducts, totalStock }
  }, [allStocks, allProducts])

  const filteredProducts = allProducts?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  ) || []

  return (
    <div className="w-full h-full flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-surface-900">Stock global</h1>
          <p className="text-surface-500 text-sm">Tous les dépôts · {stats.totalProducts} produits · {stats.totalStock} pièces</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600"><Package className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Produits</p><p className="text-lg font-bold">{stats.totalProducts}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600"><Warehouse className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Dépôts</p><p className="text-lg font-bold">{locations?.length || 0}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600"><DollarSign className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Valeur stock</p><p className="text-lg font-bold">{formatCurrency(stats.totalValue)}</p></div></div></div></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProducts.map(p => {
          const productStocks = stocksByProduct.get(p.id) || []
          const totalQty = productStocks.reduce((s, x) => s + x.quantity, 0)
          return (
            <Card key={p.id} className="overflow-hidden p-0">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-surface-900 truncate">{p.name}</h3>
                <p className="text-sm font-bold text-primary-600 mt-1">{formatCurrency(p.sellingPrice)}</p>
                <p className="text-sm text-surface-500 mt-1">Total: <strong>{totalQty}</strong> pièces</p>
                <div className="mt-2 space-y-1">
                  {productStocks.filter(s => s.quantity > 0).map(s => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-surface-500">{s.name}</span>
                      <span className="font-medium text-surface-700">{s.quantity}</span>
                    </div>
                  ))}
                  {productStocks.filter(s => s.quantity > 0).length === 0 && (
                    <p className="text-[10px] text-surface-400">Aucun stock disponible</p>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
        {filteredProducts.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-surface-400">
            <Package className="w-12 h-12 mb-3 text-surface-300" />
            <p className="text-sm">Aucun produit trouvé</p>
          </div>
        )}
      </div>
    </div>
  )
}