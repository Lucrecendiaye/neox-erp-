import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, StatCard } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency } from '@/lib/utils'
import { getLocationStockValue } from '@/engine/operations'
import { ArrowLeft, Package, AlertTriangle, Boxes } from 'lucide-react'
import { useGoBack } from '@/hooks/useGoBack'

export default function DepotStatsPage() {
  const { locationId } = useParams()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const location = useLiveQuery(() => db.locations.get(locationId!), [locationId])
  const stocks = useLiveQuery(() => db.productStocks.where('locationId').equals(locationId!).toArray(), [locationId])
  const stockValue = useLiveQuery(() => getLocationStockValue(locationId!), [locationId])

  const stats = useMemo(() => {
    const rows = stocks || []
    return {
      productCount: rows.filter(x => x.quantity > 0).length,
      totalQty: rows.reduce((s, x) => s + x.quantity, 0),
      lowStock: rows.filter(x => x.quantity <= x.stockAlert).length,
    }
  }, [stocks])

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">{location?.name} â€” Statistiques</h1>
          <p className="text-surface-500 text-sm">{location?.type === 'shop' ? 'Boutique' : 'DÃ©pÃ´t'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Produits en stock" value={stats.productCount} icon={<Package className="w-5 h-5" />} color="primary" />
        <StatCard title="QuantitÃ© totale" value={stats.totalQty} icon={<Boxes className="w-5 h-5" />} color="success" />
        <StatCard title="Stocks bas" value={stats.lowStock} icon={<AlertTriangle className="w-5 h-5" />} color="warning" />
      </div>

      <Card>
        <CardHeader><CardTitle>Valorisation du stock</CardTitle></CardHeader>
        <div className="p-4">
          <p className="text-3xl font-bold text-primary-400">{formatCurrency(stockValue || 0)}</p>
        </div>
      </Card>
    </div>
  )
}
