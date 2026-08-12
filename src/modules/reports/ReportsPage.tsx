import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportReportPDF } from '@/lib/pdf'
import SupplierFicheComptable from '@/components/suppliers/SupplierFicheComptable'
import { FileText, FileSpreadsheet, TrendingUp, ShoppingCart, Package, Truck, DollarSign, ArrowRightLeft } from 'lucide-react'

type ReportId = 'sales' | 'purchases' | 'inventory' | 'supplier_invoices' | 'cashflow' | 'compensations'

export default function ReportsPage() {
  const businessId = useBusinessId()
  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const [reportType, setReportType] = useState<ReportId>('sales')
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo)
  const [dateTo, setDateTo] = useState(today)
  const [locationFilter, setLocationFilter] = useState('all')

  const sales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).filter(s => s.status === 'completed').toArray(), [businessId])
  const purchases = useLiveQuery(() => db.purchases.where('businessId').equals(businessId).toArray(), [businessId])
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId])
  const cashBook = useLiveQuery(() => db.cashBook.where('businessId').equals(businessId).toArray(), [businessId])
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])
  const supplierInvoices = useLiveQuery(() => db.supplierInvoices.where('businessId').equals(businessId).toArray(), [businessId])
  const compensations = useLiveQuery(() => db.compensations?.where('businessId').equals(businessId).toArray() || [], [businessId])
  const stocks = useLiveQuery(() => db.productStocks.toArray(), [])
  const suppliers = useLiveQuery(() => db.suppliers.where('businessId').equals(businessId).toArray(), [businessId])
  const users = useLiveQuery(() => db.users.where('businessId').equals(businessId).toArray(), [businessId])

  const filteredSales = useMemo(() => {
    if (!sales) return []
    return sales.filter(s => {
      const d = s.createdAt?.split('T')[0] || ''
      if (d < dateFrom || d > dateTo) return false
      if (locationFilter !== 'all' && s.locationId !== locationFilter) return false
      return true
    })
  }, [sales, dateFrom, dateTo, locationFilter])

  const filteredPurchases = useMemo(() => {
    if (!purchases) return []
    return purchases.filter(p => {
      const d = p.createdAt?.split('T')[0] || ''
      if (d < dateFrom || d > dateTo) return false
      if (locationFilter !== 'all' && p.locationId !== locationFilter) return false
      return true
    })
  }, [purchases, dateFrom, dateTo, locationFilter])

  const filteredSupplierData = useMemo(() => {
    const rows: { id: string; date: string; type: 'Achat' | 'Facture' | 'Vente'; ref: string; supplierId?: string; supplierName?: string; total: number; paid: number; balance: number; status: string; locationId?: string }[] = []
    ;(supplierInvoices || []).forEach(inv => {
      const d = inv.createdAt?.split('T')[0] || ''
      if (d < dateFrom || d > dateTo) return
      rows.push({ id: inv.id, date: inv.createdAt, type: 'Facture', ref: inv.number, supplierId: inv.supplierId, total: inv.total, paid: inv.paid, balance: inv.balance, status: inv.status })
    })
    ;(purchases || []).forEach(p => {
      const d = p.createdAt?.split('T')[0] || ''
      if (d < dateFrom || d > dateTo) return
      if (locationFilter !== 'all' && p.locationId !== locationFilter) return
      if (p.status === 'cancelled' || p.status === 'returned') return
      const paid = p.paid || 0
      rows.push({ id: p.id, date: p.createdAt, type: 'Achat', ref: p.id, supplierId: p.supplierId, supplierName: p.supplierName, total: p.total, paid, balance: p.total - paid, status: p.status, locationId: p.locationId })
    })
    ;(sales || []).forEach(s => {
      if (!s.supplierId) return
      const d = s.createdAt?.split('T')[0] || ''
      if (d < dateFrom || d > dateTo) return
      if (locationFilter !== 'all' && s.locationId !== locationFilter) return
      rows.push({ id: s.id, date: s.createdAt, type: 'Vente', ref: s.invoiceNumber || s.id, supplierId: s.supplierId, supplierName: s.supplierName, total: s.total, paid: s.paid, balance: Math.max(0, s.total - (s.paid || 0)), status: s.status, locationId: s.locationId })
    })
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    return rows
  }, [supplierInvoices, purchases, dateFrom, dateTo, locationFilter])

  const filteredCashflow = useMemo(() => {
    if (!cashBook) return []
    return cashBook.filter(e => {
      const d = e.date?.split('T')[0] || e.date || ''
      if (d < dateFrom || d > dateTo) return false
      return true
    })
  }, [cashBook, dateFrom, dateTo])

  const salesStats = useMemo(() => {
    const total = filteredSales.reduce((s, x) => s + x.total, 0)
    const count = filteredSales.length
    const avg = count > 0 ? total / count : 0
    return { total, count, avg }
  }, [filteredSales])

  const purchaseStats = useMemo(() => {
    const total = filteredPurchases.reduce((s, x) => s + x.total, 0)
    const count = filteredPurchases.length
    return { total, count }
  }, [filteredPurchases])

  const cashflowStats = useMemo(() => {
    const inflows = filteredCashflow.filter(e => e.type === 'in').reduce((s, x) => s + x.amount, 0)
    const outflows = filteredCashflow.filter(e => e.type === 'out').reduce((s, x) => s + x.amount, 0)
    return { inflows, outflows, net: inflows - outflows }
  }, [filteredCashflow])

  const inventoryStats = useMemo(() => {
    if (!stocks) return { totalValue: 0, totalQty: 0, lowStock: 0, locationCount: 0 }
    const totalValue = stocks.reduce((s, x) => {
      const p = products?.find(pr => pr.id === x.productId)
      return s + x.quantity * (p?.purchasePrice || 0)
    }, 0)
    const totalQty = stocks.reduce((s, x) => s + x.quantity, 0)
    const lowStock = stocks.filter(s => s.quantity <= s.stockAlert).length
    return { totalValue, totalQty, lowStock, locationCount: new Set(stocks.map(s => s.locationId)).size }
  }, [stocks, products])

  const supplierInvStats = useMemo(() => {
    const totalInvoiced = filteredSupplierData.reduce((s, x) => s + x.total, 0)
    const totalPaid = filteredSupplierData.reduce((s, x) => s + x.paid, 0)
    const totalDue = filteredSupplierData.reduce((s, x) => s + x.balance, 0)
    return { totalInvoiced, totalPaid, totalDue, count: filteredSupplierData.length }
  }, [filteredSupplierData])

  const supplierFiche = useMemo(() => {
    const entries: { date: string; label: string; reference: string; debit: number; credit: number }[] = []
    filteredSupplierData.forEach(r => {
      const sup = suppliers?.find(s => s.id === r.supplierId)
      const name = sup?.name || r.supplierName || r.supplierId
      if (r.type === 'Vente') {
        entries.push({ date: r.date, label: `Vente fournisseur — ${name}`, reference: r.ref, debit: r.total, credit: 0 })
        const paid = r.status === 'paid' ? r.total : (r.paid || 0)
        if (paid > 0) entries.push({ date: r.date, label: `Paiement vente — ${name}`, reference: r.ref, debit: 0, credit: paid })
        return
      }
      entries.push({ date: r.date, label: `${r.type} — ${name}`, reference: r.ref, debit: 0, credit: r.total })
      const paid = r.status === 'paid' ? r.total : r.paid
      if (paid > 0) entries.push({ date: r.date, label: `Paiement — ${name}`, reference: r.ref, debit: paid, credit: 0 })
    })
    entries.sort((a, b) => a.date.localeCompare(b.date))
    let running = 0
    const rows = entries.map(e => {
      running += e.credit - e.debit
      return { ...e, balance: running }
    })
    const totals = {
      debit: rows.reduce((s, r) => s + r.debit, 0),
      credit: rows.reduce((s, r) => s + r.credit, 0),
      balance: running,
    }
    return { rows, totals }
  }, [filteredSupplierData, suppliers])

  const filteredCompensations = useMemo(() => {
    if (!compensations) return []
    return compensations.filter(c => {
      const d = c.createdAt?.split('T')[0] || ''
      if (d < dateFrom || d > dateTo) return false
      return true
    })
  }, [compensations, dateFrom, dateTo])

  const compensationStats = useMemo(() => {
    const total = filteredCompensations.reduce((s, x) => s + x.settledAmount, 0)
    return { total, count: filteredCompensations.length }
  }, [filteredCompensations])

  const mobileAnalytics = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      return d.toISOString().split('T')[0]
    })
    const daily = days.map(day => ({
      day,
      label: new Date(day).toLocaleDateString('fr-FR', { weekday: 'short' }),
      amount: filteredSales.filter(s => (s.createdAt?.split('T')[0] || '') === day).reduce((sum, s) => sum + s.total, 0),
    }))

    const productMap = new Map<string, number>()
    filteredSales.forEach(s => s.items.forEach(it => {
      productMap.set(it.productName, (productMap.get(it.productName) || 0) + it.total)
    }))
    const bestProducts = [...productMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)

    const sellerMap = new Map<string, { name: string; total: number }>()
    filteredSales.forEach(s => {
      const u = users?.find(x => x.id === s.userId)
      const name = u?.name || 'Inconnu'
      const cur = sellerMap.get(s.userId) || { name, total: 0 }
      cur.total += s.total
      sellerMap.set(s.userId, cur)
    })
    const bestSellers = [...sellerMap.values()].sort((a, b) => b.total - a.total).slice(0, 5)

    const cost = filteredSales.reduce((sum, s) => sum + s.items.reduce((c, it) => {
      const p = products?.find(pr => pr.id === it.productId)
      return c + it.quantity * (p?.purchasePrice || 0)
    }, 0), 0)
    const revenue = filteredSales.reduce((sum, s) => sum + s.total, 0)

    const maxDaily = Math.max(...daily.map(d => d.amount), 1)
    const maxProduct = Math.max(...bestProducts.map(([, v]) => v), 1)
    const maxSeller = Math.max(...bestSellers.map(s => s.total), 1)

    return { daily, bestProducts, bestSellers, profit: revenue - cost, maxDaily, maxProduct, maxSeller }
  }, [filteredSales, products, users])

  function exportCSV() {
    let headers: string[] = []
    let data: string[][] = []

    switch (reportType) {
      case 'sales':
        headers = ['Facture', 'Client', 'Date', 'Total', 'Méthode', 'Emplacement']
        data = filteredSales.map(s => [s.invoiceNumber, s.customerName || 'Divers', formatDate(s.createdAt), s.total.toString(), s.paymentMethod, s.locationId || ''])
        break
      case 'purchases':
        headers = ['ID', 'Fournisseur', 'Date', 'Total', 'Emplacement']
        data = filteredPurchases.map(p => [String(p.id), p.supplierId || '', formatDate(p.createdAt) || '', String(p.total), p.locationId || ''])
        break
      case 'inventory':
        headers = ['Produit', 'Emplacement', 'Qté', 'Valeur']
        data = (stocks || []).map(s => {
          const p = products?.find(pr => pr.id === s.productId)
          const loc = locations?.find(l => l.id === s.locationId)
          const val = s.quantity * (p?.purchasePrice || 0)
          return [p?.name || s.productId, loc?.name || s.locationId, String(s.quantity), String(val)]
        })
        break
      case 'supplier_invoices':
        headers = ['Type', 'Référence', 'Fournisseur', 'Date', 'Total', 'Payé', 'Solde', 'Statut']
        data = filteredSupplierData.map(r => {
          const sup = suppliers?.find(s => s.id === r.supplierId)
          return [r.type, r.ref, sup?.name || r.supplierName || r.supplierId || '', formatDate(r.date), r.total.toString(), r.paid.toString(), r.balance.toString(), r.status]
        })
        break
      case 'cashflow':
        headers = ['Date', 'Type', 'Catégorie', 'Montant', 'Description']
        data = filteredCashflow.map(e => [e.date || '', e.type || '', e.category || '', String(e.amount), e.description || ''])
        break
      case 'compensations':
        headers = ['Direction', 'Partie', 'Montant', 'Réglé', 'Statut', 'Date']
        data = filteredCompensations.map(c => {
          const partyName = c.partyType === 'supplier' ? suppliers?.find(s => s.id === c.partyId)?.name : customers?.find(cu => cu.id === c.partyId)?.name
          return [c.direction === 'debt_to_goods' ? 'Dette → Marchandises' : 'Marchandises → Dette', partyName || c.partyId, c.amount.toString(), c.settledAmount.toString(), c.status, c.createdAt]
        })
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
        data = filteredSales.map(s => [s.invoiceNumber, s.customerName || 'Divers', formatDate(s.createdAt), formatCurrency(s.total), s.paymentMethod])
        break
      case 'purchases':
        headers = ['ID', 'Fournisseur', 'Date', 'Total']
        data = filteredPurchases.map(p => [String(p.id), p.supplierId || '', formatDate(p.createdAt) || '', formatCurrency(p.total)])
        break
      case 'inventory':
        headers = ['Produit', 'Emplacement', 'Qté', 'Valeur']
        data = (stocks || []).map(s => {
          const p = products?.find(pr => pr.id === s.productId)
          const loc = locations?.find(l => l.id === s.locationId)
          const val = s.quantity * (p?.purchasePrice || 0)
          return [p?.name || s.productId, loc?.name || s.locationId, String(s.quantity), formatCurrency(val)]
        })
        break
      case 'supplier_invoices':
        headers = ['Type', 'Référence', 'Fournisseur', 'Date', 'Total', 'Payé', 'Solde']
        data = filteredSupplierData.map(r => {
          const sup = suppliers?.find(s => s.id === r.supplierId)
          return [r.type, r.ref, sup?.name || r.supplierName || r.supplierId || '', formatDate(r.date), formatCurrency(r.total), formatCurrency(r.paid), formatCurrency(r.balance)]
        })
        break
      case 'cashflow':
        headers = ['Date', 'Type', 'Catégorie', 'Montant', 'Description']
        data = filteredCashflow.map(e => [e.date || '', e.type === 'in' ? 'Entrée' : 'Sortie', e.category || '', formatCurrency(e.amount), e.description || ''])
        break
      case 'compensations':
        headers = ['Direction', 'Partie', 'Montant', 'Réglé', 'Statut', 'Date']
        data = filteredCompensations.map(c => {
          const partyName = c.partyType === 'supplier' ? suppliers?.find(s => s.id === c.partyId)?.name : customers?.find(cu => cu.id === c.partyId)?.name
          return [c.direction === 'debt_to_goods' ? 'Dette → Marchandises' : 'Marchandises → Dette', partyName || c.partyId, formatCurrency(c.amount), formatCurrency(c.settledAmount), c.status, formatDate(c.createdAt)]
        })
        break
    }
    exportReportPDF(
      `Rapport ${reportType}`,
      headers, data, `rapport_${reportType}_${Date.now()}`
    )
  }

  const reportConfig = [
    { id: 'sales' as const, label: 'Ventes', icon: <TrendingUp className="w-4 h-4" />, color: 'primary' },
    { id: 'purchases' as const, label: 'Achats', icon: <ShoppingCart className="w-4 h-4" />, color: 'info' },
    { id: 'inventory' as const, label: 'Stock', icon: <Package className="w-4 h-4" />, color: 'success' },
    { id: 'supplier_invoices' as const, label: 'Fournisseurs', icon: <Truck className="w-4 h-4" />, color: 'warning' },
    { id: 'cashflow' as const, label: 'Trésorerie', icon: <DollarSign className="w-4 h-4" />, color: 'danger' },
    { id: 'compensations' as const, label: 'Compensations', icon: <ArrowRightLeft className="w-4 h-4" />, color: 'secondary' },
  ]

  const locationOptions = (locations || []).map(l => ({ value: l.id, label: l.name }))

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Rapports</h1>
        <p className="text-surface-500 text-sm mt-1">Analysez et exportez vos données</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-surface-500 mb-1 block">Du</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-surface-500 mb-1 block">Au</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm" />
        </div>
        {(reportType === 'sales' || reportType === 'purchases') && (
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-surface-500 mb-1 block">Emplacement</label>
            <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm">
              <option value="all">Tous</option>
              {locationOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {reportConfig.map(r => (
          <button key={r.id} onClick={() => setReportType(r.id)}
            className={`p-3 rounded-2xl border text-left transition-all ${
              reportType === r.id
                ? 'border-primary-300 bg-primary-50 shadow-sm'
                : 'border-surface-200 bg-surface-100 hover:border-surface-300'
            }`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${
              reportType === r.id ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-500'
            }`}>{r.icon}</div>
            <p className="text-xs font-medium text-surface-900">{r.label}</p>
          </button>
        ))}
      </div>

      {reportType === 'sales' && (
        <div className="lg:hidden space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl border border-surface-200 bg-surface-100">
              <p className="text-[10px] uppercase font-semibold text-surface-500">Ventes</p>
              <p className="text-xl font-extrabold text-surface-900 mt-1">{formatCurrency(salesStats.total)}</p>
            </div>
            <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-500/5">
              <p className="text-[10px] uppercase font-semibold text-emerald-600">Bénéfice</p>
              <p className="text-xl font-extrabold text-emerald-600 mt-1">{formatCurrency(mobileAnalytics.profit)}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-surface-200 bg-surface-100">
            <p className="text-xs font-bold text-surface-900 mb-3">Évolution quotidienne</p>
            <div className="flex items-end justify-between gap-1.5 h-28">
              {mobileAnalytics.daily.map((d, i) => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 h-full">
                  <div className="flex-1 w-full flex items-end">
                    <div
                      className={`w-full rounded-lg ${i === 6 ? 'bg-primary-500' : 'bg-primary-300'}`}
                      style={{ height: `${Math.max((d.amount / mobileAnalytics.maxDaily) * 100, 4)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-semibold text-surface-500 uppercase">{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-surface-200 bg-surface-100">
            <p className="text-xs font-bold text-surface-900 mb-3">Meilleurs produits</p>
            {mobileAnalytics.bestProducts.length === 0 ? (
              <p className="text-xs text-surface-500">Aucune vente sur la période</p>
            ) : (
              <div className="space-y-2.5">
                {mobileAnalytics.bestProducts.map(([name, v]) => (
                  <div key={name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-surface-900 truncate pr-2">{name}</span>
                      <span className="font-bold text-primary-600">{formatCurrency(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-500" style={{ width: `${(v / mobileAnalytics.maxProduct) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl border border-surface-200 bg-surface-100">
            <p className="text-xs font-bold text-surface-900 mb-3">Meilleurs vendeurs</p>
            {mobileAnalytics.bestSellers.length === 0 ? (
              <p className="text-xs text-surface-500">Aucune vente sur la période</p>
            ) : (
              <div className="space-y-2.5">
                {mobileAnalytics.bestSellers.map((s, i) => (
                  <div key={s.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-surface-900">#{i + 1} {s.name}</span>
                      <span className="font-bold text-primary-600">{formatCurrency(s.total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(s.total / mobileAnalytics.maxSeller) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {reportType === 'sales' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Chiffre d'affaires</p><p className="text-xl font-bold text-surface-900">{formatCurrency(salesStats.total)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Nombre de ventes</p><p className="text-xl font-bold text-surface-900">{salesStats.count}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Panier moyen</p><p className="text-xl font-bold text-surface-900">{formatCurrency(salesStats.avg)}</p></div></Card>
        </div>
      )}

      {reportType === 'purchases' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Total achats</p><p className="text-xl font-bold text-surface-900">{formatCurrency(purchaseStats.total)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Nombre d'achats</p><p className="text-xl font-bold text-surface-900">{purchaseStats.count}</p></div></Card>
        </div>
      )}

      {reportType === 'inventory' && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Valeur du stock</p><p className="text-xl font-bold text-surface-900">{formatCurrency(inventoryStats.totalValue)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Qté totale</p><p className="text-xl font-bold text-surface-900">{inventoryStats.totalQty}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Emplacements</p><p className="text-xl font-bold text-surface-900">{inventoryStats.locationCount}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Stock bas</p><p className="text-xl font-bold text-danger">{inventoryStats.lowStock}</p></div></Card>
        </div>
      )}

      {reportType === 'supplier_invoices' && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Total facturé</p><p className="text-xl font-bold text-surface-900">{formatCurrency(supplierInvStats.totalInvoiced)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Payé</p><p className="text-xl font-bold text-success">{formatCurrency(supplierInvStats.totalPaid)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Dû</p><p className="text-xl font-bold text-danger">{formatCurrency(supplierInvStats.totalDue)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Factures</p><p className="text-xl font-bold text-surface-900">{supplierInvStats.count}</p></div></Card>
        </div>
      )}

      {reportType === 'cashflow' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Entrées</p><p className="text-xl font-bold text-success">{formatCurrency(cashflowStats.inflows)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Sorties</p><p className="text-xl font-bold text-danger">{formatCurrency(cashflowStats.outflows)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Solde net</p><p className="text-xl font-bold text-surface-900">{formatCurrency(cashflowStats.net)}</p></div></Card>
        </div>
      )}

      {reportType === 'compensations' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Montant total</p><p className="text-xl font-bold text-surface-900">{formatCurrency(compensationStats.total)}</p></div></Card>
          <Card><div className="p-4 text-center"><p className="text-xs text-surface-500">Nombre</p><p className="text-xl font-bold text-surface-900">{compensationStats.count}</p></div></Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{reportConfig.find(r => r.id === reportType)?.label || 'Rapport'}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><FileSpreadsheet className="w-4 h-4" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="w-4 h-4" /> PDF</Button>
          </div>
        </CardHeader>
        {reportType === 'supplier_invoices' ? (
          <SupplierFicheComptable
            rows={supplierFiche.rows}
            totals={supplierFiche.totals}
            emptyText="Aucun achat ni facture fournisseur pour cette période"
          />
        ) : (
        <div className="overflow-x-auto responsive-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                {reportType === 'sales' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Facture</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Client</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Total</th><th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Méthode</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Emplacement</th></>}
                {reportType === 'purchases' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">ID</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Fournisseur</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Total</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Emplacement</th></>}
                {reportType === 'inventory' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Produit</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Emplacement</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Qté</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Valeur</th><th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Alerte</th></>}
                {reportType === 'cashflow' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th><th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Type</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Catégorie</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Montant</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Description</th></>}
                {reportType === 'compensations' && <><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Direction</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Partie</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Montant</th><th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Réglé</th><th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Statut</th><th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th></>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {reportType === 'sales' && filteredSales.map(s => (
                <tr key={s.id} className="hover:bg-surface-50">
                  <td data-label="Facture" className="px-4 py-3 text-sm font-medium">{s.invoiceNumber}</td>
                  <td data-label="Client" className="px-4 py-3 text-sm text-surface-600">{s.customerName || 'Divers'}</td>
                  <td data-label="Date" className="px-4 py-3 text-sm text-surface-500">{formatDate(s.createdAt)}</td>
                  <td data-label="Total" className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(s.total)}</td>
                  <td data-label="Méthode" className="px-4 py-3 text-center"><Badge variant="info">{s.paymentMethod}</Badge></td>
                  <td data-label="Emplacement" className="px-4 py-3 text-sm text-surface-500">{locations?.find(l => l.id === s.locationId)?.name || s.locationId || '—'}</td>
                </tr>
              ))}
              {reportType === 'purchases' && filteredPurchases.map(p => (
                <tr key={p.id} className="hover:bg-surface-50">
                  <td data-label="ID" className="px-4 py-3 text-sm font-medium">{p.id.slice(0, 8)}</td>
                  <td data-label="Fournisseur" className="px-4 py-3 text-sm text-surface-600">{suppliers?.find(s => s.id === p.supplierId)?.name || p.supplierId}</td>
                  <td data-label="Date" className="px-4 py-3 text-sm text-surface-500">{formatDate(p.createdAt)}</td>
                  <td data-label="Total" className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(p.total)}</td>
                  <td data-label="Emplacement" className="px-4 py-3 text-sm text-surface-500">{locations?.find(l => l.id === p.locationId)?.name || p.locationId || '—'}</td>
                </tr>
              ))}
              {reportType === 'inventory' && (stocks || []).map(s => {
                const p = products?.find(pr => pr.id === s.productId)
                const loc = locations?.find(l => l.id === s.locationId)
                return (
                  <tr key={s.id} className="hover:bg-surface-50">
                    <td data-label="Produit" className="px-4 py-3 text-sm font-medium">{p?.name || s.productId}</td>
                    <td data-label="Emplacement" className="px-4 py-3 text-sm text-surface-500">{loc?.name || s.locationId}</td>
                    <td data-label="Qté" className="px-4 py-3 text-right text-sm">{s.quantity}</td>
                    <td data-label="Valeur" className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(s.quantity * (p?.purchasePrice || 0))}</td>
                    <td data-label="Alerte" className="px-4 py-3 text-center">{s.quantity <= s.stockAlert ? <Badge variant="danger">Stock bas</Badge> : <Badge variant="success">OK</Badge>}</td>
                  </tr>
                )
              })}
              {reportType === 'cashflow' && filteredCashflow.map(e => (
                <tr key={e.id} className="hover:bg-surface-50">
                  <td data-label="Date" className="px-4 py-3 text-sm text-surface-500">{formatDate(e.date)}</td>
                  <td data-label="Type" className="px-4 py-3 text-center"><Badge variant={e.type === 'in' ? 'success' : 'danger'}>{e.type === 'in' ? 'Entrée' : 'Sortie'}</Badge></td>
                  <td data-label="Catégorie" className="px-4 py-3 text-sm">{e.category}</td>
                  <td data-label="Montant" className={`px-4 py-3 text-right text-sm font-semibold ${e.type === 'in' ? 'text-success' : 'text-danger'}`}>{formatCurrency(e.amount)}</td>
                  <td data-label="Description" className="px-4 py-3 text-sm text-surface-500">{e.description}</td>
                </tr>
              ))}
              {reportType === 'compensations' && filteredCompensations.map(c => {
                const partyName = c.partyType === 'supplier'
                  ? suppliers?.find(s => s.id === c.partyId)?.name
                  : customers?.find(cu => cu.id === c.partyId)?.name
                return (
                  <tr key={c.id} className="hover:bg-surface-50">
                    <td data-label="Direction" className="px-4 py-3 text-sm">{c.direction === 'debt_to_goods' ? 'Dette → Marchandises' : 'Marchandises → Dette'}</td>
                    <td data-label="Partie" className="px-4 py-3 text-sm text-surface-600">{partyName || c.partyId}</td>
                    <td data-label="Montant" className="px-4 py-3 text-right text-sm font-semibold">{formatCurrency(c.amount)}</td>
                    <td data-label="Réglé" className="px-4 py-3 text-right text-sm">{formatCurrency(c.settledAmount)}</td>
                    <td data-label="Statut" className="px-4 py-3 text-center"><Badge variant={c.status === 'completed' ? 'success' : 'warning'}>{c.status}</Badge></td>
                    <td data-label="Date" className="px-4 py-3 text-sm text-surface-500">{formatDate(c.createdAt)}</td>
                  </tr>
                )
              })}
              {reportType === 'sales' && filteredSales.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-400">Aucune vente pour cette période</td></tr>}
              {reportType === 'purchases' && filteredPurchases.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-400">Aucun achat pour cette période</td></tr>}
              {reportType === 'inventory' && (stocks || []).length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-400">Aucun stock</td></tr>}
              {reportType === 'cashflow' && filteredCashflow.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-400">Aucune entrée de trésorerie pour cette période</td></tr>}
              {reportType === 'compensations' && filteredCompensations.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-surface-400">Aucune compensation pour cette période</td></tr>}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  )
}
