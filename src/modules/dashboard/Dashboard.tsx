import { useMemo, useState } from 'react'
import { Card, CardTitle, StatCard, Badge, Button } from '@/components/ui'
import db from '@/db'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Bar, Pie, Line, Doughnut } from 'react-chartjs-2'
import { TrendingUp, DollarSign, Users, CreditCard, ShoppingCart, Wallet, Package, Banknote, BarChart3, PieChart, Truck, Building2, AlertTriangle, ArrowUpRight, ArrowDownRight, Receipt, Clock, Activity, Target, Layers, ChevronRight, Filter } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler)

export default function Dashboard() {
  const navigate = useNavigate()
  const businessId = useBusinessId()
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month')
  const [locationFilter, setLocationFilter] = useState<'all' | 'shop' | 'warehouse'>('all')

  const allSales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).filter(s => s.status === 'completed').toArray(), [businessId])
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId])
  const credits = useLiveQuery(() => db.credits.where('businessId').equals(businessId).filter(c => c.status === 'active' || c.status === 'overdue').toArray(), [businessId])
  const creditPayments = useLiveQuery(() => db.creditPayments.where('businessId').equals(businessId).toArray(), [businessId])
  const stocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])
  const supplierInvoices = useLiveQuery(() => db.supplierInvoices.where('businessId').equals(businessId).toArray(), [businessId])
  const cashBook = useLiveQuery(() => db.cashBook.where('businessId').equals(businessId).toArray(), [businessId])
  const allPurchases = useLiveQuery(() => db.purchases.where('businessId').equals(businessId).toArray(), [businessId])
  const categories = useLiveQuery(() => db.categories?.where('businessId').equals(businessId).toArray() || [], [businessId])

  const locationIds = useMemo(() => {
    if (locationFilter === 'all') return null
    const ids = locations?.filter(l => l.type === locationFilter).map(l => l.id) || []
    return ids.length > 0 ? ids : null
  }, [locationFilter, locations])

  const sales = useMemo(() => {
    if (!locationIds) return allSales
    return allSales?.filter(s => locationIds.includes(s.locationId)) || []
  }, [allSales, locationIds])

  const purchases = useMemo(() => {
    if (!locationIds) return allPurchases
    return allPurchases?.filter(p => locationIds.includes(p.locationId)) || []
  }, [allPurchases, locationIds])

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
    sales?.filter(s => new Date(s.createdAt) >= periodFilter) || [],
    [sales, periodFilter]
  )

  const stats = useMemo(() => {
    const cashSalesPaid = periodSales.filter(s => s.paymentMethod !== 'credit').reduce((s, x) => s + x.paid, 0)
    const creditCollected = creditPayments?.filter(p => new Date(p.date) >= periodFilter).reduce((s, x) => s + x.amount, 0) || 0
    const totalSales = cashSalesPaid + creditCollected
    const totalCost = purchases?.filter(p => new Date(p.createdAt) >= periodFilter).reduce((s, x) => s + x.total, 0) || 0
    const totalCredits = credits?.reduce((s, x) => s + x.balance, 0) || 0
    const totalSalesCount = periodSales.length
    const orderCount = sales?.filter(s => s.items?.length > 0 && new Date(s.createdAt) >= periodFilter).length || 0
    const customerCount = customers?.length || 0
    const profit = totalSales - totalCost
    const prevPeriodStart = new Date(periodFilter)
    prevPeriodStart.setMonth(prevPeriodStart.getMonth() - 1)
    const prevCashSales = sales?.filter(s => new Date(s.createdAt) >= prevPeriodStart && new Date(s.createdAt) < periodFilter && s.paymentMethod !== 'credit') || []
    const prevCreditCollected = creditPayments?.filter(p => new Date(p.date) >= prevPeriodStart && new Date(p.date) < periodFilter).reduce((s, x) => s + x.amount, 0) || 0
    const prevRevenue = prevCashSales.reduce((s, x) => s + x.paid, 0) + prevCreditCollected
    const revenueChange = prevRevenue > 0 ? ((totalSales - prevRevenue) / prevRevenue) * 100 : 0

    const cashInflows = cashBook?.filter(e => e.type === 'in').reduce((s, x) => s + x.amount, 0) || 0
    const cashOutflows = cashBook?.filter(e => e.type === 'out').reduce((s, x) => s + x.amount, 0) || 0
    const totalExpenses = cashOutflows + totalCost
    const lowStockItems = stocks?.filter(s => s.quantity <= s.stockAlert) || []

    const salesByCategory = new Map<string, { revenue: number; count: number }>()
    periodSales.forEach(s => (s.items || []).forEach((i: any) => {
      const p = products?.find(pr => pr.id === i.productId)
      const catName = categories?.find(c => c.id === p?.categoryId)?.name || 'Non catégorisé'
      const existing = salesByCategory.get(catName) || { revenue: 0, count: 0 }
      existing.revenue += i.total || i.price * i.quantity || 0
      existing.count += i.quantity || 0
      salesByCategory.set(catName, existing)
    }))

    const productSales = new Map<string, { qty: number; revenue: number }>()
    periodSales.forEach(s => (s.items || []).forEach((i: any) => {
      const name = i.productName || 'Inconnu'
      const existing = productSales.get(name) || { qty: 0, revenue: 0 }
      existing.qty += i.quantity || 0
      existing.revenue += i.total || i.price * i.quantity || 0
      productSales.set(name, existing)
    }))
    const topProducts = [...productSales.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10)
    const topByQty = [...productSales.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 5)

    const expenseCategories = new Map<string, number>()
    cashBook?.filter(e => e.type === 'out').forEach(e => {
      const cat = e.category || 'Divers'
      expenseCategories.set(cat, (expenseCategories.get(cat) || 0) + e.amount)
    })

    return {
      totalSales, totalCost, profit, totalCredits,
      totalSalesCount, orderCount, customerCount,
      revenueChange, cashInflows, cashOutflows,
      cashBalance: cashInflows - cashOutflows,
      totalExpenses, profitMargin: totalSales > 0 ? (profit / totalSales) * 100 : 0,
      lowStockCount: lowStockItems.length,
      salesByCategory: [...salesByCategory.entries()].map(([name, data]) => ({ name, ...data })),
      topProducts, topByQty,
      expenseCategories: [...expenseCategories.entries()].map(([name, amount]) => ({ name, amount })),
      avgTicket: totalSalesCount > 0 ? totalSales / totalSalesCount : 0,
    }
  }, [periodSales, sales, purchases, credits, customers, stocks, products, supplierInvoices, cashBook, locations, periodFilter, creditPayments])

  const monthlyData = useMemo(() => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    const revenue = new Array(12).fill(0)
    const expense = new Array(12).fill(0)
    const profit = new Array(12).fill(0)
    sales?.forEach(s => { if (s.paymentMethod !== 'credit') { const m = new Date(s.createdAt).getMonth(); revenue[m] += s.paid } })
    creditPayments?.forEach(p => { const m = new Date(p.date).getMonth(); revenue[m] += p.amount })
    cashBook?.filter(e => e.type === 'out').forEach(e => { const m = new Date(e.date).getMonth(); expense[m] += e.amount })
    purchases?.forEach(p => { const m = new Date(p.createdAt).getMonth(); expense[m] += p.total })
    revenue.forEach((r, i) => { profit[i] = r - expense[i] })
    return { labels: months, revenue, expense, profit }
  }, [sales, cashBook, purchases, creditPayments])

  const dailyData = useMemo(() => {
    const days: string[] = []
    const revenue: number[] = []
    const expenses: number[] = []
    const profits: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000)
      days.push(d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }))
      const daySales = sales?.filter(s => new Date(s.createdAt).toDateString() === d.toDateString() && s.paymentMethod !== 'credit') || []
      const dayCredit = creditPayments?.filter(p => new Date(p.date).toDateString() === d.toDateString()) || []
      const dayExpenses = cashBook?.filter(e => e.type === 'out' && new Date(e.date).toDateString() === d.toDateString()) || []
      const r = daySales.reduce((s, x) => s + x.paid, 0) + dayCredit.reduce((s, x) => s + x.amount, 0)
      const e = dayExpenses.reduce((s, x) => s + x.amount, 0)
      revenue.push(r)
      expenses.push(e)
      profits.push(r - e)
    }
    return { labels: days, revenue, expenses, profits }
  }, [sales, cashBook, creditPayments])

  const recentTransactions = useMemo(() => {
    const txns: { id: string; ref: string; amount: number; date: string; status: string; type: string }[] = []
    sales?.slice(-10).reverse().forEach(s => {
      txns.push({ id: s.id, ref: s.invoiceNumber || s.id, amount: s.paid, date: s.createdAt, status: 'complété', type: 'Vente' })
    })
    creditPayments?.forEach(p => {
      txns.push({ id: p.id, ref: `Crédit ${p.customerId?.slice(0, 6) || ''}`, amount: p.amount, date: p.date, status: 'Paiement crédit', type: 'Revenu' })
    })
    cashBook?.slice(-10).reverse().forEach(e => {
      txns.push({ id: e.id, ref: e.id.slice(0, 8), amount: e.amount, date: e.date, status: e.type === 'in' ? 'Entrée' : 'Sortie', type: e.type === 'in' ? 'Revenu' : 'Dépense' })
    })
    return txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10)
  }, [sales, creditPayments, cashBook])

  const recentActivities = useMemo(() => {
    const activities: { id: string; action: string; detail: string; time: string; icon: string }[] = []
    sales?.slice(-5).reverse().forEach(s => {
      activities.push({ id: s.id, action: 'Nouvelle vente', detail: `${s.invoiceNumber} - ${formatCurrency(s.paid)}`, time: s.createdAt, icon: 'sale' })
    })
    creditPayments?.forEach(p => {
      activities.push({ id: p.id, action: 'Paiement de crédit', detail: `${formatCurrency(p.amount)} reçus`, time: p.date, icon: 'in' })
    })
    cashBook?.slice(-5).reverse().forEach(e => {
      activities.push({ id: e.id, action: e.type === 'in' ? 'Entrée de caisse' : 'Sortie de caisse', detail: formatCurrency(e.amount), time: e.date, icon: e.type === 'in' ? 'in' : 'out' })
    })
    return activities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8)
  }, [sales, creditPayments, cashBook])

  const categoryChartData = {
    labels: stats.salesByCategory.map(c => c.name),
    datasets: [{
      data: stats.salesByCategory.map(c => c.revenue),
      backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6b7280'],
      borderWidth: 0,
    }],
  }

  const evolutionChartData = {
    labels: dailyData.labels,
    datasets: [
      { label: 'Revenus', data: dailyData.revenue, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'Dépenses', data: dailyData.expenses, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'Bénéfices', data: dailyData.profits, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4, pointRadius: 3 },
    ],
  }

  const expenseChartData = {
    labels: stats.expenseCategories.map(c => c.name),
    datasets: [{
      data: stats.expenseCategories.map(c => c.amount),
      backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#6b7280'],
      borderWidth: 0,
    }],
  }

  const periodLabel = period === 'today' ? "Aujourd'hui" : period === 'week' ? 'Cette semaine' : period === 'month' ? 'Ce mois' : 'Cette année'

  const totalExpensesAmount = stats.cashOutflows + stats.totalCost

  return (
    <div className="w-full h-full flex flex-col gap-6 pb-8">
      {/* 1. En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Tableau de bord</h1>
          <p className="text-surface-500 text-sm mt-1">
            {periodLabel} — {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-surface-100 rounded-xl p-1">
            {(['today', 'week', 'month', 'year'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${period === p ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
                {p === 'today' ? 'Jour' : p === 'week' ? 'Semaine' : p === 'month' ? 'Mois' : 'Année'}
              </button>
            ))}
          </div>
          <div className="flex bg-surface-100 rounded-xl p-1">
            {(['all', 'shop', 'warehouse'] as const).map(l => (
              <button key={l} onClick={() => setLocationFilter(l)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${locationFilter === l ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
                {l === 'all' ? 'Tout' : l === 'shop' ? 'Boutique' : 'Dépôt'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => navigate('/pos')}><ShoppingCart className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/sales')}><Receipt className="w-4 h-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/reports')}><BarChart3 className="w-4 h-4" /></Button>
          </div>
        </div>
      </div>

      {/* 2. Barre des indicateurs principaux (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Chiffre d'affaires" value={formatCurrency(stats.totalSales)} icon={<TrendingUp className="w-5 h-5" />} color="primary" />
        <StatCard title="Évolution" value={`${stats.revenueChange >= 0 ? '+' : ''}${stats.revenueChange.toFixed(1)}%`} icon={stats.revenueChange >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />} color={stats.revenueChange >= 0 ? 'success' : 'danger'} />
        <StatCard title="Ventes" value={stats.totalSalesCount} icon={<ShoppingCart className="w-5 h-5" />} color="info" />
        <StatCard title="Commandes" value={stats.orderCount} icon={<Receipt className="w-5 h-5" />} color="warning" />
        <StatCard title="Clients" value={stats.customerCount} icon={<Users className="w-5 h-5" />} color="success" />
        <StatCard title="Panier moyen" value={formatCurrency(stats.avgTicket)} icon={<Target className="w-5 h-5" />} color="primary" />
      </div>

      {/* 3. Résumé financier */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-surface-200">
          <p className="text-xs text-surface-400 flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> Revenus</p>
          <p className="text-lg font-bold text-success">{formatCurrency(stats.totalSales)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-surface-200">
          <p className="text-xs text-surface-400 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Dépenses</p>
          <p className="text-lg font-bold text-danger">{formatCurrency(totalExpensesAmount)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-surface-200">
          <p className="text-xs text-surface-400 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Bénéfice</p>
          <p className="text-lg font-bold text-surface-900">{formatCurrency(stats.profit)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-surface-200">
          <p className="text-xs text-surface-400 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Solde disponible</p>
          <p className={`text-lg font-bold ${stats.cashBalance >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(stats.cashBalance)}</p>
        </div>
      </div>

      {/* 4. Graphique d'évolution */}
      <Card>
        <CardTitle>
          <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary-500" />Évolution des performances (7 jours)</div>
        </CardTitle>
        <div className="mt-4 h-72"><Line data={evolutionChartData} options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } } },
          scales: { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' }, beginAtZero: true } },
        }} /></div>
      </Card>

      {/* 5 & 6. Historique chronologique & Tableau des transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardTitle>
            <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-primary-500" />Historique chronologique</div>
          </CardTitle>
          <div className="mt-4 space-y-1 max-h-80 overflow-y-auto">
            {monthlyData.labels.map((month, i) => {
              if (monthlyData.revenue[i] === 0 && monthlyData.expense[i] === 0) return null
              return (
                <div key={month} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center text-xs font-bold text-surface-600">{month}</div>
                    <div>
                      <p className="text-sm font-medium text-surface-900">{month}</p>
                      <p className="text-xs text-surface-400">{monthlyData.revenue[i] > 0 ? `${formatCurrency(monthlyData.revenue[i])} de revenus` : `${formatCurrency(monthlyData.expense[i])} de dépenses`}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${monthlyData.profit[i] >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(monthlyData.profit[i])}</p>
                    <p className={`text-[10px] ${monthlyData.profit[i] >= 0 ? 'text-success' : 'text-danger'}`}>{monthlyData.profit[i] >= 0 ? 'Bénéfice' : 'Perte'}</p>
                  </div>
                </div>
              )
            })}
            {monthlyData.revenue.every(r => r === 0) && monthlyData.expense.every(e => e === 0) && (
              <p className="text-sm text-surface-400 text-center py-8">Aucune donnée</p>
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>
            <div className="flex items-center gap-2"><Receipt className="w-5 h-5 text-primary-500" />Transactions récentes</div>
          </CardTitle>
          <div className="mt-4">
            <div className="overflow-x-auto responsive-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-surface-400 border-b border-surface-100">
                    <th className="text-left pb-2 font-medium">Référence</th>
                    <th className="text-left pb-2 font-medium">Montant</th>
                    <th className="text-left pb-2 font-medium">Date</th>
                    <th className="text-left pb-2 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map(tx => (
                    <tr key={tx.id} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                      <td data-label="Référence" className="py-2.5 text-surface-900 font-medium">{tx.ref}</td>
                      <td data-label="Montant" className={`py-2.5 font-semibold ${tx.type === 'Vente' || tx.type === 'Revenu' ? 'text-success' : 'text-danger'}`}>
                        {tx.type === 'Vente' || tx.type === 'Revenu' ? '' : '-'}{formatCurrency(tx.amount)}
                      </td>
                      <td data-label="Date" className="py-2.5 text-surface-500">{formatDate(tx.date)}</td>
                      <td data-label="Statut" className="py-2.5">
                        <Badge variant={tx.status === 'complété' || tx.status === 'Entrée' ? 'success' : 'info'}>{tx.status}</Badge>
                      </td>
                    </tr>
                  ))}
                  {recentTransactions.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-8 text-surface-400 text-sm">Aucune transaction</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      {/* 7 & 10. Répartition des catégories & Analyse des dépenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {stats.salesByCategory.length > 0 && (
          <Card>
            <CardTitle>
              <div className="flex items-center gap-2"><Layers className="w-5 h-5 text-primary-500" />Répartition par catégorie</div>
            </CardTitle>
            <div className="mt-4">
              <div className="h-48 flex items-center justify-center">
                <Doughnut data={categoryChartData} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 10 } } } },
                  cutout: '60%',
                }} />
              </div>
              <div className="mt-4 space-y-2">
                {stats.salesByCategory.sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(cat => {
                  const total = stats.salesByCategory.reduce((s, c) => s + c.revenue, 0)
                  const pct = total > 0 ? (cat.revenue / total) * 100 : 0
                  return (
                    <div key={cat.name} className="flex items-center justify-between text-sm">
                      <span className="text-surface-600">{cat.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-surface-900 font-medium">{formatCurrency(cat.revenue)}</span>
                        <span className="text-xs text-surface-400 w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )}

        {stats.expenseCategories.length > 0 && (
          <Card>
            <CardTitle>
              <div className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary-500" />Analyse des dépenses</div>
            </CardTitle>
            <div className="mt-4">
              <div className="h-48 flex items-center justify-center">
                <Pie data={expenseChartData} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 10 } } } },
                }} />
              </div>
              <div className="mt-4 space-y-2">
                {stats.expenseCategories.sort((a, b) => b.amount - a.amount).slice(0, 5).map(cat => {
                  const total = stats.expenseCategories.reduce((s, c) => s + c.amount, 0)
                  const pct = total > 0 ? (cat.amount / total) * 100 : 0
                  return (
                    <div key={cat.name} className="flex items-center justify-between text-sm">
                      <span className="text-surface-600">{cat.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-danger font-medium">{formatCurrency(cat.amount)}</span>
                        <span className="text-xs text-surface-400 w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* 8 & 9. Produits & Meilleures performances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardTitle>
            <div className="flex items-center gap-2"><Package className="w-5 h-5 text-primary-500" />Top produits (par volume)</div>
          </CardTitle>
          <div className="mt-4 space-y-3">
            {stats.topByQty.map(([name, data], idx) => {
              const maxQty = Math.max(...stats.topByQty.map(([, d]) => d.qty))
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-lg bg-primary-100 text-primary-600 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{name}</p>
                    <div className="w-full h-1.5 bg-surface-100 rounded-full mt-1">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(data.qty / maxQty) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-surface-900">{data.qty}</p>
                    <p className="text-xs text-surface-400">{formatCurrency(data.revenue)}</p>
                  </div>
                </div>
              )
            })}
            {stats.topByQty.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucune vente</p>}
          </div>
        </Card>

        <Card>
          <CardTitle>
            <div className="flex items-center gap-2"><Target className="w-5 h-5 text-primary-500" />Meilleures performances</div>
          </CardTitle>
          <div className="mt-4 space-y-3">
            <p className="text-xs text-surface-400 font-medium uppercase tracking-wider">Top 5 revenus</p>
            {stats.topProducts.slice(0, 5).map(([name, data], idx) => {
              const maxRev = Math.max(...stats.topProducts.slice(0, 5).map(([, d]) => d.revenue))
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-600 text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{name}</p>
                    <div className="w-full h-1.5 bg-surface-100 rounded-full mt-1">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(data.revenue / maxRev) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-surface-900">{formatCurrency(data.revenue)}</span>
                </div>
              )
            })}
            {stats.topProducts.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucune donnée</p>}
            <p className="text-xs text-surface-400 font-medium uppercase tracking-wider mt-4">Marge bénéficiaire</p>
            <div className="p-4 rounded-xl bg-surface-50 text-center">
              <p className="text-2xl font-bold text-surface-900">{stats.profitMargin.toFixed(1)}%</p>
              <p className="text-xs text-surface-400 mt-1">Marge sur {periodLabel.toLowerCase()}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* 11. Activités récentes */}
      <Card>
        <CardTitle>
          <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary-500" />Activités récentes</div>
        </CardTitle>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {recentActivities.map(a => (
            <div key={a.id} className="p-3 rounded-xl bg-surface-50 border border-surface-100">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${
                  a.icon === 'sale' ? 'bg-success/10 text-success' : a.icon === 'in' ? 'bg-info/10 text-info' : 'bg-danger/10 text-danger'
                }`}>
                  {a.icon === 'sale' ? <ShoppingCart className="w-3.5 h-3.5" /> : a.icon === 'in' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                </div>
                <p className="text-xs font-medium text-surface-900">{a.action}</p>
              </div>
              <p className="text-sm font-semibold text-surface-700 ml-8">{a.detail}</p>
              <p className="text-[10px] text-surface-400 ml-8 mt-0.5">{formatDateTime(a.time)}</p>
            </div>
          ))}
          {recentActivities.length === 0 && (
            <div className="col-span-full text-center py-8 text-surface-400 text-sm">Aucune activité récente</div>
          )}
        </div>
      </Card>

      {/* 12. Informations complémentaires */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-2xl bg-white border border-surface-200">
          <p className="text-xs text-surface-400">Produits en stock</p>
          <p className="text-lg font-bold text-surface-900">{products?.length || 0}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-surface-200 cursor-pointer" onClick={() => navigate('/products')}>
          <p className="text-xs text-surface-400">Stock bas</p>
          <p className={`text-lg font-bold ${stats.lowStockCount > 0 ? 'text-danger' : 'text-surface-900'}`}>{stats.lowStockCount}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-surface-200 cursor-pointer" onClick={() => navigate('/customers')}>
          <p className="text-xs text-surface-400">Créances clients</p>
          <p className="text-lg font-bold text-warning">{formatCurrency(stats.totalCredits)}</p>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-surface-200 cursor-pointer" onClick={() => navigate('/suppliers')}>
          <p className="text-xs text-surface-400">Dû fournisseurs</p>
          <p className="text-lg font-bold text-danger">{formatCurrency(supplierInvoices?.reduce((s, x) => s + x.balance, 0) || 0)}</p>
        </div>
      </div>

      {/* Alerte stock bas */}
      {stats.lowStockCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center gap-3 cursor-pointer" onClick={() => navigate('/products')}>
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <p className="text-sm text-amber-800 font-medium">{stats.lowStockCount} produit{stats.lowStockCount > 1 ? 's' : ''} en stock bas — Cliquez pour voir</p>
        </div>
      )}
    </div>
  )
}
