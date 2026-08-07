import { useState, useMemo, useCallback } from 'react'
import { Card, Button, Input, Badge, Pagination, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePagination } from '@/hooks/usePagination'
import { useAppStore, useSyncStore } from '@/stores/appStore'
import db from '@/db'
import { formatCurrency, formatDate, formatDateTime, cn } from '@/lib/utils'
import { exportSalePDF, exportReportPDF, shareSalePDF, buildProductPhotos } from '@/lib/pdf'
import { shareViaWeChat } from '@/lib/share'
import type { Sale, SaleItem, PaymentMethod, CompanySettings, CreditPayment } from '@/types'
import type { Location } from '@/engine/types'
import { toast } from '@/lib/toast'
import { deleteSale, editSale } from '@/engine/operations'
import PinConfirmModal from '@/components/ui/PinConfirmModal'
import MobileSaleCard from '@/components/sales/MobileSaleCard'
import MobileActionsSheet from '@/components/sales/MobileActionsSheet'
import { CreditPaymentModal } from '@/components/credit/CreditSaleModals'
import {
  Search, Filter, Download, FileText, Eye, Edit2, Trash2,
  ShoppingBag, ChevronDown, ChevronUp, Plus,
  User, Phone, MapPin, Send, Mail,
  Clock, ArrowUpDown, Wallet, FileSpreadsheet,
  Receipt, Save, X, RefreshCw, MoreHorizontal, MessageCircle
} from 'lucide-react'

type TabKey = 'active' | 'paid' | 'partial' | 'cancelled'
type SaleType = 'retail' | 'wholesale' | 'depot' | 'shop'
type PeriodKey = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'custom'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Ventes' },
  { key: 'paid', label: 'Payées' },
  { key: 'partial', label: 'Partielles' },
  { key: 'cancelled', label: 'Annulées' },
]

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'semester', label: 'Ce semestre' },
  { value: 'year', label: 'Cette année' },
  { value: 'custom', label: 'Intervalle' },
]

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'cash', label: 'Espèces' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'card', label: 'Carte' },
  { value: 'bank', label: 'Virement' },
  { value: 'credit', label: 'Crédit' },
  { value: 'split', label: 'Mixte' },
]

function statusBadge(status: string): { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string } {
  switch (status) {
    case 'completed': return { variant: 'success', label: 'Terminée' }
    case 'cancelled': return { variant: 'danger', label: 'Annulée' }
    case 'pending': return { variant: 'warning', label: 'En attente' }
    default: return { variant: 'default', label: status }
  }
}

function getSaleType(sale: Sale, locations: Location[]): SaleType {
  const loc = locations.find(l => l.id === sale.locationId)
  return loc?.type === 'warehouse' ? 'depot' : 'shop'
}

function getPaymentStatusBadge(sale: Sale): React.ReactNode {
  if (sale.status === 'cancelled') return <Badge variant="danger">Annulée</Badge>
  if (sale.paid >= sale.total) return <Badge variant="success">Payée</Badge>
  if (sale.paymentMethod === 'credit') return <Badge variant="info">Crédit</Badge>
  if (sale.paid > 0) return <Badge variant="warning">Partielle</Badge>
  return <Badge variant="warning">En attente</Badge>
}

function getPaymentStatus(sale: Sale): 'paid' | 'partial' | 'credit' | 'pending' {
  if (sale.status === 'cancelled') return 'pending'
  if (sale.paid >= sale.total) return 'paid'
  if (sale.paymentMethod === 'credit' && sale.paid > 0) return 'partial'
  if (sale.paymentMethod === 'credit') return 'credit'
  if (sale.paid > 0 && sale.paid < sale.total) return 'partial'
  return 'pending'
}

function getDateRange(key: PeriodKey): { start: Date; end: Date } | null {
  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const end = new Date(now); end.setHours(23, 59, 59, 999)
  switch (key) {
    case 'today': return { start, end }
    case 'yesterday': { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); return { start, end } }
    case 'week': { start.setDate(start.getDate() - start.getDay()); return { start, end } }
    case 'month': { start.setDate(1); return { start, end } }
    case 'quarter': { start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); return { start, end } }
    case 'semester': { start.setMonth(Math.floor(start.getMonth() / 6) * 6, 1); return { start, end } }
    case 'year': { start.setMonth(0, 1); return { start, end } }
    default: return null
  }
}

function calculateSaleCost(items: SaleItem[], products: Map<string, number>): number {
  return items.reduce((sum, item) => sum + (products.get(item.productId) ?? 0) * item.quantity, 0)
}

function formatPaymentMethod(method: PaymentMethod): string {
  const map: Record<string, string> = {
    cash: 'Espèces', card: 'Carte', mobile: 'Mobile Money',
    credit: 'Crédit', bank: 'Virement', split: 'Mixte',
  }
  return map[method] || method
}

