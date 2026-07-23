import { useMemo } from 'react'
import { Card, CardTitle, StatCard } from '@/components/ui'
import db from '@/db'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useSupabaseQuery } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { TrendingUp, DollarSign, Users, CreditCard, ShoppingCart, Wallet, Package, Banknote, BarChart3, PieChart } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler)

export default function Dashboard() {
  const isCloud = isSupabaseConfigured()
  const dexieProducts = useLiveQuery(() => db.products.toArray(), [])
  const dexieSales = useLiveQuery(() => db.sales.where('status').equals('completed').toArray(), [])
  const dexieCustomers = useLiveQuery(() => db.customers.toArray(), [])
  const dexieExpenses = useLiveQuery(() => db.accountingEntries.where('type').equals('expense').toArray(), [])
  const dexieCredits = useLiveQuery(() => db.credits.where('status').equals('active').or('status').equals('overdue').toArray(), [])
  const dexieStockMovements = useLiveQuery(() => db.stockMovements.toArray(), [])
  const { data: supabaseProducts } = useSupabaseQuery<any>('products', undefined, [])
  const { data: supabaseSales } = useSupabaseQuery<any>('sales', q => q.eq('status', 'completed'), [])
  const { data: supabaseCustomers } = useSupabaseQuery<any>('customers', undefined, [])
  const { data: supabaseEntries } = useSupabaseQuery<any>('accounting_entries', q => q.eq('type', 'expense'), [])
  const { data: supabaseCredits } = useSupabaseQuery<any>('credits', q => q.in('status', ['active', 'overdue']), [])
  const { data: supabaseStockMovements } = useSupabaseQuery<any>('stock_movements', undefined, [])

  const products = isCloud ? supabaseProducts : dexieProducts
  const sales = isCloud ? supabaseSales : dexieSales
  const customers = isCloud ? supabaseCustomers : dexieCustomers
  const expenses = isCloud ? supabaseEntries : dexieExpenses
  const credits = isCloud ? supabaseCredits : dexieCredits
  const stockMovements = isCloud ? supabaseStockMovements : dexieStockMovements

  const stats = useMemo(() => {
    const totalSales = sales?.reduce((s, x) => s + x.total, 0) || 0
    const totalExpenses = expenses?.reduce((s, x) => s + x.amount, 0) || 0
    const totalCredits = credits?.reduce((s, x) => s + x.balance, 0) || 0
    const todaySales = sales?.filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString()) || []
    const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0)
    const monthSales = sales?.filter(s => new Date(s.createdAt).getMonth() === new Date().getMonth()) || []
    const monthRevenue = monthSales.reduce((s, x) => s + x.total, 0)
    const lowStock = products?.filter(p => p.stockAlert && p.stockAlert > 0) || []
    const productSales = new Map<string, number>()
    sales?.forEach((s: any) => s.items.forEach((i: any) => productSales.set(i.productName, (productSales.get(i.productName) || 0) + i.quantity)))
    const topProducts = [...productSales.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    return { totalSales, totalExpenses, profit: totalSales - totalExpenses, totalCredits, todayRevenue, monthRevenue, lowStockCount: lowStock.length, customerCount: customers?.length || 0, topProducts }
  }, [sales, expenses, credits, products, customers])

  const monthlyData = useMemo(() => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    const revenue = new Array(12).fill(0)
    const expense = new Array(12).fill(0)
    sales?.forEach(s => { const m = new Date(s.createdAt).getMonth(); revenue[m] += s.total })
    expenses?.forEach(e => { const m = new Date(e.date).getMonth(); expense[m] += Math.abs(e.amount) })
    return { labels: months, revenue, expense, profit: revenue.map((r, i) => r - expense[i]) }
  }, [sales, expenses])

  const expenseByCategory = useMemo(() => {
    const cats = new Map<string, number>()
    expenses?.forEach(e => cats.set(e.accountName, (cats.get(e.accountName) || 0) + Math.abs(e.amount)))
    return [...cats.entries()].map(([name, value]) => ({ name, value }))
  }, [expenses])

  const barChartData = {
    labels: monthlyData.labels,
    datasets: [
      { label: 'Revenus', data: monthlyData.revenue, backgroundColor: '#6366f1', borderRadius: 6 },
      { label: 'Dépenses', data: monthlyData.expense, backgroundColor: '#ef4444', borderRadius: 6 },
      { label: 'Bénéfices', data: monthlyData.profit, backgroundColor: '#10b981', borderRadius: 6 },
    ],
  }

  const pieColors = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
  const pieChartData = {
    labels: expenseByCategory.map(e => e.name),
    datasets: [{ data: expenseByCategory.map(e => e.value), backgroundColor: pieColors.slice(0, expenseByCategory.length), borderWidth: 0 }],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' }, beginAtZero: true } },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Tableau de bord</h1>
        <p className="text-surface-500 text-sm mt-1">Vue d'ensemble de votre activité</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Chiffre d'affaires" value={formatCurrency(stats.totalSales)} icon={<TrendingUp className="w-5 h-5" />} color="primary" />
        <StatCard title="Bénéfices" value={formatCurrency(stats.profit)} icon={<DollarSign className="w-5 h-5" />} color="success" />
        <StatCard title="Clients" value={stats.customerCount} icon={<Users className="w-5 h-5" />} color="info" />
        <StatCard title="Créances" value={formatCurrency(stats.totalCredits)} icon={<CreditCard className="w-5 h-5" />} color="warning" />
        <StatCard title="Ventes aujourd'hui" value={formatCurrency(stats.todayRevenue)} icon={<ShoppingCart className="w-5 h-5" />} color="primary" />
        <StatCard title="Ventes du mois" value={formatCurrency(stats.monthRevenue)} icon={<BarChart3 className="w-5 h-5" />} color="info" />
        <StatCard title="Alertes stock" value={stats.lowStockCount} icon={<Package className="w-5 h-5" />} color={stats.lowStockCount > 0 ? 'warning' : 'success'} />
        <StatCard title="Trésorerie" value={formatCurrency(stats.totalSales - stats.totalExpenses)} icon={<Wallet className="w-5 h-5" />} color="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardTitle>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-500" />
              Revenus & Dépenses mensuels
            </div>
          </CardTitle>
          <div className="mt-4 h-72">
            <Bar data={barChartData} options={chartOptions} />
          </div>
        </Card>

        <Card>
          <CardTitle>
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-primary-500" />
              Répartition dépenses
            </div>
          </CardTitle>
          <div className="mt-4 h-64 flex items-center justify-center">
            {expenseByCategory.length > 0 ? (
              <Pie data={pieChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } } } }} />
            ) : (
              <p className="text-surface-400 text-sm">Aucune dépense</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardTitle>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-500" />
              Produits les plus vendus
            </div>
          </CardTitle>
          <div className="mt-4 space-y-3">
            {stats.topProducts.map(([name, qty], idx) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-lg bg-primary-100 text-primary-600 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 truncate">{name}</p>
                  <div className="w-full h-1.5 bg-surface-100 rounded-full mt-1">
                    <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min(100, (qty / Math.max(...stats.topProducts.map(([, q]) => q))) * 100)}%` }} />
                  </div>
                </div>
                <span className="text-sm font-semibold text-surface-600">{qty} vendu{qty > 1 ? 's' : ''}</span>
              </div>
            ))}
            {stats.topProducts.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucune vente</p>}
          </div>
        </Card>

        <Card>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-primary-500" />
              Ventes récentes
            </div>
          </CardTitle>
          <div className="mt-4 space-y-3">
            {sales?.slice(-5).reverse().map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-3 bg-surface-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-surface-900">{sale.invoiceNumber}</p>
                  <p className="text-xs text-surface-400">{sale.customerName || 'Client divers'}</p>
                </div>
                <p className="text-sm font-semibold text-surface-900">{formatCurrency(sale.total)}</p>
              </div>
            ))}
            {(!sales || sales.length === 0) && (
              <p className="text-sm text-surface-400 text-center py-8">Aucune vente pour le moment</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
