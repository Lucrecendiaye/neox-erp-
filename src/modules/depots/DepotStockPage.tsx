import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Modal, Badge, Input, Select } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { useBusinessId } from '@/hooks/useBusinessId'
import { useAppStore } from '@/stores/appStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import db from '@/db'
import { cn, formatCurrency, generateId, calculateMargin, getProductUnits, convertToMainUnit } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { processStockAdjustment, processTransfer, getLocationStockValue, getLocationStats } from '@/engine/operations'
import { exportBonSortiePDF } from '@/lib/pdf'
import PinConfirmModal from '@/components/ui/PinConfirmModal'
import type { Product } from '@/types'
import PhotoUpload from '@/components/ui/PhotoUpload'
import {
  Package, Search, ArrowLeft, ArrowRightLeft, Plus, Edit2, Eye, Trash2, History,
  TrendingUp, AlertTriangle, DollarSign, Layers, Filter, Printer
} from 'lucide-react'

export default function DepotStockPage() {
  const { locationId } = useParams()
  const businessId = useBusinessId()
  const navigate = useNavigate()
  const currentUser = useAppStore(s => s.user)

  const location = useLiveQuery(() => db.locations.get(locationId!), [locationId])
  const allProducts = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const stocks = useLiveQuery(() => db.productStocks.where('locationId').equals(locationId!).toArray(), [locationId])
  const allSales = useLiveQuery(() => db.sales.where('locationId').equals(locationId!).toArray(), [locationId])
  const allLocations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [filter, setFilter] = useState('all')
  const [adjModal, setAdjModal] = useState(false)
  const [adjProduct, setAdjProduct] = useState('')
  const [adjQty, setAdjQty] = useState(0)
  const [adjNote, setAdjNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [transferModal, setTransferModal] = useState(false)
  const [transferTarget, setTransferTarget] = useState('')
  const [transferItems, setTransferItems] = useState<{ productId: string; qty: number; unitName?: string; unitQuantity?: number }[]>([])
  const [bonModal, setBonModal] = useState(false)
  const [bonInfo, setBonInfo] = useState<{ id: string; bonNumber: string; from: string; to: string; date: string; items: { name: string; qty: number }[] } | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [pinAction, setPinAction] = useState<{ type: string; payload?: any } | null>(null)

  const [editModal, setEditModal] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [editPhotos, setEditPhotos] = useState<string[]>([])
  const [editForm, setEditForm] = useState({
    name: '', description: '', barcode: '', reference: '', categoryId: '', brand: '',
    unit: 'piece' as 'piece' | 'dozen' | 'pack', purchasePrice: 0, sellingPrice: 0,
    wholesalePrice: 0, priceDozen: 0, pricePack: 0, packSize: 0,
    taxRate: 0, stockAlert: 0, location: '',
  })
  const [editPackUnit, setEditPackUnit] = useState<'piece' | 'dozen'>('piece')
  const [editPackQty, setEditPackQty] = useState(0)
  const isCloud = isSupabaseConfigured()

  const productMap = useMemo(() => new Map(allProducts?.map(p => [p.id, p])), [allProducts])
  const stockMap = useMemo(() => new Map(stocks?.map(s => [s.productId, s])), [stocks])
  const productSales = useMemo(() => {
    const m = new Map<string, number>()
    allSales?.forEach(s => s.items.forEach(i => {
      m.set(i.productId, (m.get(i.productId) || 0) + i.quantity * (i.unitQuantity || 1))
    }))
    return m
  }, [allSales])

  const dexieCategories = useLiveQuery(() => db.categories.where('businessId').equals(businessId).toArray(), [businessId])
  const categoryMap = useMemo(() => new Map(dexieCategories?.map(c => [c.id, c.name]) || []), [dexieCategories])

  const categories = useMemo(() => {
    const ids = new Set(allProducts?.map(p => p.categoryId).filter((x): x is string => !!x))
    return Array.from(ids).map(id => ({ id, name: categoryMap.get(id) || id }))
  }, [allProducts, categoryMap])

  const stats = useMemo(() => {
    let totalValue = 0, totalCost = 0, lowStockCount = 0, outOfStockCount = 0
    stocks?.forEach(s => {
      const p = productMap.get(s.productId)
      if (p) {
        totalValue += s.quantity * p.sellingPrice
        totalCost += s.quantity * p.purchasePrice
      }
      if (s.quantity <= s.stockAlert && s.quantity > 0) lowStockCount++
      if (s.quantity <= 0) outOfStockCount++
    })
    const catSet = new Set<string>()
    stocks?.forEach(s => {
      const p = productMap.get(s.productId)
      if (p?.categoryId) catSet.add(p.categoryId)
    })
    return {
      totalValue, totalCost, totalProducts: stocks?.length || 0,
      categoryCount: catSet.size, lowStockCount, outOfStockCount,
      potentialProfit: totalValue - totalCost,
    }
  }, [stocks, productMap])

  const filteredProducts = useMemo(() => {
    const productIds = new Set(stocks?.map(s => s.productId) || [])
    return (allProducts || []).filter(p => {
      if (!productIds.has(p.id)) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.barcode?.includes(q) && !p.reference?.toLowerCase().includes(q) && !p.brand?.toLowerCase().includes(q)) return false
      }
      if (categoryId !== 'all' && p.categoryId !== categoryId) return false
      const stock = stockMap.get(p.id)
      const qty = stock?.quantity || 0
      if (filter === 'low_stock' && (qty > (stock?.stockAlert || 5) || qty <= 0)) return false
      if (filter === 'out_of_stock' && qty > 0) return false
      if (filter === 'in_stock' && qty <= 0) return false
      if (filter === 'active' && p.status !== 'active') return false
      if (filter === 'inactive' && p.status !== 'inactive') return false
      return true
    })
  }, [allProducts, stocks, search, categoryId, filter, stockMap])

  async function handleDeleteStock(productId: string) {
    setPinAction({ type: 'delete_stock', payload: productId })
    setPinModalOpen(true)
  }

  async function confirmDeleteStock(productId: string) {
    await processStockAdjustment(productId, locationId!, 0, 'Suppression stock dépôt')
    toast('Stock mis à zéro', 'success')
    setConfirmDelete(null)
  }

  async function handleAdjust() {
    if (!adjProduct || adjQty < 0) return toast('Champs invalides', 'warning')
    await processStockAdjustment(adjProduct, locationId!, adjQty, adjNote)
    toast('Stock ajusté', 'success')
    setAdjModal(false); setAdjProduct(''); setAdjQty(0); setAdjNote('')
  }

  async function handleTransfer() {
    if (!transferTarget || transferItems.length === 0) return toast('Champs invalides', 'warning')
    const transferId = generateId()
    const now = new Date().toISOString()
    const bonNumber = `BS-${String(Date.now()).slice(-8)}`
    const items = transferItems
      .filter(i => i.qty > 0)
      .map(i => ({
        productId: i.productId, productName: productMap.get(i.productId)?.name || '',
        quantity: convertToMainUnit(i.qty, i.unitQuantity || 1),
      }))
    await processTransfer({
      id: transferId, businessId, fromLocationId: locationId!, toLocationId: transferTarget,
      bonNumber,
      items, status: 'pending', createdAt: now,
      userId: useAppStore.getState().user?.id || '',
    })
    const fromName = location?.name || ''
    const toName = allLocations?.find(l => l.id === transferTarget)?.name || ''
    setBonInfo({
      id: transferId, bonNumber, from: fromName, to: toName, date: now,
      items: items.map(i => ({ name: i.productName, qty: i.quantity })),
    })
    setBonModal(true)
    setTransferModal(false); setTransferTarget(''); setTransferItems([])
  }

  const otherLocations = allLocations?.filter(l => l.id !== locationId) || []
  const can = (action: string) => {
    if (currentUser?.role === 'admin') return true
    if (currentUser?.role === 'manager' && action !== 'delete') return true
    return false
  }

  function marginColor(m: number) {
    if (m >= 20) return 'text-success'
    if (m >= 10) return 'text-warning'
    return 'text-danger'
  }

  const allCategoriesNames = useMemo(() => {
    const allCats = new Map(dexieCategories?.map((c: any) => [c.id, c.name]) || [])
    categories.forEach(c => { if (!allCats.has(c.id)) allCats.set(c.id, c.name) })
    return Array.from(allCats.entries()).map(([id, name]) => ({ id, name }))
  }, [dexieCategories, categories])

  function openEdit(product: Product) {
    setEditing(product)
    setEditPhotos(product.photos || [])
    setEditForm({
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
    if (product.packSize) {
      setEditPackUnit(product.packSize % 12 === 0 ? 'dozen' : 'piece')
      setEditPackQty(product.packSize % 12 === 0 ? product.packSize / 12 : product.packSize)
    } else {
      setEditPackUnit('piece')
      setEditPackQty(0)
    }
    setEditModal(true)
  }

  async function handleSaveEdit() {
    const now = new Date().toISOString()
    if (!editing) return
    try {
      const packSize = editForm.unit === 'pack' ? (editForm.packSize || (editPackUnit === 'dozen' ? editPackQty * 12 : editPackQty)) : undefined
      const data = { ...editForm, photos: editPhotos, packSize, margin: calculateMargin(editForm.purchasePrice, editForm.sellingPrice), updatedAt: now }
      if (isCloud) { await sb.update('products', editing.id, data) } else { await db.products.update(editing.id, data) }
      toast('Produit mis à jour', 'success')
      setEditModal(false)
    } catch { toast('Erreur', 'error') }
  }

  return (
    <div className="w-full h-full flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-surface-900">{location?.name || 'Stock'}</h1>
          <p className="text-surface-500 text-sm">{stats.totalProducts} produits · {stats.categoryCount} catégories</p>
        </div>
        <Button onClick={() => setTransferModal(true)}><ArrowRightLeft className="w-4 h-4" /> Transférer</Button>
        <Button onClick={() => navigate(`/depots/history/${locationId}`)}><History className="w-4 h-4" /> Historique</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600"><DollarSign className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Valeur stock</p><p className="text-lg font-bold text-surface-900">{formatCurrency(stats.totalValue)}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600"><Package className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Produits</p><p className="text-lg font-bold text-surface-900">{stats.totalProducts}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600"><Layers className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Catégories</p><p className="text-lg font-bold text-surface-900">{stats.categoryCount}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600"><AlertTriangle className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Stock faible</p><p className={cn('text-lg font-bold', stats.lowStockCount > 0 ? 'text-amber-600' : 'text-surface-900')}>{stats.lowStockCount}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600"><TrendingUp className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Bénéfice potentiel</p><p className="text-lg font-bold text-surface-900">{formatCurrency(stats.potentialProfit)}</p></div></div></div></Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Nom, code-barres, SKU, marque..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-white">
          <option value="all">Tous les produits</option>
          <option value="low_stock">Stock faible</option>
          <option value="out_of_stock">En rupture</option>
          <option value="in_stock">En stock</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
        <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-white">
          <option value="all">Toutes catégories</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button onClick={() => { setPinAction({ type: 'adjust_stock' }); setPinModalOpen(true) }}><Plus className="w-4 h-4" /> Ajuster</Button>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {filteredProducts.map(p => {
          const stock = stockMap.get(p.id)
          const qty = stock?.quantity || 0
          const totalCost = qty * p.purchasePrice
          const margin = p.purchasePrice > 0 ? ((p.sellingPrice - p.purchasePrice) / p.purchasePrice) * 100 : 0
          const soldQty = productSales.get(p.id) || 0
          const isLow = qty > 0 && qty <= (p.stockAlert || 5)
          const isOut = qty <= 0

          return (
            <Card key={p.id} className="overflow-hidden p-0">
              {/* Image */}
              <div className="relative h-32 bg-surface-50 flex items-center justify-center overflow-hidden">
                {p.photos?.[0] ? (
                  <img src={p.photos[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-10 h-10 text-surface-300" />
                )}
                {isOut && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-red-500/90 text-[10px] font-semibold text-white">Rupture</span>}
                {isLow && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500/90 text-[10px] font-semibold text-white">Stock faible</span>}
              </div>

              {/* Info */}
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-surface-900 truncate">{p.name}</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <span className="text-surface-400">Prix vente</span>
                  <span className="text-right font-medium text-surface-900">{formatCurrency(p.sellingPrice)}</span>
                  <span className="text-surface-400">Stock</span>
                  <span className={cn('text-right font-medium', isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-surface-900')}>
                    {qty} pièces
                  </span>
                  <span className="text-surface-400">Seuil stock</span>
                  <span className="text-right font-medium text-surface-900">{p.stockAlert || '-'}</span>
                  <span className="text-surface-400">Coût stock</span>
                  <span className="text-right font-medium text-surface-900">{formatCurrency(totalCost)}</span>
                  <span className="text-surface-400">Marge</span>
                  <span className={cn('text-right font-medium', marginColor(margin))}>{margin.toFixed(1)}%</span>
                  <span className="text-surface-400">Vendus</span>
                  <span className="text-right font-medium text-surface-900">{soldQty}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 px-4 py-3 border-t border-surface-100 bg-surface-50">
                {can('edit') && (
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-white text-surface-400 hover:text-blue-600 transition-colors" title="Modifier">
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => navigate(`/products/${p.id}`)} className="p-1.5 rounded-lg hover:bg-white text-surface-400 hover:text-primary-600 transition-colors" title="Fiche détaillée">
                  <Eye className="w-4 h-4" />
                </button>
                {can('edit') && (
                  <button onClick={() => { setAdjProduct(p.id); setAdjQty(qty); setAdjModal(true) }} className="p-1.5 rounded-lg hover:bg-white text-surface-400 hover:text-amber-600 transition-colors" title="Ajuster le stock">
                    <Package className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => navigate(`/depots/history/${locationId}`)} className="p-1.5 rounded-lg hover:bg-white text-surface-400 hover:text-purple-600 transition-colors" title="Historique">
                  <History className="w-4 h-4" />
                </button>
                {can('delete') && (
                  <button onClick={() => { setPinAction({ type: 'delete_stock', payload: p.id }); setPinModalOpen(true) }} className="p-1.5 rounded-lg hover:bg-white text-surface-400 hover:text-red-600 transition-colors" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </Card>
          )
        })}
        {filteredProducts.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-surface-400">
            <Package className="w-12 h-12 mb-3 text-surface-300" />
            <p className="text-sm">Aucun produit trouvé</p>
            <p className="text-xs text-surface-400">Essayez de modifier vos filtres</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Confirmer la suppression">
        <div className="space-y-4">
          <p className="text-sm text-surface-600">Mettre le stock à zéro pour <strong>{productMap.get(confirmDelete || '')?.name}</strong> ?</p>
          <div className="flex gap-2">
            <Button onClick={() => setConfirmDelete(null)} variant="outline" className="flex-1">Annuler</Button>
            <Button onClick={() => handleDeleteStock(confirmDelete!)} className="flex-1 bg-red-600 hover:bg-red-500">Supprimer</Button>
          </div>
        </div>
      </Modal>

      <Modal open={adjModal} onClose={() => setAdjModal(false)} title="Ajustement de stock">
        <div className="space-y-4">
          <select value={adjProduct} onChange={e => setAdjProduct(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm">
            <option value="">Sélectionner un produit</option>
            {allProducts?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="Nouvelle quantité" value={adjQty} onChange={e => setAdjQty(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          <input placeholder="Note (optionnel)" value={adjNote} onChange={e => setAdjNote(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          <Button onClick={handleAdjust} className="w-full">Valider</Button>
        </div>
      </Modal>

      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="Transférer vers">
        <div className="space-y-4">
          <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm">
            <option value="">Destination</option>
            {otherLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {allProducts?.map(p => {
            const units = getProductUnits(p)
            const item = transferItems.find(i => i.productId === p.id)
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-sm flex-1">{p.name}</span>
                <select value={item?.unitName || 'Pièce'}
                  onChange={e => {
                    const unit = units.find(u => u.name === e.target.value) || units[0]
                    setTransferItems(prev => {
                      const ex = prev.find(i => i.productId === p.id)
                      if (ex) return prev.map(i => i.productId === p.id ? { ...i, unitName: unit.name, unitQuantity: unit.quantity } : i)
                      return [...prev, { productId: p.id, qty: 0, unitName: unit.name, unitQuantity: unit.quantity }]
                    })
                  }}
                  className="text-xs px-2 py-1.5 rounded-lg border border-surface-300 bg-white">
                  {units.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                </select>
                <input type="number" min="0" placeholder="Qté" value={item?.qty ?? ''}
                  onChange={e => {
                    const qty = Number(e.target.value)
                    setTransferItems(prev => {
                      const ex = prev.find(i => i.productId === p.id)
                      if (ex) return prev.map(i => i.productId === p.id ? { ...i, qty } : i)
                      return [...prev, { productId: p.id, qty, unitName: 'Pièce', unitQuantity: 1 }]
                    })
                  }}
                  className="w-20 px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-right" />
              </div>
            )
          })}
          <Button onClick={handleTransfer} className="w-full">Transférer</Button>
        </div>
      </Modal>

      {/* Edit Product */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Modifier le produit" size="xl">
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom du produit" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Input label="Code-barres" value={editForm.barcode} onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })} />
            <Select label="Catégorie" value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} options={allCategoriesNames.map((c: any) => ({ value: c.id, label: c.name }))} placeholder="Sélectionner..." />
            <Input label="Marque" value={editForm.brand} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })} />
            <Input label="Référence" value={editForm.reference} onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })} />
            <Select label="Unité" value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value as 'piece' | 'dozen' | 'pack' })} options={[{ value: 'piece', label: 'Pièce' }, { value: 'dozen', label: 'Douzaine' }, { value: 'pack', label: 'Paquet' }]} />
          </div>
          {editForm.unit === 'pack' && (
            <div className="bg-surface-50 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-surface-700">Composition du paquet</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <input type="radio" id="edit-comp-piece" name="editPackComp" checked={editPackUnit === 'piece'} onChange={() => setEditPackUnit('piece')} className="w-4 h-4 text-primary-500" />
                  <label htmlFor="edit-comp-piece" className="text-sm text-surface-700">Pièces</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="radio" id="edit-comp-dozen" name="editPackComp" checked={editPackUnit === 'dozen'} onChange={() => setEditPackUnit('dozen')} className="w-4 h-4 text-primary-500" />
                  <label htmlFor="edit-comp-dozen" className="text-sm text-surface-700">Douzaines</label>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-surface-500">1 paquet =</span>
                <input type="number" min="1" value={editPackQty || ''} onChange={(e) => setEditPackQty(+e.target.value)} className="w-24 px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-right" />
                <span className="text-sm text-surface-500">{editPackUnit === 'dozen' ? 'douzaines' : 'pièces'}</span>
                {editPackQty > 0 && <span className="text-xs text-surface-400 ml-1">= {editPackUnit === 'dozen' ? editPackQty * 12 : editPackQty} pièces</span>}
              </div>
            </div>
          )}
          <Input label="Description" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          <PhotoUpload photos={editPhotos} onChange={setEditPhotos} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Prix d'achat" type="number" value={editForm.purchasePrice} onChange={(e) => setEditForm({ ...editForm, purchasePrice: +e.target.value })} />
            <Input label="Prix de vente (pièce)" type="number" value={editForm.sellingPrice} onChange={(e) => setEditForm({ ...editForm, sellingPrice: +e.target.value })} />
            <Input label="Prix de gros" type="number" value={editForm.wholesalePrice} onChange={(e) => setEditForm({ ...editForm, wholesalePrice: +e.target.value })} />
          </div>
          {editForm.purchasePrice > 0 && (
            <p className="text-sm text-surface-500">Marge : <span className="font-semibold text-success">{calculateMargin(editForm.purchasePrice, editForm.sellingPrice).toFixed(1)}%</span></p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {editForm.unit === 'dozen' && <Input label="Prix par douzaine" type="number" value={editForm.priceDozen} onChange={(e) => setEditForm({ ...editForm, priceDozen: +e.target.value })} />}
            {editForm.unit === 'pack' && (
              <>
                <Input label="Prix par douzaine" type="number" value={editForm.priceDozen} onChange={(e) => setEditForm({ ...editForm, priceDozen: +e.target.value })} />
                <Input label="Prix par paquet" type="number" value={editForm.pricePack} onChange={(e) => setEditForm({ ...editForm, pricePack: +e.target.value })} />
              </>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Input label="TVA (%)" type="number" value={editForm.taxRate} onChange={(e) => setEditForm({ ...editForm, taxRate: +e.target.value })} />
            <Input label="Alerte stock" type="number" value={editForm.stockAlert} onChange={(e) => setEditForm({ ...editForm, stockAlert: +e.target.value })} />
            <Input label="Emplacement" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setEditModal(false)}>Annuler</Button>
          <Button onClick={handleSaveEdit}>Mettre à jour</Button>
        </div>
      </Modal>

      {/* Bon de sortie */}
      <Modal open={bonModal} onClose={() => setBonModal(false)} title={`Bon de sortie n°${bonInfo?.bonNumber || ''}`}>
        <div className="space-y-4">
          {bonInfo && (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-surface-400 text-xs">Origine</p>
                  <p className="font-medium text-surface-900">{bonInfo.from}</p>
                </div>
                <div>
                  <p className="text-surface-400 text-xs">Destination</p>
                  <p className="font-medium text-surface-900">{bonInfo.to}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-surface-400 text-xs">Date</p>
                  <p className="font-medium text-surface-900">{new Date(bonInfo.date).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200">
                    <th className="text-left py-2 text-surface-500 font-medium">Produit</th>
                    <th className="text-right py-2 text-surface-500 font-medium">Quantité</th>
                  </tr>
                </thead>
                <tbody>
                  {bonInfo.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-surface-100">
                      <td className="py-2 text-surface-900">{item.name}</td>
                      <td className="py-2 text-right text-surface-900 font-medium">{item.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => {
                  const w = window.open('', '_blank')
                  if (!w) return
                  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bon de sortie ${bonInfo.bonNumber}</title><style>body{font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto}h1{font-size:18px;margin-bottom:4px}p{margin:2px 0;color:#555;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px 4px;text-align:left;border-bottom:1px solid #ddd}th{color:#888;font-size:11px;text-transform:uppercase}td{font-size:14px}.total{margin-top:12px;text-align:right;font-size:14px;font-weight:bold}.footer{margin-top:40px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#aaa;text-align:center}</style></head><body><h1>Bon de sortie n°${bonInfo.bonNumber}</h1><p>Origine : ${bonInfo.from}</p><p>Destination : ${bonInfo.to}</p><p>Date : ${new Date(bonInfo.date).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</p><p>Utilisateur : ${currentUser?.name || ''}</p><table><thead><tr><th>Produit</th><th style="text-align:right">Quantité</th></tr></thead><tbody>${bonInfo.items.map(i => `<tr><td>${i.name}</td><td style="text-align:right">${i.qty}</td></tr>`).join('')}</tbody></table><p class="total">Total articles : ${bonInfo.items.reduce((s, i) => s + i.qty, 0)}</p><div style="margin-top:30px;font-size:11px;color:#888"><p>Signature expéditeur : ___________________________</p><p>Signature destinataire : ________________________</p></div><div class="footer"><p>Document généré automatiquement - Neox ERP</p></div></body></html>`)
                  w.document.close()
                  setTimeout(() => { w.print() }, 500)
                }} className="flex-1">
                  <Printer className="w-4 h-4" /> Imprimer
                </Button>
                <Button variant="outline" onClick={() => {
                  exportBonSortiePDF(
                    bonInfo.bonNumber,
                    bonInfo.from,
                    bonInfo.to,
                    bonInfo.items.map(i => ({ productId: '', productName: i.name, quantity: i.qty })),
                    currentUser?.name || '',
                    bonInfo.date,
                    useAppStore.getState().settings || undefined
                  )
                  toast('PDF téléchargé', 'success')
                }} className="flex-1">
                  <Printer className="w-4 h-4" /> Télécharger PDF
                </Button>
                <Button variant="ghost" onClick={() => setBonModal(false)}>Fermer</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <PinConfirmModal
        open={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setPinAction(null) }}
        onConfirm={async () => {
          if (!pinAction) return
          if (pinAction.type === 'delete_stock') {
            await confirmDeleteStock(pinAction.payload)
          } else if (pinAction.type === 'adjust_stock') {
            setAdjModal(true)
          }
          setPinAction(null)
        }}
        title="Confirmation PIN"
        description="Cette action est protégée. Entrez votre code PIN de sécurité pour continuer."
        actionLabel="Confirmer"
      />
    </div>
  )
}