import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, StatCard } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency } from '@/lib/utils'
import { getLocationStockValue } from '@/engine/operations'
import { ArrowLeft, TrendingUp, Package, ShoppingCart } from 'lucide-react'

export default function DepotStatsPage() {
  const { locationId } = useParams()
  const navigate = useNavigate()
  const location = useLiveQuery(() => db.locations.get(locationId!), [locationId])
  const sales = useLiveQuery(() => db.sales.where('locationId').equals(locationId!).toArray(), [locationId])
  const stockValue = useLiveQuery(() => getLocationStockValue(locationId!), [locationId])

  const stats = useMemo(() => {
    const totalSales = sales?.reduce((s, x) => s + x.total, 0) || 0
    const totalProfit = sales?.reduce((s, x) => {
      const cost = x.items.reduce((c, i) => c + i.quantity * 0, 0)
      return s + x.total - cost
    }, 0) || 0
    return { totalSales, totalProfit, saleCount: sales?.length || 0 }
  }, [sales])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">{location?.name} — Statistiques</h1>
          <p className="text-surface-500 text-sm">{location?.type === 'shop' ? 'Boutique' : 'Dépôt'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Chiffre d'affaires" value={formatCurrency(stats.totalSales)} icon={<TrendingUp className="w-5 h-5" />} color="primary" />
        <StatCard title="Bénéfices" value={formatCurrency(stats.totalProfit)} icon={<Package className="w-5 h-5" />} color="success" />
        <StatCard title="Ventes" value={stats.saleCount} icon={<ShoppingCart className="w-5 h-5" />} color="info" />
      </div>

      <Card>
        <CardHeader><CardTitle>Valorisation du stock</CardTitle></CardHeader>
        <div className="p-4">
          <p className="text-3xl font-bold text-primary-600">{formatCurrency(stockValue || 0)}</p>
        </div>
      </Card>
    </div>
  )
}