export default function SalesPage() {
  const isMobile = useIsMobile()
  const businessId = useBusinessId()
  const userId = useAppStore(s => s.user?.id || '')
  const syncing = useSyncStore(s => s.syncing)
  const [refreshKey, setRefreshKey] = useState(0)
  const [actionSheetSale, setActionSheetSale] = useState<Sale | null>(null)

  const rawSales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).toArray(), [businessId, refreshKey])
  const salesLoading = rawSales === undefined
  const allSales: Sale[] = rawSales ?? []

  const rawLocations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])
  const locations: Location[] = rawLocations ?? []

  const customers: any[] = useLiveQuery(() => db.customers.toArray(), []) ?? []

  const productsList: any[] = useLiveQuery(() => db.products.toArray(), []) ?? []

  const creditPayments: CreditPayment[] = useLiveQuery(
    () => db.creditPayments.where('businessId').equals(businessId).toArray(),
    [businessId]
  ) ?? []


  const rawSettings = useLiveQuery(() => db.settings.get('default'), [])
  const appSettings = rawSettings as CompanySettings | undefined

  const users: any[] = useLiveQuery(() => db.users.toArray(), []) ?? []

  const productCostMap = useMemo(() => {
    const map = new Map<string, number>()
    productsList.forEach((p: any) => map.set(p.id, p.purchasePrice || 0))
    return map
  }, [productsList])

  const [tab, setTab] = useState<TabKey>('active')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('')
  const [saleTypeFilter, setSaleTypeFilter] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [sellerFilter, setSellerFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [sortField, setSortField] = useState<string>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Sale | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [payModalOpen, setPayModalOpen] = useState(false)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editSaleTarget, setEditSaleTarget] = useState<Sale | null>(null)
  const [editCustomerName, setEditCustomerName] = useState('')
  const [editCustomerId, setEditCustomerId] = useState('')
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('cash')
  const [editItems, setEditItems] = useState<SaleItem[]>([])

  const filteredSales = useMemo(() => {
    let result = [...allSales]
    const activeSales = result.filter(s => s.status === 'completed' || s.status === 'pending')
    const paidSales = result.filter(s => s.status === 'completed' && s.paid >= s.total)
    const partialSales = result.filter(s => s.status === 'completed' && s.paid > 0 && s.paid < s.total)
    const cancelledSales = result.filter(s => s.status === 'cancelled')
    const tabMap: Record<TabKey, Sale[]> = { active: activeSales, paid: paidSales, partial: partialSales, cancelled: cancelledSales }
    result = tabMap[tab] || activeSales
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(s =>
        s.invoiceNumber?.toLowerCase().includes(q) ||
        s.customerName?.toLowerCase().includes(q) ||
        customers.find((c: any) => c.id === s.customerId)?.phone?.toLowerCase().includes(q) ||
        s.items.some(i => i.productName.toLowerCase().includes(q))
      )
    }
    if (period !== 'custom') {
      const range = getDateRange(period)
      if (range) result = result.filter(s => { const d = new Date(s.createdAt); return d >= range.start && d <= range.end })
    } else if (customStart && customEnd) {
      const start = new Date(customStart); const end = new Date(customEnd); end.setHours(23, 59, 59, 999)
      result = result.filter(s => { const d = new Date(s.createdAt); return d >= start && d <= end })
    }
    if (locationFilter) result = result.filter(s => s.locationId === locationFilter)
    if (paymentMethodFilter) result = result.filter(s => s.paymentMethod === paymentMethodFilter || (paymentMethodFilter === 'split' && (s.splitPayments?.length ?? 0) > 0))
    if (saleTypeFilter) result = result.filter(s => getSaleType(s, locations) === saleTypeFilter)
    if (customerFilter) result = result.filter(s => s.customerId === customerFilter)
    if (sellerFilter) result = result.filter(s => s.userId === sellerFilter)
    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'invoiceNumber': cmp = (a.invoiceNumber || '').localeCompare(b.invoiceNumber || ''); break
        case 'createdAt': cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break
        case 'customerName': cmp = (a.customerName || '').localeCompare(b.customerName || ''); break
        case 'total': cmp = a.total - b.total; break
        default: cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return result
  }, [allSales, tab, search, period, customStart, customEnd, locationFilter, paymentMethodFilter, saleTypeFilter, customerFilter, sellerFilter, sortField, sortDir, locations, customers, productsList])

  const tabCounts = useMemo(() => {
    const all = allSales
    return {
      active: all.filter(s => s.status === 'completed' || s.status === 'pending').length,
      paid: all.filter(s => s.status === 'completed' && s.paid >= s.total).length,
      partial: all.filter(s => s.status === 'completed' && s.paid > 0 && s.paid < s.total).length,
      cancelled: all.filter(s => s.status === 'cancelled').length,
    }
  }, [allSales])

  const kpiStats = useMemo(() => {
    const sales = allSales.filter(s => s.status === 'completed')
    const cashSalesPaid = sales.filter(s => s.paymentMethod !== 'credit').reduce((sum, s) => sum + s.paid, 0)
    const creditCollected = creditPayments.reduce((sum, p) => sum + p.amount, 0)
    const totalRevenue = cashSalesPaid + creditCollected
    const totalCost = sales.reduce((sum, s) => {
      const ratio = s.total > 0 ? s.paid / s.total : 1
      return sum + calculateSaleCost(s.items, productCostMap) * ratio
    }, 0)
    const grossProfit = totalRevenue - totalCost
    const creditSales = sales.filter(s => s.paymentMethod === 'credit')
    const creditOutstanding = creditSales.reduce((sum, s) => sum + s.total - s.paid, 0)
    return {
      totalRevenue, totalSales: sales.length,
      grossProfit, margin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
      creditCount: creditSales.length, creditOutstanding,
    }
  }, [allSales, productCostMap, creditPayments])

  const { paginatedItems: paginatedSales, ...pag } = usePagination(filteredSales, 25)

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
  }

  function openDetail(sale: Sale) { setSelectedSale(sale); setDetailOpen(true) }

  function handleExportPDF() {
    const headers = ['Facture', 'Date', 'Client', 'Total', 'Payé', 'Statut', 'Type']
    const data = paginatedSales.map(s => [s.invoiceNumber || '', formatDate(s.createdAt), s.customerName || '—', formatCurrency(s.total), formatCurrency(s.paid), s.status, getSaleType(s, locations)])
    exportReportPDF('Ventes', headers, data, 'ventes')
    toast('PDF exporté', 'success')
  }

  function handleExportCSV() {
    const headers = ['Facture;Date;Client;Téléphone;Type;Paiement;Vendeur;Total;Coût;Bénéfice;Statut']
    const rows = paginatedSales.map(s => {
      const cost = calculateSaleCost(s.items, productCostMap)
      const ratio = s.total > 0 ? s.paid / s.total : 1
      const phone = customers.find((c: any) => c.id === s.customerId)?.phone || ''
      const seller = users.find((u: any) => u.id === s.userId)?.name || s.userId
      const locName = locations.find(l => l.id === s.locationId)?.name || ''
      return [s.invoiceNumber, formatDate(s.createdAt), s.customerName || '—', phone, getSaleType(s, locations), formatPaymentMethod(s.paymentMethod), seller, formatCurrency(s.total), formatCurrency(cost), formatCurrency((s.total - cost) * ratio), s.status].join(';')
    })
    const csv = '\uFEFF' + [...headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ventes.csv'; a.click(); URL.revokeObjectURL(url)
    toast('CSV exporté', 'success')
  }

  function handleExportExcel() {
    const rows = paginatedSales.map(s => {
      const ratio = s.total > 0 ? s.paid / s.total : 1
      return [s.invoiceNumber, formatDate(s.createdAt), s.customerName || '—', s.total, s.paid, (s.total - calculateSaleCost(s.items, productCostMap)) * ratio, s.status, getSaleType(s, locations)].join(',')
    })
    const csv = '\uFEFF' + 'Facture,Date,Client,Total,Payé,Bénéfice,Statut,Type\n' + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ventes.csv'; a.click(); URL.revokeObjectURL(url)
    toast('Excel exporté', 'success')
  }

  async function handleDelete(sale: Sale) { setDeleteTarget(sale); setPinModalOpen(true) }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteSale(deleteTarget.id)
      toast('Vente supprimée', 'success')
      setDeleteTarget(null)
      setRefreshKey(k => k + 1)
    } catch (err: any) { toast(err?.message || 'Erreur', 'error'); setDeleteTarget(null) }
  }

  async function handleWhatsApp(sale: Sale) {
    shareSalePDF(sale, appSettings, await buildProductPhotos(productsList))
    toast('Facture partagée', 'success')
  }

  function paymentStatusText(sale: Sale): string {
    if (sale.status === 'cancelled') return 'Annulée'
    if (sale.paid >= sale.total) return 'Payée'
    if (sale.paymentMethod === 'credit') return sale.paid > 0 ? 'Crédit partiel' : 'Crédit'
    if (sale.paid > 0) return 'Partielle'
    return 'En attente'
  }

  function handleWeChat(sale: Sale) {
    const customer = customers.find((c: any) => c.id === sale.customerId)
    const phone = customer?.phone ? `\nTéléphone: ${customer.phone}` : ''
    const text = `Facture ${sale.invoiceNumber} — ${sale.customerName || 'Client divers'}${phone}\nTotal: ${formatCurrency(sale.total)}\nPayé: ${formatCurrency(sale.paid)}\nRestant: ${formatCurrency(sale.total - sale.paid)}\nStatut: ${paymentStatusText(sale)}`
    shareViaWeChat(text, `Facture ${sale.invoiceNumber}`)
  }

  function handleEmail(sale: Sale) {
    const customer = customers.find((c: any) => c.id === sale.customerId)
    const email = customer?.email
    if (!email) { toast('Email manquant', 'error'); return }
    window.open(`mailto:${email}?subject=${encodeURIComponent(`Facture ${sale.invoiceNumber}`)}&body=${encodeURIComponent(`Bonjour ${sale.customerName || ''},\n\nVotre facture ${sale.invoiceNumber} d'un montant de ${formatCurrency(sale.total)}.\n\nCordialement.`)}`, '_blank')
    toast('Email ouvert', 'success')
  }

  async function handlePrintPDF(sale: Sale) { exportSalePDF(sale, appSettings, await buildProductPhotos(productsList)); toast('PDF généré', 'success') }

  function getSaleCost(sale: Sale): number { return calculateSaleCost(sale.items, productCostMap) }

  function openEditModal(sale: Sale) {
    setEditSaleTarget(sale)
    setEditCustomerName(sale.customerName || '')
    setEditCustomerId(sale.customerId || '')
    setEditPaymentMethod(sale.paymentMethod)
    setEditItems(sale.items.map(i => ({ ...i })))
    setEditModalOpen(true)
  }

  function updateEditItem(index: number, field: keyof SaleItem, value: any) {
    const newItems = [...editItems]
    const item = { ...newItems[index], [field]: value }
    item.total = (item.unitPrice - item.discount) * item.quantity
    newItems[index] = item
    setEditItems(newItems)
  }

  function removeEditItem(index: number) { setEditItems(editItems.filter((_, i) => i !== index)) }

  function addEditItem() {
    const newItem: SaleItem = { productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, total: 0 }
    setEditItems([...editItems, newItem])
  }

  function selectProduct(index: number, productId: string) {
    const product = productsList.find((p: any) => p.id === productId)
    if (!product) return
    const newItems = [...editItems]
    newItems[index] = {
      productId: product.id, productName: product.name,
      quantity: 1, unitPrice: product.sellingPrice, discount: 0,
      taxRate: product.taxRate || 0, total: product.sellingPrice,
    }
    setEditItems(newItems)
  }

  async function handleEditSave() {
    if (!editSaleTarget) return
    const subtotal = editItems.reduce((s, i) => s + i.total, 0)
    const discountTotal = editItems.reduce((s, i) => s + i.discount, 0)
    const taxTotal = editItems.reduce((s, i) => s + i.total * (i.taxRate / 100), 0) || 0
    const total = subtotal + taxTotal
    const updated: Partial<Sale> = {
      customerName: editCustomerName,
      customerId: editCustomerId || undefined,
      paymentMethod: editPaymentMethod,
      items: editItems,
      subtotal, discountTotal, taxTotal, total,
    }
    try {
      await editSale(editSaleTarget.id, updated)
      toast('Vente modifiée avec succès', 'success')
      setEditModalOpen(false)
    } catch (err: any) { toast(err?.message || 'Erreur', 'error') }
  }

  return (
    <div className="w-full h-full flex flex-col gap-4 p-4 lg:p-6 overflow-y-auto">
      <div className="flex items-center justify-between w-full">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-surface-900">Ventes</h1>
            {syncing && <RefreshCw className="w-4 h-4 text-primary-500 animate-spin" />}
          </div>
          <p className="text-surface-500 text-sm mt-1">
            {syncing ? 'Synchronisation...' : `${kpiStats.totalSales} ventes · ${formatCurrency(kpiStats.totalRevenue)} CA`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)}><RefreshCw className={cn('w-4 h-4', syncing && 'animate-spin')} /></Button>
          {!isMobile && <>
            <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="w-4 h-4" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="w-4 h-4" /> CSV</Button>
          </>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 w-full">
        <Card className="p-3"><p className="text-xs text-surface-500">Chiffre d'affaires</p><p className="text-base font-bold text-surface-900">{formatCurrency(kpiStats.totalRevenue)}</p></Card>
        <Card className="p-3"><p className="text-xs text-surface-500">Ventes</p><p className="text-base font-bold text-surface-900">{kpiStats.totalSales}</p></Card>
        <Card className="p-3"><p className="text-xs text-surface-500">Bénéfice brut</p><p className="text-base font-bold text-emerald-600">{formatCurrency(kpiStats.grossProfit)}</p></Card>
        <Card className="p-3"><p className="text-xs text-surface-500">Marge</p><p className="text-base font-bold text-surface-900">{kpiStats.margin.toFixed(1)}%</p></Card>
        <Card className="p-3"><p className="text-xs text-surface-500">Crédits en cours</p><p className="text-base font-bold text-amber-600">{formatCurrency(kpiStats.creditOutstanding)}</p></Card>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 w-full">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0', tab === t.key ? 'bg-primary-600 text-white shadow-sm' : 'bg-white text-surface-600 border border-surface-200 hover:bg-surface-50')}>
            {t.label}
            <span className={cn('ml-2 px-1.5 py-0.5 rounded-md text-xs', tab === t.key ? 'bg-white/20 text-white' : 'bg-surface-100 text-surface-500')}>{tabCounts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 w-full">
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center w-full">
          <div className="relative flex-1 w-full sm:w-auto min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-2 shrink-0">
            <div className="relative">
              <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}
                className="appearance-none rounded-xl border border-surface-300 bg-white px-3 py-2.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
            </div>
            <Button variant={showFilters ? 'primary' : 'outline'} size="sm" onClick={() => setShowFilters(!showFilters)}><Filter className="w-4 h-4" /> Filtres</Button>
          </div>
        </div>
        {period === 'custom' && <div className="flex gap-3 items-center"><Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} label="Du" /><Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} label="Au" /></div>}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 p-4 bg-surface-50 rounded-2xl border border-surface-200">
            <div><label className="block text-xs font-medium text-surface-500 mb-1">Boutique/Dépôt</label>
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Tous</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-surface-500 mb-1">Type</label>
              <select value={saleTypeFilter} onChange={(e) => setSaleTypeFilter(e.target.value)} className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Tous</option><option value="shop">Boutique</option><option value="depot">Dépôt</option>
              </select></div>
            <div><label className="block text-xs font-medium text-surface-500 mb-1">Paiement</label>
              <select value={paymentMethodFilter} onChange={(e) => setPaymentMethodFilter(e.target.value)} className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {PAYMENT_METHODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-surface-500 mb-1">Vendeur</label>
              <select value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Tous</option>{users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
            <div><label className="block text-xs font-medium text-surface-500 mb-1">Client</label>
              <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="">Tous</option>{customers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
          </div>
        )}
      </div>

      {isMobile ? (
        <div className="flex flex-col gap-3 w-full">
          {paginatedSales.map((sale) => (
            <div key={sale.id} className="relative">
              <MobileSaleCard sale={sale} onTap={() => openDetail(sale)} />
              <button
                onClick={(e) => { e.stopPropagation(); setActionSheetSale(sale) }}
                className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full active:bg-surface-100"
              >
                <MoreHorizontal className="w-5 h-5 text-surface-400" />
              </button>
            </div>
          ))}
          {paginatedSales.length === 0 && salesLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-400">
              <RefreshCw className="w-10 h-10 mb-3 text-primary-400 animate-spin" />
              <p className="font-medium text-surface-500">Chargement des ventes...</p>
              <p className="text-xs mt-1 text-surface-400">Synchronisation en cours</p>
            </div>
          )}
          {paginatedSales.length === 0 && !salesLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-400">
              <ShoppingBag className="w-12 h-12 mb-3 opacity-50" />
              <p className="font-medium">Aucune vente trouvée</p>
              <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
            </div>
          )}
          <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden w-full">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50/80">
                  <Th onClick={() => toggleSort('invoiceNumber')}><SortIcon field="invoiceNumber" /> Facture</Th>
                  <Th onClick={() => toggleSort('createdAt')}><SortIcon field="createdAt" /> Date/Heure</Th>
                  <Th onClick={() => toggleSort('customerName')}><SortIcon field="customerName" /> Client</Th>
                  <Th>Téléphone</Th>
                  <Th>Type</Th>
                  <Th>Paiement</Th>
                  <Th>Vendeur</Th>
                  <Th>Boutique</Th>
                  <Th onClick={() => toggleSort('total')} className="text-right"><SortIcon field="total" /> Total</Th>
                  <Th className="text-right">Bénéfice</Th>
                  <Th>Statut</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {paginatedSales.map((sale) => {
                  const ratio = sale.total > 0 ? sale.paid / sale.total : 1
                  const profit = (sale.total - getSaleCost(sale)) * ratio
                  const phone = customers.find((c: any) => c.id === sale.customerId)?.phone || ''
                  const seller = users.find((u: any) => u.id === sale.userId)?.name || '—'
                  const locName = locations.find(l => l.id === sale.locationId)?.name || '—'
                  return (
                    <tr key={sale.id} className="border-b border-surface-100 hover:bg-surface-50/50 transition-colors cursor-pointer group" onClick={() => openDetail(sale)}>
                      <td className="px-4 py-3 font-medium text-primary-600">{sale.invoiceNumber || '—'}</td>
                      <td className="px-4 py-3 text-surface-600 whitespace-nowrap"><div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-surface-400 shrink-0" /><span>{formatDateTime(sale.createdAt)}</span></div></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-surface-400 shrink-0" /><span className="font-medium text-surface-900 truncate max-w-[120px]">{sale.customerName || 'Client divers'}</span></div></td>
                      <td className="px-4 py-3 text-surface-500 text-xs">{phone || '—'}</td>
                      <td className="px-4 py-3"><Badge variant={getSaleType(sale, locations) === 'depot' ? 'warning' : 'info'}>{getSaleType(sale, locations) === 'depot' ? 'Dépôt' : 'Boutique'}</Badge></td>
                      <td className="px-4 py-3"><div className="flex items-center gap-1"><Wallet className="w-3 h-3 text-surface-400" /><span className="text-xs">{formatPaymentMethod(sale.paymentMethod)}</span></div></td>
                      <td className="px-4 py-3 text-xs text-surface-600">{seller}</td>
                      <td className="px-4 py-3 text-xs text-surface-600">{locName}</td>
                      <td className="px-4 py-3 text-right font-semibold text-surface-900">{formatCurrency(sale.total)}</td>
                      <td className={cn('px-4 py-3 text-right font-semibold', profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatCurrency(profit)}</td>
                      <td className="px-4 py-3">{getPaymentStatusBadge(sale)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openDetail(sale)} className="touch-target-sm rounded-lg hover:bg-surface-100 text-surface-400 hover:text-primary-600 transition-colors" title="Détails"><Eye className="w-4 h-4" /></button>
                          <button onClick={() => handlePrintPDF(sale)} className="touch-target-sm rounded-lg hover:bg-surface-100 text-surface-400 hover:text-blue-600 transition-colors" title="PDF"><FileText className="w-4 h-4" /></button>
                          <button onClick={() => handleWhatsApp(sale)} className="touch-target-sm rounded-lg hover:bg-surface-100 text-surface-400 hover:text-green-600 transition-colors" title="WhatsApp"><Send className="w-4 h-4" /></button>
                          <button onClick={() => handleWeChat(sale)} className="touch-target-sm rounded-lg hover:bg-surface-100 text-surface-400 hover:text-emerald-600 transition-colors" title="WeChat"><MessageCircle className="w-4 h-4" /></button>
                          <button onClick={() => { handleEmail(sale) }} className="touch-target-sm rounded-lg hover:bg-surface-100 text-surface-400 hover:text-blue-600 transition-colors" title="Email"><Mail className="w-4 h-4" /></button>
                          <button onClick={() => openEditModal(sale)} className="touch-target-sm rounded-lg hover:bg-surface-100 text-surface-400 hover:text-amber-600 transition-colors" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(sale)} className="touch-target-sm rounded-lg hover:bg-red-50 text-surface-400 hover:text-red-600 transition-colors" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {paginatedSales.length === 0 && salesLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-400">
              <RefreshCw className="w-10 h-10 mb-3 text-primary-400 animate-spin" />
              <p className="font-medium text-surface-500">Chargement des ventes...</p>
              <p className="text-xs mt-1 text-surface-400">Synchronisation en cours</p>
            </div>
          )}
          {paginatedSales.length === 0 && !salesLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-400">
              <ShoppingBag className="w-12 h-12 mb-3 opacity-50" />
              <p className="font-medium">Aucune vente trouvée</p>
              <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
            </div>
          )}
          <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
        </div>
      )}

      <MobileActionsSheet
        open={actionSheetSale !== null}
        onClose={() => setActionSheetSale(null)}
        actions={actionSheetSale ? [
          { key: 'detail', label: 'Voir détails', icon: <Eye className="w-5 h-5" />, onClick: () => openDetail(actionSheetSale) },
          { key: 'pdf', label: 'Télécharger PDF', icon: <FileText className="w-5 h-5" />, onClick: () => handlePrintPDF(actionSheetSale) },
          { key: 'whatsapp', label: 'Partager PDF par WhatsApp', icon: <Send className="w-5 h-5" />, onClick: () => handleWhatsApp(actionSheetSale) },
          { key: 'wechat', label: 'Envoyer par WeChat', icon: <MessageCircle className="w-5 h-5" />, onClick: () => handleWeChat(actionSheetSale) },
          { key: 'email', label: 'Envoyer par Email', icon: <Mail className="w-5 h-5" />, onClick: () => handleEmail(actionSheetSale) },
          { key: 'edit', label: 'Modifier', icon: <Edit2 className="w-5 h-5" />, onClick: () => openEditModal(actionSheetSale) },
          { key: 'delete', label: 'Supprimer', icon: <Trash2 className="w-5 h-5" />, variant: 'danger', onClick: () => handleDelete(actionSheetSale) },
        ] : []}
      />

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={selectedSale ? `Vente ${selectedSale.invoiceNumber}` : ''} size={isMobile ? 'full' : 'md'}>
        {selectedSale && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-xs text-surface-500">Facture</p><p className="text-sm font-semibold text-surface-900">{selectedSale.invoiceNumber}</p></div>
              <div><p className="text-xs text-surface-500">Date</p><p className="text-sm text-surface-900">{formatDate(selectedSale.createdAt)}</p></div>
              <div><p className="text-xs text-surface-500">Vendeur</p><p className="text-sm text-surface-900">{users.find((u: any) => u.id === selectedSale.userId)?.name || '—'}</p></div>
              <div><p className="text-xs text-surface-500">Paiement</p><p className="text-sm text-surface-900">{formatPaymentMethod(selectedSale.paymentMethod)}</p></div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-surface-900 mb-3">Client</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-surface-50 rounded-xl">
                <div className="flex items-center gap-2"><User className="w-4 h-4 text-surface-400" /><div><p className="text-xs text-surface-500">Nom</p><p className="text-sm font-medium text-surface-900">{selectedSale.customerName || 'Client divers'}</p></div></div>
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-surface-400" /><div><p className="text-xs text-surface-500">Téléphone</p><p className="text-sm text-surface-900">{customers.find((c: any) => c.id === selectedSale.customerId)?.phone || '—'}</p></div></div>
                <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-surface-400" /><div><p className="text-xs text-surface-500">Adresse</p><p className="text-sm text-surface-900">{customers.find((c: any) => c.id === selectedSale.customerId)?.address || '—'}</p></div></div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-surface-900 mb-3">Produits</h3>
              <div className="overflow-x-auto responsive-table"><table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-surface-500">Produit</th><th className="px-3 py-2 text-center text-xs font-medium text-surface-500">Qté</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-surface-500">Unité</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-surface-500">Prix unit.</th><th className="px-3 py-2 text-right text-xs font-medium text-surface-500">Remise</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-surface-500">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSale.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-surface-100">
                      <td data-label="Produit" className="px-3 py-2 font-medium text-surface-900">{item.productName}</td>
                      <td data-label="Qté" className="px-3 py-2 text-center">{item.quantity.toLocaleString('fr-FR')}</td>
                      <td data-label="Unité" className="px-3 py-2 text-center text-surface-500 text-xs">{item.unitName || 'Pièce'}</td>
                      <td data-label="Prix unit." className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td data-label="Remise" className="px-3 py-2 text-right text-red-500">{item.discount > 0 ? formatCurrency(item.discount) : '—'}</td>
                      <td data-label="Total" className="px-3 py-2 text-right font-semibold">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-50/50 font-semibold"><td colSpan={5} className="px-3 py-2 text-right text-surface-600">Sous-total</td><td className="px-3 py-2 text-right">{formatCurrency(selectedSale.subtotal)}</td></tr>
                  <tr className="bg-surface-50/50 font-semibold"><td colSpan={5} className="px-3 py-2 text-right text-surface-600">Remise</td><td className="px-3 py-2 text-right text-red-500">— {formatCurrency(selectedSale.discountTotal)}</td></tr>
                  <tr className="bg-surface-50/50 font-semibold"><td colSpan={5} className="px-3 py-2 text-right text-surface-600">Taxe</td><td className="px-3 py-2 text-right">{formatCurrency(selectedSale.taxTotal)}</td></tr>
                  <tr className="bg-primary-50 font-bold"><td colSpan={5} className="px-3 py-3 text-right text-surface-900 text-base">Total</td><td className="px-3 py-3 text-right text-surface-900 text-base">{formatCurrency(selectedSale.total)}</td></tr>
                </tfoot>
              </table>
            </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-surface-900 mb-3">Paiement</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Card className="p-4"><p className="text-xs text-surface-500">Total</p><p className="text-lg font-bold text-surface-900">{formatCurrency(selectedSale.total)}</p></Card>
                <Card className="p-4"><p className="text-xs text-surface-500">Payé</p><p className="text-lg font-bold text-emerald-600">{formatCurrency(selectedSale.paid)}</p></Card>
                <Card className="p-4"><p className="text-xs text-surface-500">Restant</p><p className={cn('text-lg font-bold', selectedSale.total - selectedSale.paid > 0 ? 'text-red-600' : 'text-surface-900')}>{formatCurrency(selectedSale.total - selectedSale.paid)}</p></Card>
              </div>
              {selectedSale.total > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-surface-500 mb-1">
                    <span>Avancement</span>
                    <span className="font-semibold text-surface-700">
                      {Math.min(100, Math.round((selectedSale.paid / selectedSale.total) * 100))}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', selectedSale.paid >= selectedSale.total ? 'bg-emerald-500' : 'bg-amber-500')}
                      style={{ width: `${Math.min(100, Math.round((selectedSale.paid / selectedSale.total) * 100))}%` }} />
                  </div>
                </div>
              )}
              {selectedSale.status === 'completed' && selectedSale.paid < selectedSale.total && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  <Button size="sm" onClick={() => setPayModalOpen(true)}><Wallet className="w-4 h-4" /> Encaisser un paiement</Button>
                  <Button size="sm" variant="outline" onClick={() => openEditModal(selectedSale)}><Edit2 className="w-4 h-4" /> Modifier la vente</Button>
                </div>
              )}
            </div>
            {isMobile && (
              <div className="flex flex-col gap-3 pt-2">
                <Button className="w-full min-h-[48px]" variant="outline" onClick={() => { setDetailOpen(false); setActionSheetSale(selectedSale) }}><MoreHorizontal className="w-5 h-5" /> Plus d'actions</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title={`Modifier la vente ${editSaleTarget?.invoiceNumber || ''}`} size="lg">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Client</label>
              <input type="text" value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)}
                className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Mode de paiement</label>
              <select value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                <option value="cash">Espèces</option><option value="mobile">Mobile Money</option>
                <option value="card">Carte</option><option value="bank">Virement</option><option value="credit">Crédit</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-surface-900">Produits</h3>
              <Button size="sm" onClick={addEditItem}><Plus className="w-4 h-4" /> Ajouter</Button>
            </div>
            <div className="overflow-x-auto responsive-table"><table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-surface-500">Produit</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-surface-500 w-20">Qté</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 w-28">Prix unit.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 w-28">Remise</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 w-28">Total</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-surface-500 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-surface-100">
                    <td className="px-3 py-2">
                      <select value={item.productId} onChange={(e) => selectProduct(idx, e.target.value)}
                        className="w-full rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">— Sélectionner —</option>
                        {productsList.map((p: any) => <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.sellingPrice)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input type="number" value={item.quantity} min={1} onChange={(e) => updateEditItem(idx, 'quantity', Math.max(1, +e.target.value))} className="w-20 rounded-lg border border-surface-300 px-2 py-1.5 text-sm text-center" /></td>
                    <td className="px-3 py-2"><input type="number" value={item.unitPrice} min={0} onChange={(e) => updateEditItem(idx, 'unitPrice', +e.target.value)} className="w-28 rounded-lg border border-surface-300 px-2 py-1.5 text-sm text-right" /></td>
                    <td className="px-3 py-2"><input type="number" value={item.discount} min={0} onChange={(e) => updateEditItem(idx, 'discount', +e.target.value)} className="w-28 rounded-lg border border-surface-300 px-2 py-1.5 text-sm text-right" /></td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.total)}</td>
                    <td className="px-3 py-2 text-center">
                      {editItems.length > 1 && <button onClick={() => removeEditItem(idx)} className="p-1 rounded-lg hover:bg-red-50 text-surface-400 hover:text-red-600"><X className="w-4 h-4" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-surface-50/50 font-bold">
                  <td colSpan={4} className="px-3 py-3 text-right">Total</td>
                  <td className="px-3 py-3 text-right">{formatCurrency(editItems.reduce((s, i) => s + i.total, 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setEditModalOpen(false)}>Annuler</Button>
          <Button onClick={handleEditSave}><Save className="w-4 h-4" /> Enregistrer les modifications</Button>
        </div>
      </Modal>

      <PinConfirmModal
        open={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setDeleteTarget(null) }}
        onConfirm={confirmDelete}
        title="Suppression de vente"
        description="Entrez votre code PIN de sécurité pour confirmer la suppression."
        actionLabel="Supprimer"
      />

      <CreditPaymentModal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        saleId={selectedSale?.id}
        onPaid={() => setRefreshKey(k => k + 1)}
      />
    </div>
  )
}

function Th({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th onClick={onClick} className={cn('px-4 py-3 text-left text-xs font-semibold text-surface-500 uppercase tracking-wider', onClick && 'cursor-pointer hover:text-surface-700 select-none', className)}>
      <div className="flex items-center gap-1">{children}</div>
    </th>
  )
}
