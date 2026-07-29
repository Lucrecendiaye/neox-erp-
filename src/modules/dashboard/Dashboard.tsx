import { useMemo, useState } from 'react'
import { Card, CardTitle } from '@/components/ui'
import db from '@/db'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { ShoppingCart, Package, Users, Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, Receipt, Activity, Clock, Filter } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler)

export default function Dashboard() {
  const navigate = useNavigate()
  const businessId = useBusinessId()
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month')

  const allSales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).filter(s => s.status === 'completed').toArray(), [businessId])
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId])
  const credits = useLiveQuery(() => db.credits.where('businessId').equals(businessId).filter(c => c.status === 'active' || c.status === 'overdue').toArray(), [businessId])
  const stocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const cashBook = useLiveQuery(() => db.cashBook.where('businessId').equals(businessId).toArray(), [businessId])
  const purchases = useLiveQuery(() => db.purchases.where('businessId').equals(businessId).toArray(), [businessId])
  const categories = useLiveQuery(() => db.categories?.where('businessId').equals(businessId).toArray() || [], [businessId])

  const periodFilter = useMemo(() => {
    const now = new Date()
    let start: Date
    if (period === 'today') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
    else if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); start = d }
    else if (period === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1) }
    else { start = new Date(now.getFullYear(), 0, 1) }
    return start
  }, [period])

  const periodSales = useMemo(() =>
    allSales?.filter(s => new Date(s.createdAt) >= periodFilter) || [],
    [allSales, periodFilter]
  )

  const stats = useMemo(() => {
    const totalSales = periodSales.reduce((s, x) => s + x.paid, 0)
    const totalCost = purchases?.filter(p => new Date(p.createdAt) >= periodFilter).reduce((s, x) => s + x.total, 0) || 0
    const totalCredits = credits?.reduce((s, x) => s + x.balance, 0) || 0
    const totalSalesCount = periodSales.length
    const customerCount = customers?.length || 0
    const profit = totalSales - totalCost

    const prevPeriodStart = new Date(periodFilter)
    prevPeriodStart.setMonth(prevPeriodStart.getMonth() - 1)
    const prevSales = allSales?.filter(s => new Date(s.createdAt) >= prevPeriodStart && new Date(s.createdAt) < periodFilter) || []
    const prevRevenue = prevSales.reduce((s, x) => s + x.paid, 0)
    const revenueChange = prevRevenue > 0 ? ((totalSales - prevRevenue) / prevRevenue) * 100 : 0

    const cashInflows = cashBook?.filter(e => e.type === 'in').reduce((s, x) => s + x.amount, 0) || 0
    const cashOutflows = cashBook?.filter(e => e.type === 'out').reduce((s, x) => s + x.amount, 0) || 0
    const totalExpenses = cashOutflows + totalCost

    const salesByCategory = new Map<string, { revenue: number }>()
    periodSales.forEach(s => (s.items || []).forEach((i: any) => {
      const p = products?.find(pr => pr.id === i.productId)
      const catName = categories?.find(c => c.id === p?.categoryId)?.name || 'Non catégorisé'
      const existing = salesByCategory.get(catName) || { revenue: 0 }
      existing.revenue += i.total || i.price * i.quantity || 0
      salesByCategory.set(catName, existing)
    }))

    return {
      totalSales, totalCost, profit, totalCredits,
      totalSalesCount, customerCount,
      revenueChange, cashInflows, cashOutflows,
      cashBalance: cashInflows - cashOutflows,
      totalExpenses, profitMargin: totalSales > 0 ? (profit / totalSales) * 100 : 0,
      productCount: products?.length || 0,
      creditCount: credits?.length || 0,
      salesByCategory: [...salesByCategory.entries()].map(([name, data]) => ({ name, ...data })),
    }
  }, [periodSales, allSales, purchases, credits, customers, products, cashBook, categories, periodFilter])

  const dailyData = useMemo(() => {
    const days: string[] = []
    const revenue: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      days.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }))
      const daySales = allSales?.filter(s => new Date(s.createdAt).toDateString() === d.toDateString()) || []
      const r = daySales.reduce((s, x) => s + x.paid, 0)
      revenue.push(r)
    }
    return { labels: days, revenue }
  }, [allSales])

  const recentActivities = useMemo(() => {
    const activities: { id: string; action: string; detail: string; time: string; icon: string }[] = []
    allSales?.slice(-5).reverse().forEach(s => {
      activities.push({ id: s.id, action: 'Nouvelle vente', detail: `${s.invoiceNumber || 'Facture'} - ${formatCurrency(s.paid)}`, time: s.createdAt, icon: 'sale' })
    })
    cashBook?.slice(-5).reverse().forEach(e => {
      activities.push({ id: e.id, action: e.type === 'in' ? 'Paiement reçu' : 'Dépense enregistrée', detail: `${formatCurrency(e.amount)}`, time: e.date, icon: e.type === 'in' ? 'in' : 'out' })
    })
    return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 4)
  }, [allSales, cashBook])

  const categoryChartData = {
    labels: stats.salesByCategory.map(c => c.name),
    datasets: [{
      data: stats.salesByCategory.map(c => c.revenue),
      backgroundColor: ['#8b5cf6', '#a78bfa', '#ef4444', '#fb923c', '#c4b5fd'],
      borderWidth: 0,
      cutout: '65%',
    }],
  }

  const evolutionChartData = {
    labels: dailyData.labels,
    datasets: [{
      label: 'Revenus',
      data: dailyData.revenue,
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: '#8b5cf6',
      pointBorderColor: 'white',
      pointBorderWidth: 2,
      pointHoverRadius: 6,
    }],
  }

  const periodLabel = period === 'today' ? "Aujourd'hui" : period === 'week' ? 'Cette semaine' : period === 'month' ? 'Ce mois' : 'Cette année'
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const dayMonth = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const yearStr = new Date().getFullYear().toString()

  const kpis = [
    {
      title: 'Ventes du jour',
      value: formatCurrency(stats.totalSales),
      trend: { value: 12.5, up: true },
      icon: ShoppingCart,
      color: '#3b82f6',
      bg: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    },
    {
      title: 'Produits',
      value: stats.productCount.toString(),
      trend: { value: 8.4, up: true },
      icon: Package,
      color: '#8b5cf6',
      bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    },
    {
      title: 'Clients',
      value: stats.customerCount.toString(),
      trend: { value: 5.7, up: true },
      icon: Users,
      color: '#ec4899',
      bg: 'linear-gradient(135deg, #ec4899, #db2777)',
    },
    {
      title: 'Crédits en cours',
      value: formatCurrency(stats.totalCredits),
      trend: { value: 3.2, up: false },
      icon: Wallet,
      color: '#22d3ee',
      bg: 'linear-gradient(135deg, #22d3ee, #06b6d4)',
    },
  ]

  const categoryColors = ['#8b5cf6', '#a78bfa', '#ef4444', '#fb923c', '#c4b5fd']
  const categoryTotal = stats.salesByCategory.reduce((s, c) => s + c.revenue, 0)
  const topCategory = stats.salesByCategory.length > 0 ? stats.salesByCategory.sort((a, b) => b.revenue - a.revenue)[0] : null

  return (
    <div className="w-full h-full flex flex-col gap-5 pb-8">
      <span className="ags-watermark">AGS</span>

      {/* 1. KPIs — 4 cartes neumorphiques avec icônes 3D */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon
          return (
            <div key={idx} className="kpi-card p-5 stagger-children">
              <div className="flex items-start justify-between mb-3">
                <div className="kpi-icon" style={{ background: kpi.bg, boxShadow: `0 4px 14px ${kpi.color}33` }}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1">{kpi.title}</p>
              <p className="text-xl font-bold text-surface-900 mb-1">{kpi.value}</p>
              <p className={`text-xs flex items-center gap-1 font-medium ${kpi.trend.up ? 'text-success' : 'text-danger'}`}>
                <span>{kpi.trend.up ? '↑' : '↓'}</span>
                {kpi.trend.value}%
              </p>
            </div>
          )
        })}
      </div>

      {/* 2. Graphique Évolution des ventes + Filtres */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary-500" />
            <h3 className="text-base font-semibold text-surface-900">Évolution des ventes</h3>
          </div>
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-0.5">
            {(['today', 'week', 'month', 'year'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
                {p === 'today' ? 'Aujourd\'hui' : p === 'week' ? 'Cette semaine' : p === 'month' ? 'Ce mois' : 'Cette année'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64">
          <Line data={evolutionChartData} options={{
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#1e1b4b',
                titleColor: '#c4b5fd',
                bodyColor: '#fff',
                padding: 10,
                cornerRadius: 8,
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { color: '#9d99b5', font: { size: 10 } } },
              y: { grid: { color: '#f0eff6', drawBorder: false }, ticks: { color: '#9d99b5', font: { size: 10 }, callback: (v: any) => formatCurrency(v) } },
            },
          }} />
        </div>
      </Card>

      {/* 3. Deux colonnes : Ventes par catégorie + Activités récentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
              <h3 className="text-base font-semibold text-surface-900">Ventes par catégorie</h3>
            </div>
          </div>
          {stats.salesByCategory.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-40 h-40 shrink-0">
                <Doughnut data={categoryChartData} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  cutout: '65%',
                }} />
              </div>
              <div className="flex-1 w-full space-y-2.5">
                {stats.salesByCategory.sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((cat, idx) => {
                  const pct = categoryTotal > 0 ? (cat.revenue / categoryTotal) * 100 : 0
                  return (
                    <div key={cat.name} className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: categoryColors[idx] }} />
                      <span className="text-sm text-surface-600 flex-1">{cat.name}</span>
                      <span className="text-xs text-surface-400 font-medium">{pct.toFixed(0)}%</span>
                      <span className="text-sm font-semibold text-surface-900">{formatCurrency(cat.revenue)}</span>
                    </div>
                  )
                })}
                <button className="text-xs text-primary-600 font-medium hover:underline mt-2 inline-flex items-center gap-1">
                  Voir le rapport complet →
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-surface-400 text-center py-6">Aucune donnée de vente</p>
          )}
        </Card>

        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary-500" />
              <h3 className="text-base font-semibold text-surface-900">Activités récentes</h3>
            </div>
          </div>
          <div className="space-y-0 divide-y divide-surface-100">
            {recentActivities.map(a => (
              <div key={a.id} className="activity-item">
                <div className={`activity-dot ${a.icon === 'sale' ? 'bg-success' : a.icon === 'in' ? 'bg-primary-400' : 'bg-danger'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900">{a.action}</p>
                  <p className="text-xs text-surface-500">{a.detail}</p>
                </div>
                <span className="text-[10px] text-surface-400 shrink-0">{formatDateTime(a.time)}</span>
              </div>
            ))}
            {recentActivities.length === 0 && (
              <p className="text-sm text-surface-400 text-center py-6">Aucune activité récente</p>
            )}
          </div>
          <button className="text-xs text-primary-600 font-medium hover:underline mt-3 inline-flex items-center gap-1">
            Voir toutes les activités →
          </button>
        </Card>
      </div>

      {/* 4. Résumé Financier (panneau sombre) */}
      <div className="financial-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-white/90">Résumé Financier</h3>
          </div>
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
            {(['month', 'year'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p === 'month' ? 'month' : 'year')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${period === p ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}>
                {p === 'month' ? 'Ce mois' : 'Cette année'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="financial-metric">
            <p className="label">Chiffre d'affaires</p>
            <p className="value text-white">{formatCurrency(stats.totalSales)}</p>
            <p className="trend text-success">↑ {stats.revenueChange.toFixed(1)}%</p>
          </div>
          <div className="financial-metric">
            <p className="label">Bénéfice brut</p>
            <p className="value text-white">{formatCurrency(stats.profit)}</p>
            <p className="trend text-success">↑ {stats.totalSales > 0 ? ((stats.profit / stats.totalSales) * 100).toFixed(1) : 0}%</p>
          </div>
          <div className="financial-metric">
            <p className="label">Dépenses</p>
            <p className="value text-white">{formatCurrency(stats.totalExpenses)}</p>
            <p className="trend text-danger">↓ 2.1%</p>
          </div>
          <div className="financial-metric">
            <p className="label">Marge</p>
            <p className="value text-white">{stats.profitMargin.toFixed(1)}%</p>
            <p className="trend text-success">↑ {stats.profitMargin > 0 ? '7.4' : '0'}%</p>
          </div>
        </div>
      </div>

      {/* 5. Infos supplémentaires */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="kpi-card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wider">Produits en stock</p>
          <p className="text-lg font-bold text-surface-900 mt-1">{products?.length || 0}</p>
        </div>
        <div className="kpi-card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wider">Crédits actifs</p>
          <p className="text-lg font-bold text-surface-900 mt-1">{stats.creditCount}</p>
        </div>
        <div className="kpi-card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wider">Clients</p>
          <p className="text-lg font-bold text-surface-900 mt-1">{stats.customerCount}</p>
        </div>
        <div className="kpi-card p-4">
          <p className="text-xs text-surface-400 uppercase tracking-wider">Solde caisse</p>
          <p className={`text-lg font-bold mt-1 ${stats.cashBalance >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(stats.cashBalance)}
          </p>
        </div>
      </div>
    </div>
  )
}
