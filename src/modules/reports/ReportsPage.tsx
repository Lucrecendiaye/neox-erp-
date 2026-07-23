import { useState } from 'react'
import { Card, CardHeader, CardTitle, Button, Select, Badge } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportReportPDF } from '@/lib/pdf'
import { Download, FileText, FileSpreadsheet, TrendingUp, ShoppingCart, Users, Package, CreditCard } from 'lucide-react'

export default function ReportsPage() {
  const [reportType, setReportType] = useState('sales')
  const sales = useLiveQuery(() => db.sales.where('status').equals('completed').toArray(), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  const customers = useLiveQuery(() => db.customers.toArray(), [])
  const credits = useLiveQuery(() => db.credits.toArray(), [])
  const entries = useLiveQuery(() => db.accountingEntries.toArray(), [])

  const totalRevenue = sales?.reduce((s, x) => s + x.total, 0) || 0
  const totalSales = sales?.length || 0

  function exportCSV() {
    let data: string[][] = []
    let headers: string[] = []

    switch (reportType) {
      case 'sales':
        headers = ['Facture', 'Client', 'Date', 'Total', 'Méthode']
        data = sales?.map(s => [s.invoiceNumber, s.customerName || 'Divers', formatDate(s.createdAt), s.total.toString(), s.paymentMethod]) || []
        break
      case 'products':
        headers = ['Produit', 'Prix achat', 'Prix vente', 'Marge %', 'TVA %']
        data = products?.map(p => [p.name, p.purchasePrice.toString(), p.sellingPrice.toString(), p.margin.toFixed(1), p.taxRate.toString()]) || []
        break
      case 'customers':
        headers = ['Client', 'Téléphone', 'Email', 'Crédit']
        data = customers?.map(c => [c.name, c.phone, c.email || '', c.currentBalance.toString()]) || []
        break
      case 'credits':
        headers = ['Client', 'Montant', 'Solde', 'Échéance', 'Statut']
        data = credits?.map(c => [c.customerName, c.amount.toString(), c.balance.toString(), formatDate(c.dueDate), c.status]) || []
        break
    }

    const csv = [headers.join(','), ...data.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rapport_${reportType}_${Date.now()}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  function exportPDF() {
    let headers: string[] = []
    let data: string[][] = []

    switch (reportType) {
      case 'sales':
        headers = ['Facture', 'Client', 'Date', 'Total', 'Méthode']
        data = sales?.map(s => [s.invoiceNumber, s.customerName || 'Divers', formatDate(s.createdAt), formatCurrency(s.total), s.paymentMethod]) || []
        break
      case 'products':
        headers = ['Produit', 'Prix achat', 'Prix vente', 'Marge %', 'TVA %']
        data = products?.map(p => [p.name, formatCurrency(p.purchasePrice), formatCurrency(p.sellingPrice), `${p.margin.toFixed(1)}%`, `${p.taxRate}%`]) || []
        break
      case 'customers':
        headers = ['Client', 'Téléphone', 'Email', 'Crédit']
        data = customers?.map(c => [c.name, c.phone, c.email || '-', formatCurrency(c.currentBalance)]) || []
        break
      case 'credits':
        headers = ['Client', 'Montant', 'Solde', 'Échéance', 'Statut']
        data = credits?.map(c => [c.customerName, formatCurrency(c.amount), formatCurrency(c.balance), formatDate(c.dueDate), c.status]) || []
        break
    }
    exportReportPDF(
      `Rapport ${reportType === 'sales' ? 'des ventes' : reportType === 'products' ? 'des produits' : reportType === 'customers' ? 'des clients' : 'des crédits'}`,
      headers, data, `rapport_${reportType}_${Date.now()}`
    )
  }

  const reportConfig = [
    { id: 'sales', label: 'Ventes', icon: <TrendingUp className="w-4 h-4" />, color: 'primary' },
    { id: 'products', label: 'Produits', icon: <Package className="w-4 h-4" />, color: 'info' },
    { id: 'customers', label: 'Clients', icon: <Users className="w-4 h-4" />, color: 'success' },
    { id: 'credits', label: 'Crédit', icon: <CreditCard className="w-4 h-4" />, color: 'warning' },
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Rapports</h1>
        <p className="text-surface-500 text-sm mt-1">Analysez et exportez vos données</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {reportConfig.map(r => (
          <button
            key={r.id}
            onClick={() => setReportType(r.id)}
            className={`p-4 rounded-2xl border text-left transition-all ${
              reportType === r.id
                ? 'border-primary-300 bg-primary-50 shadow-sm'
                : 'border-surface-200 bg-white hover:border-surface-300'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${
              reportType === r.id ? 'bg-primary-600 text-white' : 'bg-surface-100 text-surface-500'
            }`}>
              {r.icon}
            </div>
            <p className="text-sm font-medium text-surface-900">{r.label}</p>
            <p className="text-xs text-surface-400 mt-0.5">{r.id === 'sales' ? `${totalSales} ventes` : r.id === 'products' ? `${products?.length || 0} produits` : r.id === 'customers' ? `${customers?.length || 0} clients` : `${credits?.length || 0} crédits`}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {reportType === 'sales' ? 'Rapport des ventes' : reportType === 'products' ? 'Rapport des produits' : reportType === 'customers' ? 'Rapport des clients' : 'Rapport des crédits'}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <FileText className="w-4 h-4" /> PDF
            </Button>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                {reportType === 'sales' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Facture</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Client</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Total</th><th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Méthode</th></>}
                {reportType === 'products' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Produit</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Prix achat</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Prix vente</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Marge</th></>}
                {reportType === 'customers' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Client</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Téléphone</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Email</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Solde</th></>}
                {reportType === 'credits' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Client</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Montant</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Solde</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Échéance</th><th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Statut</th></>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {reportType === 'sales' && sales?.slice(0, 50).map(s => (
                <tr key={s.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3 text-sm font-medium">{s.invoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-surface-600">{s.customerName || 'Divers'}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{formatDate(s.createdAt)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(s.total)}</td>
                  <td className="px-4 py-3 text-center"><Badge variant="info">{s.paymentMethod}</Badge></td>
                </tr>
              ))}
              {reportType === 'products' && products?.map(p => (
                <tr key={p.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3 text-sm font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-right text-sm">{formatCurrency(p.purchasePrice)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium">{formatCurrency(p.sellingPrice)}</td>
                  <td className="px-4 py-3 text-right"><Badge variant={p.margin >= 20 ? 'success' : 'warning'}>{p.margin.toFixed(1)}%</Badge></td>
                </tr>
              ))}
              {reportType === 'customers' && customers?.map(c => (
                <tr key={c.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-surface-600">{c.phone}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{c.email || '—'}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(c.currentBalance)}</td>
                </tr>
              ))}
              {reportType === 'credits' && credits?.map(c => (
                <tr key={c.id} className="hover:bg-surface-50">
                  <td className="px-4 py-3 text-sm font-medium">{c.customerName}</td>
                  <td className="px-4 py-3 text-right text-sm">{formatCurrency(c.amount)}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(c.balance)}</td>
                  <td className="px-4 py-3 text-sm text-surface-500">{formatDate(c.dueDate)}</td>
                  <td className="px-4 py-3 text-center"><Badge variant={c.status === 'paid' ? 'success' : c.status === 'overdue' ? 'danger' : 'warning'}>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
