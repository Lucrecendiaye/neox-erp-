import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'

import { useBusinessId } from '@/hooks/useBusinessId'
import { usePagination } from '@/hooks/usePagination'

import { useAppStore } from '@/stores/appStore'
import db from '@/db'
import { generateId, formatCurrency, calculateMargin, cn, getProductUnits } from '@/lib/utils'
import type { Product } from '@/types'
import type { ProductStock } from '@/engine/types'
import BarcodeScanner from '@/components/ui/BarcodeScanner'
import PhotoUpload from '@/components/ui/PhotoUpload'
import { toast } from '@/lib/toast'
import { printBarcodeLabels } from '@/lib/barcodePrint'
import PinConfirmModal from '@/components/ui/PinConfirmModal'
import { softDelete } from '@/lib/softDelete'
import { syncDeleteObject } from '@/lib/realtime'
import {
  Search, Plus, Package, Edit2, Trash2, ScanLine, Printer,
  ChevronDown, Filter, Layers, Tags, Download, Eye,
  History, PackageOpen, AlertTriangle, TrendingUp,
  DollarSign, BarChart3, Archive, EyeOff, Clock,
  ArrowUpDown, Settings
} from 'lucide-react'

type ProductFilter = 'all' | 'low_stock' | 'out_of_stock' | 'in_stock' | 'hidden' | 'archived' | 'top_selling' | 'least_selling' | 'recent'
type UserRole = 'admin' | 'manager' | 'staff' | 'viewer'

const FILTER_OPTIONS: { value: ProductFilter; label: string }[] = [
  { value: 'all', label: 'Tous les produits' },
  { value: 'low_stock', label: 'Stock faible' },
  { value: 'out_of_stock', label: 'En rupture' },
  { value: 'in_stock', label: 'En stock' },
  { value: 'hidden', label: 'Produits masqués' },
  { value: 'archived', label: 'Produits archivés' },
  { value: 'top_selling', label: 'Plus vendus' },
  { value: 'least_selling', label: 'Moins vendus' },
  { value: 'recent', label: 'Récemment ajoutés' },
]

