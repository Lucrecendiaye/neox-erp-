import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'

import { useBusinessId } from '@/hooks/useBusinessId'
import { usePagination } from '@/hooks/usePagination'
import { usePermission } from '@/hooks/usePermission'

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
import { syncDeleteObject, syncWriteObject } from '@/lib/realtime'
import { processTransfer } from '@/engine/operations'
import type { Transfer } from '@/engine/types'
import {
  Search, Plus, Package, Edit2, Trash2, ScanLine, Printer,
  ChevronDown, Filter, Layers, Tags, Download, Eye,
  History, PackageOpen, AlertTriangle, TrendingUp,
  DollarSign, BarChart3, Archive, EyeOff, Clock,
  ArrowUpDown, Settings, ArrowRightLeft
} from 'lucide-react'

type ProductFilter = 'all' | 'low_stock' | 'out_of_stock' | 'in_stock' | 'hidden' | 'archived' | 'top_selling' | 'least_selling' | 'recent'

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
  const { can } = usePermission()
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

  function getStock(p: Product | null | undefined) {
    if (!p) return undefined
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
    packCost: number; dozenCost: number;
    taxRate: number; stockAlert: number; location: string;
  }>({
    name: '', description: '', barcode: '', reference: '', categoryId: '',
    brand: '', unit: 'piece', purchasePrice: 0, sellingPrice: 0,
    wholesalePrice: 0, priceDozen: 0, pricePack: 0, packSize: 0,
    packCost: 0, dozenCost: 0,
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

  const allLocations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const [transferModal, setTransferModal] = useState(false)
  const [transferProduct, setTransferProduct] = useState<Product | null>(null)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferQty, setTransferQty] = useState(1)

  const transferDestinations = allLocations.filter(l => l.id !== shopId && l.isActive)

  const computedPackSize = packUnit === 'dozen' ? packQty * 12 : packQty
  const piecesPerPack = form.unit === 'pack' ? (form.packSize || computedPackSize || 0) : 0

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
    setForm({ name: '', description: '', barcode: '', reference: '', categoryId: '', brand: '', unit: 'piece', purchasePrice: 0, sellingPrice: 0, wholesalePrice: 0, priceDozen: 0, pricePack: 0, packSize: 0, packCost: 0, dozenCost: 0, taxRate: 0, stockAlert: 0, location: '' })
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
      packCost: product.packSize ? Math.round((product.purchasePrice * product.packSize) * 100) / 100 : 0,
      dozenCost: Math.round(product.purchasePrice * 12 * 100) / 100,
      taxRate: product.taxRate, stockAlert: product.stockAlert || 0,
      location: product.location || '',
    })
    setInitialStock(getStock(product)?.quantity || 0)
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
        try { await syncWriteObject('products', { id: editing.id, ...data }) } catch {}
        const currentStock = getStock(editing)?.quantity || 0
        if (initialStock >= 0 && initialStock !== currentStock) {
          const diff = initialStock - currentStock
          const movement = {
            id: generateId(), businessId, locationId: shopId,
            productId: editing.id, type: diff > 0 ? 'in' : 'out' as any,
            quantity: Math.abs(diff), unitPrice: 0, reference: 'adjustment',
            note: 'Ajustement depuis fiche produit', createdAt: now, userId,
          }
          await db.stockMovements.add(movement as any)
          try { await syncWriteObject('stockMovements', movement) } catch {}
          const existing = await db.productStocks.where({ productId: editing.id, locationId: shopId }).first()
          if (existing) {
            await db.productStocks.update(existing.id, { quantity: initialStock, updatedAt: now })
            try { await syncWriteObject('productStocks', { ...existing, quantity: initialStock, updatedAt: now }) } catch {}
          } else {
            const newStock = {
              id: generateId(), businessId, productId: editing.id,
              locationId: shopId, quantity: initialStock, stockAlert: form.stockAlert || 0,
              stockMin: 0, stockMax: 0, updatedAt: now,
            }
            await db.productStocks.add(newStock)
            try { await syncWriteObject('productStocks', newStock) } catch {}
          }
        }
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
        try { await syncWriteObject('products', product) } catch {}
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
    const product = products.find(p => p.id === stockAdjust.productId)
    if (!product) { toast('Produit introuvable', 'error'); return }
    const st = getStock(product)
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

  function openTransfer(product: Product) {
    setTransferProduct(product)
    setTransferTarget('')
    setTransferQty(1)
    setTransferModal(true)
  }

  async function handleTransfer() {
    if (!transferProduct || !transferTarget) { toast('Choisissez une destination', 'warning'); return }
    if (transferQty <= 0) { toast('Quantité invalide', 'warning'); return }
    const available = getStock(transferProduct)?.quantity || 0
    if (transferQty > available) { toast('Quantité insuffisante en stock', 'error'); return }
    const now = new Date().toISOString()
    const transfer: Transfer = {
      id: generateId(), businessId, fromLocationId: shopId, toLocationId: transferTarget,
      items: [{ productId: transferProduct.id, productName: transferProduct.name, quantity: transferQty }],
      status: 'pending', createdAt: now, userId,
    }
    await processTransfer(transfer)
    toast('Transfert créé', 'success')
    setTransferModal(false)
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
          <p className={cn('text-lg font-bold', stats.lowStockCount > 0 ? 'text-amber-400' : 'text-surface-900')}>
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
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ProductFilter)}
              className="appearance-none rounded-xl border border-surface-300 bg-surface-100 px-3 py-2.5 pr-8 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-xl border border-surface-300 bg-surface-100 px-3 py-2.5 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
            <div key={p.id} className="bg-surface-100 rounded-2xl border border-surface-200 shadow-sm hover:shadow-md hover:border-primary-300 transition-all flex flex-col overflow-hidden">
              {/* Image */}
              <div className="relative h-40 lg:h-48 shrink-0 bg-surface-50 flex items-center justify-center overflow-hidden">
                {p.photos?.[0] ? (
                  <img loading="lazy" src={p.photos[0]} alt={p.name} className="w-full h-full object-contain" />
                ) : (
                  <Package className="w-12 h-12 text-surface-500" />
                )}
                {isOut && (
                  <span className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-red-500 text-[11px] font-semibold text-white shadow-sm">Rupture</span>
                )}
                {isLow && !isOut && (
                  <span className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-amber-500 text-[11px] font-semibold text-white shadow-sm">Stock faible</span>
                )}
                {p.status === 'inactive' && (
                  <span className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-surface-500 text-[11px] font-semibold text-white shadow-sm">Masqué</span>
                )}
              </div>

              {/* Informations */}
              <div className="p-3.5 flex-1 flex flex-col gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-surface-900 leading-snug line-clamp-2">{p.name}</p>
                  {catName && <p className="text-[11px] text-surface-500 truncate mt-0.5">{catName}</p>}
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-surface-600">
                    <span className="text-[10px] uppercase text-surface-500 block font-medium">Prix détail</span>
                    <span className="font-extrabold text-primary-500 text-base">{formatCurrency(p.sellingPrice)}</span>
                  </span>
                  <span className="flex-1 text-surface-600">
                    <span className="text-[10px] uppercase text-surface-500 block font-medium">Prix gros</span>
                    <span className="font-bold text-surface-900">{(p.wholesalePrice || 0) > 0 ? formatCurrency(p.wholesalePrice!) : '—'}</span>
                  </span>
                  <span className="text-right">
                    <span className="text-[10px] uppercase text-surface-500 block font-medium">Stock</span>
                    <span className={cn('font-extrabold', isOut ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-success')}>{qty} pcs</span>
                  </span>
                </div>
              </div>

              {/* Actions rapides */}
              <div className="grid grid-cols-3 gap-2 px-3.5 pb-3.5 shrink-0">
                {can('products', 'edit') && (
                  <button onClick={() => openEdit(p)} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-surface-50 border border-surface-200 text-surface-700 text-xs font-semibold active:scale-[0.97] transition-all min-h-[44px]">
                    <Edit2 className="w-4 h-4" /> Modifier
                  </button>
                )}
                {can('products', 'edit') && (
                  <button onClick={() => openStockAdjust(p)} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-semibold active:scale-[0.97] transition-all min-h-[44px]">
                    <PackageOpen className="w-4 h-4" /> Ajuster
                  </button>
                )}
                {can('products', 'transfer') && (
                  <button onClick={() => openTransfer(p)} className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold active:scale-[0.97] transition-all min-h-[44px]">
                    <ArrowRightLeft className="w-4 h-4" /> Transférer
                  </button>
                )}
              </div>
              {can('products', 'view') && (
                <button onClick={() => navigate(`/products/${p.id}`)} className="py-2 border-t border-surface-100 text-center text-xs font-medium text-primary-400 hover:bg-primary-50 transition-colors shrink-0">
                  Fiche produit & historique →
                </button>
              )}
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
                onChange={(e) => {
                  const unit = e.target.value as 'piece' | 'dozen' | 'pack'
                  setForm(prev => {
                    const next = { ...prev, unit }
                    if (unit === 'pack' && prev.purchasePrice > 0) {
                      const size = prev.packSize || computedPackSize
                      if (size > 0) next.packCost = Math.round(prev.purchasePrice * size * 100) / 100
                    }
                    if (unit === 'dozen' && prev.purchasePrice > 0) {
                      next.dozenCost = Math.round(prev.purchasePrice * 12 * 100) / 100
                    }
                    return next
                  })
                }}
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
                      onChange={() => {
                        setPackUnit('piece')
                        if (form.packCost > 0) {
                          const size = form.packSize || packQty
                          if (size > 0) setForm(f => ({ ...f, purchasePrice: Math.round((f.packCost / size) * 100) / 100 }))
                        }
                      }}
                      className="w-4 h-4 text-primary-500"
                    />
                    <label htmlFor="comp-piece" className="text-sm text-surface-700">Pièces</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="radio" id="comp-dozen" name="packComp" checked={packUnit === 'dozen'}
                      onChange={() => {
                        setPackUnit('dozen')
                        if (form.packCost > 0) {
                          const size = form.packSize || packQty * 12
                          if (size > 0) setForm(f => ({ ...f, purchasePrice: Math.round((f.packCost / size) * 100) / 100 }))
                        }
                      }}
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
                    onChange={(e) => {
                      setPackQty(+e.target.value)
                      if (form.packCost > 0) {
                        const size = form.packSize || (packUnit === 'dozen' ? +e.target.value * 12 : +e.target.value)
                        if (size > 0) setForm(f => ({ ...f, purchasePrice: Math.round((f.packCost / size) * 100) / 100 }))
                      }
                    }}
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
              {form.unit === 'piece' && (
                <Input label="Prix de revient (pièce)" type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: +e.target.value })} />
              )}
              {form.unit === 'pack' && (
                <Input label={`Prix de revient (paquet de ${piecesPerPack || '—'} pcs)`} type="number" value={form.packCost} onChange={(e) => {
                  const packCost = +e.target.value
                  setForm(f => ({ ...f, packCost, purchasePrice: piecesPerPack > 0 && packCost > 0 ? Math.round((packCost / piecesPerPack) * 100) / 100 : 0 }))
                }} />
              )}
              {form.unit === 'dozen' && (
                <Input label="Prix de revient (douzaine)" type="number" value={form.dozenCost} onChange={(e) => {
                  const dozenCost = +e.target.value
                  setForm(f => ({ ...f, dozenCost, purchasePrice: dozenCost > 0 ? Math.round((dozenCost / 12) * 100) / 100 : 0 }))
                }} />
              )}
              <Input label="Prix de vente (pièce)" type="number" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: +e.target.value })} />
              <Input label="Prix de gros" type="number" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: +e.target.value })} />
            </div>
            {form.unit !== 'piece' && form.purchasePrice > 0 && (
              <p className="text-sm text-surface-500 mt-3">
                Coût unitaire : <span className="font-semibold text-surface-700">{formatCurrency(form.purchasePrice)} / pièce</span>
              </p>
            )}
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
              <Input label={editing ? 'Quantité en stock' : 'Stock initial'} type="number" value={initialStock} onChange={(e) => setInitialStock(+e.target.value)} />
            </div>
            {editing && (
              <p className="text-xs text-surface-500 mt-2">La différence par rapport au stock actuel sera comptabilisée automatiquement.</p>
            )}
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
                    className="text-xs text-primary-400 hover:underline"
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

      {/* Transfer Modal */}
      <Modal open={transferModal} onClose={() => setTransferModal(false)} title={`Transférer - ${transferProduct?.name || ''}`} size="sm">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Vers</label>
            <select
              value={transferTarget}
              onChange={(e) => setTransferTarget(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Sélectionner un dépôt...</option>
              {transferDestinations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {transferDestinations.length === 0 && (
              <p className="text-xs text-surface-400 mt-1">Aucun autre dépôt disponible. Créez-en un dans le module Dépôts.</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1">Quantité (pièces)</label>
            <input
              type="number" min="1" value={transferQty}
              onChange={(e) => setTransferQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-surface-500 mt-1">Disponible : {getStock(transferProduct)?.quantity || 0} pcs</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setTransferModal(false)}>Annuler</Button>
          <Button onClick={handleTransfer} disabled={!transferTarget || transferQty <= 0 || (transferQty > (getStock(transferProduct)?.quantity || 0))}>Transférer</Button>
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