export default function ProductsPage() {
  const navigate = useNavigate()
  const currentUser = (useAppStore(s => s.user?.role) || 'admin') as UserRole
  const userId = useAppStore(s => s.user?.id || '')
  const businessId = useBusinessId()

  const rawProducts = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const categories = useLiveQuery(() => db.categories.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const rawStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const sales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).toArray(), [businessId]) ?? []

  const shopLocation = useLiveQuery(() => db.locations.where('businessId').equals(businessId).filter(l => l.type === 'shop').first(), [businessId])
  const shopId = shopLocation?.id || ''

  const products = useMemo(() => rawProducts.filter(p => p.status !== 'discontinued'), [rawProducts])

  const stocksByProduct = useMemo(() => {
    const map = new Map<string, ProductStock>()
    rawStocks.forEach((s: any) => {
      if (s.locationId === shopId) map.set(s.productId, s as ProductStock)
    })
    return map
  }, [rawStocks, shopId])

  const productSales = useMemo(() => {
    const count = new Map<string, number>()
    sales.forEach((s: any) => {
      if (s.status === 'completed' && Array.isArray(s.items)) {
        s.items.forEach((i: any) => {
          count.set(i.productId, (count.get(i.productId) || 0) + i.quantity)
        })
      }
    })
    return count
  }, [sales])

  function getStock(p: Product) {
    return stocksByProduct.get(p.id)
  }

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ProductFilter>('all')
  const [categoryId, setCategoryId] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<{
    name: string; description: string; barcode: string; reference: string; categoryId: string;
    brand: string; unit: 'piece' | 'dozen' | 'pack'; purchasePrice: number; sellingPrice: number;
    wholesalePrice: number; priceDozen: number; pricePack: number; packSize: number;
    taxRate: number; stockAlert: number; location: string;
  }>({
    name: '', description: '', barcode: '', reference: '', categoryId: '',
    brand: '', unit: 'piece', purchasePrice: 0, sellingPrice: 0,
    wholesalePrice: 0, priceDozen: 0, pricePack: 0, packSize: 0,
    taxRate: 0, stockAlert: 0, location: '',
  })
  const [photos, setPhotos] = useState<string[]>([])
  const [catForm, setCatForm] = useState({ name: '', description: '' })
  const [catEdit, setCatEdit] = useState<any>(null)
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockAdjust, setStockAdjust] = useState({ productId: '', productName: '', quantity: 0, note: '' })
  const [initialStock, setInitialStock] = useState(0)
  const [packUnit, setPackUnit] = useState<'piece' | 'dozen'>('piece')
  const [packQty, setPackQty] = useState(0)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinAction, setPinAction] = useState<{ type: string; payload: any } | null>(null)

  const computedPackSize = packUnit === 'dozen' ? packQty * 12 : packQty

  async function handlePinConfirm() {
    if (!pinAction) return
    switch (pinAction.type) {
      case 'delete_product':
        await confirmDeleteProduct(pinAction.payload)
        break
      case 'delete_category': {
        const catId = pinAction.payload
        const cat = categories.find((c: any) => c.id === catId)
        try {
          if (cat) await softDelete('categories', catId, cat as any, cat.name)
          await db.categories.delete(catId)
          toast(`Catégorie "${cat?.name || ''}" supprimée`, 'success')
        } catch { toast('Erreur', 'error') }
        break
      }
      case 'stock_adjust':
        setStockModalOpen(true)
        break
    }
    setPinAction(null)
  }

  const stats = useMemo(() => {
    const totalValue = products.reduce((s, p) => {
      const st = getStock(p)
      return s + (st?.quantity || 0) * p.sellingPrice
    }, 0)
    const totalCost = products.reduce((s, p) => {
      const st = getStock(p)
      return s + (st?.quantity || 0) * p.purchasePrice
    }, 0)
    const lowStock = products.filter(p => {
      const st = getStock(p)
      return st && st.quantity <= (p.stockAlert || 5)
    })
    const outOfStock = products.filter(p => {
      const st = getStock(p)
      return !st || st.quantity <= 0
    })
    const activeCats = new Set(products.map(p => p.categoryId).filter(Boolean))
    return {
      totalValue, totalCost, totalProducts: products.length,
      categoryCount: activeCats.size,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      potentialProfit: totalValue - totalCost,
    }
  }, [products, stocksByProduct])

  const filteredProducts = useMemo(() => {
    let result = [...products]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        categories.find((c: any) => c.id === p.categoryId)?.name?.toLowerCase().includes(q)
      )
    }

    if (categoryId !== 'all') {
      result = result.filter(p => p.categoryId === categoryId)
    }

    switch (filter) {
      case 'low_stock':
        result = result.filter(p => {
          const st = getStock(p)
          return st && st.quantity > 0 && st.quantity <= (p.stockAlert || 5)
        })
        break
      case 'out_of_stock':
        result = result.filter(p => {
          const st = getStock(p)
          return !st || st.quantity <= 0
        })
        break
      case 'in_stock':
        result = result.filter(p => {
          const st = getStock(p)
          return st && st.quantity > 0
        })
        break
      case 'hidden':
        result = result.filter(p => p.status === 'inactive')
        break
      case 'archived':
        result = result.filter(p => p.status === 'discontinued')
        break
      case 'top_selling':
        result.sort((a, b) => (productSales.get(b.id) || 0) - (productSales.get(a.id) || 0))
        break
      case 'least_selling':
        result.sort((a, b) => (productSales.get(a.id) || 0) - (productSales.get(b.id) || 0))
        break
      case 'recent':
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
    }
    return result
  }, [products, search, filter, categoryId, categories, stocksByProduct, productSales])

  const { paginatedItems, ...pag } = usePagination(filteredProducts, 24)

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: '', barcode: '', reference: '', categoryId: '', brand: '', unit: 'piece', purchasePrice: 0, sellingPrice: 0, wholesalePrice: 0, priceDozen: 0, pricePack: 0, packSize: 0, taxRate: 0, stockAlert: 0, location: '' })
    setPhotos([])
    setInitialStock(0)
    setPackUnit('piece')
    setPackQty(0)
    setModalOpen(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    setPhotos(product.photos || [])
    setForm({
      name: product.name, description: product.description || '',
      barcode: product.barcode || '', reference: product.reference || '',
      categoryId: product.categoryId || '', brand: product.brand || '',
      unit: product.unit, purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice, wholesalePrice: product.wholesalePrice || 0,
      priceDozen: product.priceDozen || 0, pricePack: product.pricePack || 0,
      packSize: product.packSize || 0,
      taxRate: product.taxRate, stockAlert: product.stockAlert || 0,
      location: product.location || '',
    })
    setInitialStock(0)
    if (product.packSize) {
      setPackUnit(product.packSize % 12 === 0 ? 'dozen' : 'piece')
      setPackQty(product.packSize % 12 === 0 ? product.packSize / 12 : product.packSize)
    } else {
      setPackUnit('piece')
      setPackQty(0)
    }
    setModalOpen(true)
  }

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      const packSize = form.unit === 'pack' ? (form.packSize || computedPackSize) : undefined
      if (editing) {
        const data = { ...form, photos, packSize, margin: calculateMargin(form.purchasePrice, form.sellingPrice), updatedAt: now }
        await db.products.update(editing.id, data)
        toast('Produit mis à jour', 'success')
      } else {
        const id = generateId()
        const product = {
          id, businessId, ...form, photos,
          packSize,
          margin: calculateMargin(form.purchasePrice, form.sellingPrice),
          status: 'active' as const, createdAt: now, updatedAt: now,
        }
        await db.products.add(product)
        if (initialStock > 0) {
          const movement = {
            id: generateId(), businessId, locationId: shopId,
            productId: id, type: 'in' as const, quantity: initialStock,
            unitPrice: form.purchasePrice, reference: 'INIT',
            note: 'Stock initial', createdAt: now, userId,
          }
          await db.stockMovements.add(movement)
          await db.productStocks.add({
            id: generateId(), businessId, productId: id,
            locationId: shopId, quantity: initialStock, stockAlert: form.stockAlert || 0,
            stockMin: 0, stockMax: 0, updatedAt: now,
          })
        }
        toast('Produit créé', 'success')
      }
      setModalOpen(false)
    } catch { toast('Erreur', 'error') }
  }

  async function handleDelete(id: string) {
    setPinAction({ type: 'delete_product', payload: id })
    setPinModalOpen(true)
  }

  async function confirmDeleteProduct(id: string) {
    const product = await db.products.get(id)
    if (product) await softDelete('products', id, product as any, product.name)
    const stocks = await db.productStocks.where('productId').equals(id).toArray()
    await db.productStocks.where('productId').equals(id).delete()
    await db.products.delete(id)
    try { await syncDeleteObject('products', id) } catch {}
    for (const stock of stocks) {
      try { await syncDeleteObject('productStocks', stock.id) } catch {}
    }
    toast('Produit supprimé', 'success')
  }

  function handleBarcodeScan(code: string) {
    const found = products.find(p => p.barcode === code)
    if (found) { openEdit(found) } else { setForm(prev => ({ ...prev, barcode: code })); if (!modalOpen) setModalOpen(true) }
  }

  function openStockAdjust(product: Product) {
    const st = getStock(product)
    setStockAdjust({ productId: product.id, productName: product.name, quantity: st?.quantity || 0, note: '' })
    setPinAction({ type: 'stock_adjust', payload: null })
    setPinModalOpen(true)
  }

  async function handleStockAdjust() {
    const now = new Date().toISOString()
    const st = getStock(products.find(p => p.id === stockAdjust.productId)!)
    const diff = stockAdjust.quantity - (st?.quantity || 0)
    if (diff === 0) { toast('Aucun changement', 'warning'); return }
    const movement = {
      id: generateId(), businessId, locationId: shopId,
      productId: stockAdjust.productId, type: diff > 0 ? 'in' : 'out' as any,
      quantity: diff, unitPrice: 0, reference: 'adjustment',
      note: stockAdjust.note || 'Ajustement manuel', createdAt: now, userId,
    }
    await db.stockMovements.add(movement as any)
    const existing = await db.productStocks.where({ productId: stockAdjust.productId, locationId: shopId }).first()
    if (existing) {
      await db.productStocks.update(existing.id, { quantity: stockAdjust.quantity, updatedAt: now })
    } else {
      await db.productStocks.add({
        id: generateId(), businessId, productId: stockAdjust.productId,
        locationId: shopId, quantity: stockAdjust.quantity, stockAlert: 0,
        stockMin: 0, stockMax: 0, updatedAt: now,
      })
    }
    toast('Stock ajusté', 'success')
    setStockModalOpen(false)
  }

  async function handleSaveCategory() {
    const now = new Date().toISOString()
    if (catEdit) {
      await db.categories.update(catEdit.id, { ...catForm, updatedAt: now } as any)
      toast('Catégorie modifiée', 'success')
    } else {
      const cat = { id: generateId(), businessId, ...catForm, createdAt: now }
      await db.categories.add(cat as any)
      toast('Catégorie créée', 'success')
    }
    setCatForm({ name: '', description: '' })
    setCatEdit(null)
    setCategoryModalOpen(false)
  }

  function marginColor(m: number) {
    if (m >= 20) return 'text-emerald-500'
    if (m >= 10) return 'text-amber-500'
    return 'text-red-500'
  }

  function can(action: string) {
    if (currentUser === 'admin') return true
    if (currentUser === 'manager') return action !== 'delete'
    return false
  }

  return (
    <div className="w-full h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Produits</h1>
          <p className="text-surface-500 text-sm mt-1">{stats.totalProducts} produits · {stats.categoryCount} catégories</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 w-full">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-surface-500">Valeur stock</p>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg font-bold text-surface-900">{formatCurrency(stats.totalValue)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-surface-500">Produits</p>
            <Package className="w-4 h-4 text-primary-500" />
          </div>
          <p className="text-lg font-bold text-surface-900">{stats.totalProducts}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-surface-500">Catégories</p>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-lg font-bold text-surface-900">{stats.categoryCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-surface-500">Stock faible</p>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className={cn('text-lg font-bold', stats.lowStockCount > 0 ? 'text-amber-600' : 'text-surface-900')}>
            {stats.lowStockCount}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-surface-500">Bénéfice potentiel</p>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-lg font-bold text-surface-900">{formatCurrency(stats.potentialProfit)}</p>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between w-full">
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:w-64 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text" placeholder="Nom, code-barres, SKU, marque..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ProductFilter)}
              className="appearance-none rounded-xl border border-surface-300 bg-white px-3 py-2.5 pr-8 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Toutes catégories</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setCatEdit(null); setCatForm({ name: '', description: '' }); setCategoryModalOpen(true) }}>
            <Layers className="w-4 h-4" /> Catégories
          </Button>
          <Button variant="outline" size="sm" onClick={() => printBarcodeLabels(filteredProducts)}>
            <Printer className="w-4 h-4" /> Étiquettes
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Nouveau
          </Button>
        </div>
      </div>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 w-full">
        {paginatedItems?.map((p) => {
          const st = getStock(p)
          const qty = st?.quantity ?? 0
          const alert = p.stockAlert || 5
          const isLow = qty > 0 && qty <= alert
          const isOut = qty <= 0
          const stockValue = qty * p.sellingPrice
          const totalCost = qty * p.purchasePrice
          const marginPct = calculateMargin(p.purchasePrice, p.sellingPrice)
          const catName = categories.find((c: any) => c.id === p.categoryId)?.name
          const soldQty = productSales.get(p.id) || 0

          return (
            <div key={p.id} className="bg-white rounded-[18px] border border-surface-200 shadow-sm hover:shadow-md hover:border-primary-200 transition-all group flex flex-col w-full max-w-[310px] mx-auto min-h-[730px] overflow-hidden">
              {/* Image */}
              <div className="relative h-[330px] shrink-0 bg-surface-50 flex items-center justify-center overflow-hidden">
                {p.photos?.[0] ? (
                  <img src={p.photos[0]} alt={p.name} className="w-full h-full object-contain" />
                ) : (
                  <Package className="w-16 h-16 text-surface-300" />
                )}
                {isOut && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-red-500 text-[11px] font-semibold text-white shadow-sm">Rupture</span>
                )}
                {isLow && !isOut && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-amber-500 text-[11px] font-semibold text-white shadow-sm">Stock faible</span>
                )}
                {p.status === 'inactive' && (
                  <span className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-surface-500 text-[11px] font-semibold text-white shadow-sm">Masqué</span>
                )}
              </div>

              {/* Informations */}
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-900 truncate leading-tight">{p.name}</p>
                  {catName && <p className="text-[11px] text-surface-400 truncate mt-0.5">{catName}</p>}
                </div>

                <div className="flex-1 grid grid-cols-2 gap-y-2 content-start text-xs mt-1">
                  <span className="text-surface-500">Prix détail</span>
                  <span className="text-surface-900 font-bold text-right">{formatCurrency(p.sellingPrice)}</span>
                  <span className="text-surface-500">Prix gros</span>
                  <span className="text-surface-900 font-semibold text-right">{(p.wholesalePrice || 0) > 0 ? formatCurrency(p.wholesalePrice!) : '—'}</span>
                  <span className="text-surface-500">Stock</span>
                  <span className={cn('font-semibold text-right', isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-success')}>
                    {qty}
                    <span className="text-surface-400 font-normal ml-0.5">pcs</span>
                  </span>
                  <span className="text-surface-500">Seuil</span>
                  <span className="text-surface-900 font-medium text-right">{alert}</span>
                  <span className="text-surface-500">Coût total</span>
                  <span className="text-surface-900 font-medium text-right">{formatCurrency(totalCost)}</span>
                  <span className="text-surface-500">Marge</span>
                  <span className={cn('font-semibold text-right', marginColor(marginPct))}>{marginPct.toFixed(1)}%</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-surface-100 shrink-0">
                {can('edit') && (
                  <button onClick={() => openEdit(p)} className="w-9 h-9 inline-flex items-center justify-center rounded-xl hover:bg-surface-100 text-surface-400 hover:text-primary-600 transition-colors" title="Modifier">
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                {can('view') && (
                  <button onClick={() => navigate(`/products/${p.id}`)} className="w-9 h-9 inline-flex items-center justify-center rounded-xl hover:bg-surface-100 text-surface-400 hover:text-blue-600 transition-colors" title="Fiche détaillée">
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                {can('edit') && (
                  <button onClick={() => openStockAdjust(p)} className="w-9 h-9 inline-flex items-center justify-center rounded-xl hover:bg-surface-100 text-surface-400 hover:text-amber-600 transition-colors" title="Ajuster le stock">
                    <PackageOpen className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => navigate(`/products/${p.id}`)} className="w-9 h-9 inline-flex items-center justify-center rounded-xl hover:bg-surface-100 text-surface-400 hover:text-purple-600 transition-colors" title="Historique">
                  <History className="w-4 h-4" />
                </button>
                {can('delete') && (
                  <button onClick={() => handleDelete(p.id)} className="w-9 h-9 inline-flex items-center justify-center rounded-xl hover:bg-red-50 text-surface-400 hover:text-red-600 transition-colors" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="text-center pb-2 text-[10px] text-surface-400 shrink-0">{p.barcode || p.reference || '—'}</div>
            </div>
          )
        })}
        {(!filteredProducts || filteredProducts.length === 0) && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-surface-400">
            <Package className="w-12 h-12 mb-3 opacity-50" />
            <p className="font-medium">Aucun produit trouvé</p>
            <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
          </div>
        )}
      </div>

      <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />

      {/* Product Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le produit' : 'Nouveau produit'} size="lg">
        <div className="p-6 space-y-5">
          <div>
            <h3 className="modal-section-title">Informations principales</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Nom du produit" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="Code-barres" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              <Select label="Catégorie" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} options={(categories || []).map((c: any) => ({ value: c.id, label: c.name }))} placeholder="Sélectionner..." />
              <Input label="Marque" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              <Input label="Référence" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
              <Select
                label="Unité"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value as 'piece' | 'dozen' | 'pack' })}
                options={[
                  { value: 'piece', label: 'Pièce' },
                  { value: 'dozen', label: 'Douzaine' },
                  { value: 'pack', label: 'Paquet' },
                ]}
              />
            </div>
            {form.unit === 'pack' && (
              <div className="bg-surface-50 rounded-xl p-4 space-y-3 mt-4">
                <p className="text-sm font-medium text-surface-700">Composition du paquet</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio" id="comp-piece" name="packComp" checked={packUnit === 'piece'}
                      onChange={() => setPackUnit('piece')}
                      className="w-4 h-4 text-primary-500"
                    />
                    <label htmlFor="comp-piece" className="text-sm text-surface-700">Pièces</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio" id="comp-dozen" name="packComp" checked={packUnit === 'dozen'}
                      onChange={() => setPackUnit('dozen')}
                      className="w-4 h-4 text-primary-500"
                    />
                    <label htmlFor="comp-dozen" className="text-sm text-surface-700">Douzaines</label>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-surface-500">1 paquet =</span>
                  <input
                    type="number" min="1"
                    value={packQty || ''}
                    onChange={(e) => setPackQty(+e.target.value)}
                    className="w-24 px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-right"
                  />
                  <span className="text-sm text-surface-500">{packUnit === 'dozen' ? 'douzaines' : 'pièces'}</span>
                  {packQty > 0 && (
                    <span className="text-xs text-surface-400 ml-1">
                      = {computedPackSize} pièces
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="modal-section-title">Image du produit</h3>
            <PhotoUpload photos={photos} onChange={setPhotos} />
          </div>

          <div>
            <h3 className="modal-section-title">Description</h3>
            <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div>
            <h3 className="modal-section-title">Prix</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Prix d'achat" type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: +e.target.value })} />
              <Input label="Prix de vente (pièce)" type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: +e.target.value })} />
              <Input label="Prix de gros" type="number" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: +e.target.value })} />
            </div>
            {form.purchasePrice > 0 && (
              <p className="text-sm text-surface-500 mt-3">
                Marge : <span className="font-semibold text-success">{calculateMargin(form.purchasePrice, form.sellingPrice).toFixed(1)}%</span>
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Input label="Prix par douzaine" type="number" value={form.priceDozen} onChange={(e) => setForm({ ...form, priceDozen: +e.target.value })} />
              <Input label="Prix par paquet" type="number" value={form.pricePack} onChange={(e) => setForm({ ...form, pricePack: +e.target.value })} />
            </div>
          </div>

          <div>
            <h3 className="modal-section-title">Stock</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="TVA (%)" type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: +e.target.value })} />
              <Input label="Alerte stock" type="number" value={form.stockAlert} onChange={(e) => setForm({ ...form, stockAlert: +e.target.value })} />
              <Input label="Emplacement" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              {!editing && (
                <Input label="Stock initial" type="number" value={initialStock} onChange={(e) => setInitialStock(+e.target.value)} />
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>{editing ? 'Mettre à jour' : 'Créer'}</Button>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal open={categoryModalOpen} onClose={() => setCategoryModalOpen(false)} title={catEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'} size="sm">
        <div className="p-6 space-y-4">
          <Input label="Nom" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
          <Input label="Description" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {categories.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-50">
                <span className="text-sm text-surface-700">{c.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCatEdit(c); setCatForm({ name: c.name, description: c.description || '' }) }}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Modifier
                  </button>
<button
                      onClick={() => {
                        setPinAction({ type: 'delete_category', payload: c.id })
                        setPinModalOpen(true)
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Suppr.
                    </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => { setCategoryModalOpen(false); setCatEdit(null); setCatForm({ name: '', description: '' }) }}>Annuler</Button>
          <Button onClick={handleSaveCategory}>{catEdit ? 'Modifier' : 'Créer'}</Button>
        </div>
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal open={stockModalOpen} onClose={() => setStockModalOpen(false)} title={`Ajuster le stock - ${stockAdjust.productName}`} size="sm">
        <div className="p-6 space-y-4">
          <Input label="Nouvelle quantité" type="number" value={stockAdjust.quantity} onChange={(e) => setStockAdjust({ ...stockAdjust, quantity: +e.target.value })} />
          <Input label="Note (optionnel)" value={stockAdjust.note} onChange={(e) => setStockAdjust({ ...stockAdjust, note: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setStockModalOpen(false)}>Annuler</Button>
          <Button onClick={handleStockAdjust}>Valider</Button>
        </div>
      </Modal>

      <PinConfirmModal
        open={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setPinAction(null) }}
        onConfirm={handlePinConfirm}
        title="Confirmation PIN"
        description="Cette action est protégée. Entrez votre code PIN de sécurité pour continuer."
        actionLabel="Confirmer"
      />
    </div>
  )
}
