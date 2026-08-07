import { useState, useMemo } from 'react'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { generateId, formatCurrency, generateInvoiceNumber, cn, getProductUnits, getUnitPrice, convertToMainUnit, getUnitStep, getUnitMinQty, pickContact } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  Search, ScanLine, ShoppingCart, Minus, Plus, X, Trash2,
  CreditCard, Printer, Download, Camera, Package, AlertTriangle,
  ChevronDown, User, Phone, MapPin, Calendar, Tag, Percent,
  Check, Send, SplitSquareVertical as SplitIcon, Banknote, Boxes, Contact as ContactIcon, MessageCircle, Edit2
} from 'lucide-react'
import BarcodeScanner from '@/components/ui/BarcodeScanner'
import { exportSalePDF, shareSalePDF, buildProductPhotos } from '@/lib/pdf'
import { shareViaWeChat } from '@/lib/share'
import { thermalPrinter, printReceiptHTML } from '@/lib/thermalPrinter'
import type { SaleItem, Product, Sale, Customer } from '@/types'
import type { ProductStock } from '@/engine/types'
import { useAppStore } from '@/stores/appStore'
import { processSale } from '@/engine/operations'
import { useSalePayment, ensureCustomer } from './salePayment'
import { SalePaymentPanel } from './SalePaymentPanel'
import UnitPriceModal from '@/components/pos/UnitPriceModal'
import { CreditSaleEditModal } from '@/components/credit/CreditSaleModals'

type PriceMode = 'detail' | 'gros'

export default function POSPage() {
  const businessId = useBusinessId()
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const allCustomers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const categories = useLiveQuery(() => db.categories.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const allStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const settings = useLiveQuery(() => db.settings.get('default'), [])

  const shopLocation = useLiveQuery(() => db.locations.where('businessId').equals(businessId).filter(l => l.type === 'shop').first(), [businessId])
  const shopId = shopLocation?.id || ''

  const userId = useAppStore(s => s.user?.id || '')
  const shopStocks = useMemo(() => {
    const map = new Map<string, ProductStock>()
    allStocks.forEach((s: any) => {
      if (s.locationId === shopId) map.set(s.productId, s as ProductStock)
    })
    return map
  }, [allStocks, shopId])

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [priceMode, setPriceMode] = useState<PriceMode>('gros')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  const [cart, setCart] = useState<SaleItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16))

  const [saleSuccess, setSaleSuccess] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [editSaleId, setEditSaleId] = useState<string | null>(null)

  const [unitPriceModal, setUnitPriceModal] = useState<{ product: Product; unitName: string; itemKey?: string } | null>(null)


  const filteredCategories = useMemo(() => {
    const ids = new Set(products.map(p => p.categoryId).filter(Boolean))
    return categories.filter((c: any) => ids.has(c.id))
  }, [categories, products])

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.barcode?.includes(q) && !p.reference?.toLowerCase().includes(q)) return false
      }
      if (categoryId !== 'all' && p.categoryId !== categoryId) return false
      return true
    })
  }, [products, search, categoryId])

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [cart])
  const total = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount])
  const pay = useSalePayment(total)
  const margin = useMemo(() => {
    if (subtotal === 0) return 0
    const cost = cart.reduce((s, i) => {
      const p = products.find(pr => pr.id === i.productId)
      const mainQty = i.quantity * (i.unitQuantity || 1)
      return s + mainQty * (p?.purchasePrice || 0)
    }, 0)
    return ((subtotal - discount - cost) / (subtotal - discount || 1)) * 100
  }, [cart, subtotal, discount, products])

  function getProductStock(productId: string) {
    return shopStocks.get(productId)?.quantity ?? 0
  }

  function cartItemKey(i: SaleItem) {
    return `${i.productId}::${i.unitName || 'Pièce'}`
  }

  function needsUnitPrice(product: Product, unitName: string) {
    if (unitName === 'Douzaine' && !product.priceDozen) return true
    if (unitName === 'Paquet' && !product.pricePack) return true
    return false
  }

  async function handleUnitPriceConfirm(price: number) {
    if (!unitPriceModal) return
    const { product, unitName, itemKey } = unitPriceModal
    await db.products.update(product.id, unitName === 'Douzaine' ? { priceDozen: price } : { pricePack: price })
    setUnitPriceModal(null)
    if (itemKey) {
      const unit = getProductUnits(product).find(u => u.name === unitName)
      if (!unit) return
      setCart(prev => prev.map(i =>
        cartItemKey(i) === itemKey
          ? { ...i, unitName, unitQuantity: unit.quantity, unitPrice: price, total: i.quantity * price - i.discount }
          : i
      ))
    } else {
      addToCart(product, unitName, price)
    }
  }

  function addToCart(product: Product, unitName?: string, priceOverride?: number) {
    const units = getProductUnits(product)
    const unit = units.find(u => u.name === unitName) || units[0]
    if (priceOverride === undefined && needsUnitPrice(product, unit.name)) {
      setUnitPriceModal({ product, unitName: unit.name })
      return
    }
    const unitQty = unit.quantity
    const effectivePrice = priceOverride ?? (priceMode === 'gros'
      ? (product.wholesalePrice || getUnitPrice(product, unit.name))
      : getUnitPrice(product, unit.name))

    setCart(prev => {
      const key = `${product.id}::${unit.name}`
      const stock = getProductStock(product.id)
      const existing = prev.find(i => cartItemKey(i) === key)
      if (existing) {
        const step = getUnitStep(unit.name)
        const newQty = +(existing.quantity + step).toFixed(1)
        const neededPieces = newQty * unitQty
        if (neededPieces > stock) { toast('Stock insuffisant', 'error'); return prev }
        return prev.map(i =>
          cartItemKey(i) === key
            ? { ...i, quantity: newQty, total: newQty * effectivePrice - i.discount }
            : i
        )
      }
      const neededPieces = 1 * unitQty
      if (neededPieces > stock) { toast('Stock insuffisant', 'error'); return prev }
      return [{
        productId: product.id, productName: product.name,
        quantity: 1, unitPrice: effectivePrice, discount: 0, taxRate: product.taxRate,
        total: effectivePrice, unitName: unit.name, unitQuantity: unitQty,
      }, ...prev]
    })
  }

  function addToCartWithUnit(product: Product, e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    addToCart(product, val)
    e.target.value = '__main__'
  }

function updateQuantity(itemKey: string, delta: number) {
  setCart(prev => prev.map(i => {
    if (cartItemKey(i) !== itemKey) return i
    const step = getUnitStep(i.unitName || 'Pièce')
    const minQty = getUnitMinQty(i.unitName || 'Pièce')
    const newQty = Math.max(minQty, +(i.quantity + delta).toFixed(1))
    return { ...i, quantity: newQty, total: newQty * i.unitPrice - i.discount }
  }))
}

  function updateCartUnit(itemKey: string, newUnitName: string) {
    const item = cart.find(i => cartItemKey(i) === itemKey)
    const product = item ? products.find(p => p.id === item.productId) : undefined
    if (product && needsUnitPrice(product, newUnitName)) {
      setUnitPriceModal({ product, unitName: newUnitName, itemKey })
      return
    }
    setCart(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      if (!product) return i
      const units = getProductUnits(product)
      const unit = units.find(u => u.name === newUnitName)
      if (!unit) return i
      const newUnitPrice = priceMode === 'gros'
        ? (product.wholesalePrice || getUnitPrice(product, newUnitName))
        : getUnitPrice(product, newUnitName)
      return {
        ...i,
        unitName: newUnitName,
        unitQuantity: unit.quantity,
        unitPrice: newUnitPrice,
        total: i.quantity * newUnitPrice - i.discount,
      }
    }))
  }

  function updateCartPrice(itemKey: string, newPrice: number) {
    setCart(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      return {
        ...i,
        unitPrice: newPrice,
        total: i.quantity * newPrice - i.discount,
      }
    }))
  }

  function removeFromCart(itemKey: string) {
    setCart(prev => prev.filter(i => cartItemKey(i) !== itemKey))
  }

  function clearCart() {
    setCart([])
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setCustomerId('')
    setDiscount(0)
    pay.reset()
    setCartOpen(false)
  }

  function handleBarcodeScan(code: string) {
    const product = products.find(p => p.barcode === code)
    if (product) {
      addToCart(product)
      setSearch('')
      toast('Produit scanné : ' + product.name, 'success')
    } else {
      setSearch(code)
    }
  }

  async function handleSale() {
    if (cart.length === 0) return
    if (pay.isCredit && !customerId && !customerName.trim()) {
      toast('Client requis pour une vente à crédit', 'error')
      return
    }
    if (pay.paymentType === 'complet' && pay.payMethod === 'cash' && pay.isShort) {
      toast('Montant reçu insuffisant', 'error')
      return
    }

    const resolved = await ensureCustomer({
      businessId,
      name: customerName,
      phone: customerPhone,
      address: customerAddress,
      customerId,
      allCustomers,
    })
    const customer = allCustomers.find(c => c.id === resolved.id)
    const invNum = generateInvoiceNumber(settings?.invoicePrefix || 'INV-', settings?.invoiceNextNumber || 1)

    const sale: Sale = {
      id: generateId(),
      businessId,
      locationId: shopId,
      invoiceNumber: invNum,
      customerId: resolved.id,
      customerName: customer?.name || resolved.name || customerName,
      items: cart,
      subtotal,
      discountTotal: discount,
      taxTotal: 0,
      total,
      paid: pay.paid,
      change: pay.change,
      paymentMethod: pay.creditAmount > 0 ? 'credit' : pay.payMethod,
      status: 'completed',
      createdAt: saleDate,
      userId,
    }

    await processSale(sale, { downPaymentMethod: pay.payMethod, dueDate: pay.dueDate || undefined })

    if (settings) {
      const nextNum = (settings.invoiceNextNumber || 1) + 1
      await db.settings.update('default', { invoiceNextNumber: nextNum })
    }

    setLastSale(sale)
    setSaleSuccess(true)
  }

  const currency = formatCurrency

  return (
    <div className="w-full h-full flex flex-col gap-0">
      <div className="flex-1 flex gap-0 overflow-hidden bg-white">
        {/* ── LEFT: Catalogue ── */}
        <div className="flex-[2] flex flex-col min-w-0 lg:border-r border-surface-200">
          {/* Toolbar */}
          <div className="p-4 border-b border-surface-200 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  autoFocus
                  type="text" placeholder="Rechercher un produit..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                className="p-2.5 rounded-xl bg-white border border-surface-300 text-surface-400 hover:text-primary-600 hover:border-primary-300 transition-colors"
                title="Scanner"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex-1 rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Toutes catégories</option>
                {filteredCategories.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div className="flex rounded-xl bg-surface-100 border border-surface-200 overflow-hidden">
                <button
                  onClick={() => setPriceMode('detail')}
                  className={cn(
                    'px-3 py-2 text-xs font-medium transition-colors',
                    priceMode === 'detail' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700'
                  )}
                >
                  Détail
                </button>
                <button
                  onClick={() => setPriceMode('gros')}
                  className={cn(
                    'px-3 py-2 text-xs font-medium transition-colors',
                    priceMode === 'gros' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700'
                  )}
                >
                  Gros
                </button>
              </div>
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((p) => {
                const stock = getProductStock(p.id)
                const isOut = stock <= 0
                const units = getProductUnits(p)
                const displayPrice = priceMode === 'gros' ? (p.wholesalePrice || p.sellingPrice) : p.sellingPrice
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'relative rounded-xl border p-3 transition-all bg-white',
                      isOut
                        ? 'border-surface-200 bg-surface-50 opacity-50'
                        : 'border-surface-200 hover:border-primary-300 hover:shadow-md'
                    )}
                  >
                    <button onClick={() => !isOut && addToCart(p)} className="w-full text-left">
                      <div className="w-full aspect-square bg-surface-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                        {p.photos?.[0] ? (
                          <img src={p.photos[0]} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-8 h-8 text-surface-300" />
                        )}
                      </div>
                      {isOut && (
                        <span className="absolute top-4 left-4 px-2 py-0.5 rounded-md bg-red-500/90 text-[10px] font-semibold text-white">
                          Rupture
                        </span>
                      )}
                      <p className="text-xs font-medium text-surface-900 truncate leading-tight">{p.name}</p>
                      <p className="text-sm font-bold text-primary-600 mt-0.5">{currency(displayPrice)}</p>
                      <p className={cn(
                        'text-[10px] mt-0.5',
                        isOut ? 'text-red-500' : stock <= (p.stockAlert || 5) ? 'text-amber-600' : 'text-surface-400'
                      )}>
                        Stock: {stock} pièces
                      </p>
                    </button>
                    {!isOut && units.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {units.map(u => {
                          const unitPrice = getUnitPrice(p, u.name)
                          return (
                            <button
                              key={u.name}
                              onClick={() => addToCart(p, u.name)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 hover:bg-primary-100 hover:text-primary-600 transition-colors"
                              title={needsUnitPrice(p, u.name) ? `1 ${u.name} = ${u.quantity} pièces (prix non défini)` : `1 ${u.name} = ${u.quantity} pièces (${currency(unitPrice)})`}
                            >
                              1 {u.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-surface-400">
                  <Package className="w-12 h-12 mb-3 text-surface-300" />
                  <p className="text-sm">Aucun produit trouvé</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Panier & Paiement (redesign mobile) ── */}
        <div className={cn(
          'flex-1 flex flex-col min-w-0 bg-surface-50',
          'lg:flex',
          'fixed inset-0 z-50',
          'lg:static lg:inset-auto lg:z-auto',
          cartOpen ? 'flex' : 'hidden',
        )}>
          {/* Fixed header */}
          <div className="shrink-0 px-4 py-3 bg-white border-b border-surface-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setCartOpen(false)} className="lg:hidden p-1.5 -ml-1 rounded-lg hover:bg-surface-100 text-surface-500 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h2 className="text-base font-bold text-surface-900">Panier <span className="text-surface-400 font-normal">({cart.length})</span></h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-surface-100 border border-surface-200 overflow-hidden">
                <button onClick={() => setPriceMode('detail')} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', priceMode === 'detail' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700')}>Détail</button>
                <button onClick={() => setPriceMode('gros')} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', priceMode === 'gros' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700')}>Gros</button>
              </div>
              {cart.length > 0 && (
                <button onClick={clearCart} className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-red-500 transition-colors" title="Vider le panier">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Customer (collapsible, closed by default) */}
          <div className="shrink-0 px-4 pt-2 pb-1 bg-white border-b border-surface-100">
            <button onClick={() => setCustomerOpen(!customerOpen)} className="flex items-center justify-between w-full text-left py-1">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-surface-500">Client</span>
                {customerName ? <span className="text-surface-900 font-medium truncate max-w-[160px]">{customerName}</span> : <span className="text-surface-400">(optionnel)</span>}
              </div>
              <ChevronDown className={cn('w-4 h-4 text-surface-400 transition-transform', customerOpen && 'rotate-180')} />
            </button>
            {customerOpen && (
              <div className="mt-2 space-y-2 pb-2">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom du client"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                    <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Téléphone"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <button type="button" onClick={async () => { const c = await pickContact(); if (c) { setCustomerName(c.name); setCustomerPhone(c.tel); toast('Contact importé', 'success') } }}
                    className="p-2 rounded-lg bg-surface-50 border border-surface-300 text-surface-500 hover:text-primary-600" title="Importer">
                    <ContactIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Adresse"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
            )}
          </div>

          {/* Scrollable cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {cart.map((item) => {
              const key = cartItemKey(item)
              const product = products.find(p => p.id === item.productId)
              const units = product ? getProductUnits(product) : []
              return (
                <div key={key} className="bg-white border border-surface-200 rounded-2xl p-4 shadow-sm relative">
                  <button onClick={() => removeFromCart(key)}
                    className="absolute top-3 right-3 p-1 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 transition-colors z-10">
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex gap-3 items-start">
                    <div className="w-12 h-12 rounded-xl bg-surface-50 flex items-center justify-center overflow-hidden shrink-0 border border-surface-100">
                      {product?.photos?.[0] ? (
                        <img src={product.photos[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-surface-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-surface-900 leading-tight">{item.productName}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <select value={item.unitName || 'Pièce'} onChange={(e) => updateCartUnit(key, e.target.value)}
                          className="text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-surface-600 focus:outline-none">
                          {units.map(u => (<option key={u.name} value={u.name}>{u.name}</option>))}
                        </select>
                        <span className="text-xs text-surface-300">×</span>
                        <input type="number" min={getUnitMinQty(item.unitName || 'Pièce')} step={getUnitStep(item.unitName || 'Pièce')}
                          value={item.quantity}
                          onChange={(e) => {
                            const minQty = getUnitMinQty(item.unitName || 'Pièce')
                            const q = Math.max(minQty, Number(e.target.value) || minQty)
                            setCart(prev => prev.map(i => cartItemKey(i) === key ? { ...i, quantity: q, total: q * i.unitPrice - i.discount } : i))
                          }}
                          className="w-14 text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-center focus:outline-none" />
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[11px] text-surface-400">PU:</span>
                        <input type="number" min="0" step="1" value={item.unitPrice}
                          onChange={(e) => updateCartPrice(key, Math.max(0, Number(e.target.value) || 0))}
                          className="w-16 text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-right focus:outline-none" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => updateQuantity(key, -1)} className="w-9 h-9 rounded-xl bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 active:bg-surface-300 transition-colors">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-10 text-center text-base font-bold text-surface-900">{item.quantity.toLocaleString('fr-FR')}</span>
                    <button onClick={() => updateQuantity(key, 1)} className="w-9 h-9 rounded-xl bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 active:bg-surface-300 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="ml-auto text-lg font-bold text-primary-600">{currency(item.total)}</span>
                  </div>
                </div>
              )
            })}
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-surface-400 py-16">
                <ShoppingCart className="w-14 h-14 mb-4 text-surface-300" />
                <p className="text-sm font-medium">Panier vide</p>
                <p className="text-xs text-surface-400 mt-1">Cliquez sur un produit</p>
              </div>
            )}
          </div>

          {/* Summary section (compact) */}
          <div className="shrink-0 bg-white border-t border-surface-200">
            {cart.length > 0 && (
              <div className="flex gap-2 px-4 pt-3 pb-2">
                <div className="flex-1 bg-primary-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-primary-600">{cart.length}</p>
                  <p className="text-[10px] text-primary-400 font-medium">Articles</p>
                </div>
                <div className="flex-1 bg-surface-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-surface-700">{cart.reduce((s, i) => s + i.quantity, 0)}</p>
                  <p className="text-[10px] text-surface-400 font-medium">Qté</p>
                </div>
                <div className="flex-1 bg-emerald-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-emerald-600">{currency(total)}</p>
                  <p className="text-[10px] text-emerald-400 font-medium">Total</p>
                </div>
              </div>
            )}
            <div className="px-4 pb-1 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-surface-500">Sous-total</span>
                <span className="text-surface-900 font-medium">{currency(subtotal)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input type="number" min="0" value={discount || ''}
                    onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Remise (FCFA)"
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <span className="text-xs text-surface-400">Remise</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-xs text-surface-400">Marge</span>
                <span className={cn('text-xs font-medium', margin >= 20 ? 'text-emerald-600' : margin >= 10 ? 'text-amber-600' : 'text-red-600')}>{margin.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Payment type */}
          <SalePaymentPanel pay={pay} customerName={customerName} total={total} />

          {/* Fixed bottom bar */}
          <div className="shrink-0 bg-white border-t border-surface-200 px-4 pt-3 pb-3 space-y-2" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 16px))' }}>
            <button onClick={handleSale} disabled={cart.length === 0 || pay.isShort}
              className={cn(
                'w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
                cart.length > 0
                  ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-200 active:scale-[0.98]'
                  : 'bg-surface-100 text-surface-400 cursor-not-allowed'
              )}>
              <CreditCard className="w-5 h-5" />
              Valider ({currency(total)})
            </button>
            <div className="flex gap-2">
              <button onClick={async () => {
                const customer = allCustomers.find(c => c.id === customerId)
                const saleData = { invoiceNumber: generateInvoiceNumber(settings?.invoicePrefix || 'INV-', settings?.invoiceNextNumber || 1), items: cart.map(i => ({ productName: i.productName, quantity: i.quantity, unitName: i.unitName, unitPrice: i.unitPrice, total: i.total })), total, paid: pay.paid, change: pay.change, customerName: customer?.name || customerName, createdAt: saleDate, paymentMethod: pay.creditAmount > 0 ? 'credit' : pay.payMethod }
                try { const connected = thermalPrinter.isConnected() || await thermalPrinter.connect()
                  if (connected) { await thermalPrinter.printReceipt([{ text: 'NEOX ERP', bold: true, doubleWidth: true, align: 'center' }, { text: 'Facture de vente', align: 'center' }, { text: '---' }, ...cart.map(i => ({ text: `${i.productName} x${i.quantity}  ${currency(i.total)}` })), { text: '---' }, { text: `Total: ${currency(total)}`, bold: true, align: 'right' }, { text: '', align: 'center' }, { text: 'Merci de votre visite !', align: 'center' }]); await thermalPrinter.cut(); toast('Ticket imprimé', 'success'); return }
                } catch {}
                printReceiptHTML(saleData, settings?.name)
              }} disabled={cart.length === 0}
                className={cn('flex-1 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border border-surface-200', cart.length > 0 ? 'bg-white text-surface-700 hover:bg-surface-50' : 'bg-surface-50 text-surface-300 cursor-not-allowed')}>
                <Printer className="w-3.5 h-3.5" /> Ticket
              </button>
              <button onClick={async () => { if (lastSale) exportSalePDF(lastSale, settings, await buildProductPhotos(products)) }} disabled={cart.length === 0}
                className={cn('flex-1 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border border-surface-200', cart.length > 0 ? 'bg-white text-surface-700 hover:bg-surface-50' : 'bg-surface-50 text-surface-300 cursor-not-allowed')}>
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white text-surface-600 text-xs cursor-pointer" onClick={() => (document.getElementById('saleDateInput') as HTMLInputElement)?.showPicker?.()}>
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{new Date(saleDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <input type="datetime-local" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} id="saleDateInput" className="w-0 h-0 opacity-0 absolute pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: backdrop when cart open */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setCartOpen(false)} />
      )}

      {/* Mobile: floating cart button */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 p-4 safe-area-bottom pointer-events-none">
          <button onClick={() => setCartOpen(true)} className="pointer-events-auto w-full py-3.5 rounded-xl bg-primary-600 text-white font-bold shadow-lg shadow-primary-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
            Panier ({cart.length}) &middot; {currency(total)}
          </button>
        </div>
      )}

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />

      <UnitPriceModal
        open={!!unitPriceModal}
        productName={unitPriceModal?.product.name || ''}
        unitName={unitPriceModal?.unitName || ''}
        suggestedPrice={unitPriceModal ? Math.round(unitPriceModal.product.sellingPrice * (unitPriceModal.unitName === 'Douzaine' ? 12 : (unitPriceModal.product.packSize || 1))) : 0}
        onConfirm={handleUnitPriceConfirm}
        onClose={() => setUnitPriceModal(null)}
      />

      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in p-4">          <div className="relative text-center py-8 px-6 bg-white rounded-[20px] border border-surface-200 shadow-2xl animate-slide-up w-[95%] sm:w-[90%] md:w-[640px] max-w-[640px] max-h-[95vh] md:max-h-[820px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setSaleSuccess(false); clearCart() }} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-100 text-surface-400">
              <X className="w-5 h-5" />
            </button>
            <div className="w-14 h-14 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-success" />
            </div>
            <p className="text-lg font-bold text-surface-900">Vente confirmée !</p>
            <p className="text-sm text-surface-500 mt-1">{currency(total)}</p>
            <div className="flex flex-col gap-3 mt-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={async () => { if (lastSale) { exportSalePDF(lastSale, settings, await buildProductPhotos(products)); toast('PDF téléchargé', 'success') } }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
                >
                  <Download className="w-5 h-5" /> PDF
                </button>
                <button
                  onClick={async () => {
                    if (!lastSale) return
                    try {
                      const connected = thermalPrinter.isConnected() || await thermalPrinter.connect()
                      if (connected) {
                        await thermalPrinter.printReceipt([
                          { text: 'NEOX ERP', bold: true, doubleWidth: true, align: 'center' },
                          { text: 'Facture de vente', align: 'center' },
                          { text: '---' },
                          ...lastSale.items.map(i => ({ text: `${i.productName} x${i.quantity}  ${currency(i.total)}` })),
                          { text: '---' },
                          { text: `Total: ${currency(lastSale.total)}`, bold: true, align: 'right' },
                          { text: '', align: 'center' },
                          { text: 'Merci de votre visite !', align: 'center' }
                        ])
                        await thermalPrinter.cut()
                        toast('Ticket imprimé', 'success')
                        return
                      }
                    } catch {}
                    printReceiptHTML(lastSale, settings?.name)
                  }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
                >
                  <Printer className="w-5 h-5" /> Imprimer
                </button>
                <button
                  onClick={async () => { if (lastSale) { shareSalePDF(lastSale, settings, await buildProductPhotos(products)); toast('Partage en cours...', 'success') } }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
                >
                  <Send className="w-5 h-5" /> WhatsApp
                </button>
                <button
                  onClick={() => { if (lastSale) shareViaWeChat(`Facture ${lastSale.invoiceNumber} — ${lastSale.customerName || 'Client divers'}\nTotal: ${currency(lastSale.total)}\nPayé: ${currency(lastSale.paid)}\nRestant: ${currency(lastSale.total - lastSale.paid)}`, `Facture ${lastSale.invoiceNumber}`) }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" /> WeChat
                </button>
                <button
                  onClick={() => { if (lastSale) setEditSaleId(lastSale.id) }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-amber-200 text-amber-700 text-xs font-medium hover:bg-amber-50 transition-colors"
                >
                  <Edit2 className="w-5 h-5" /> Modifier la vente
                </button>
              </div>
              <button
                onClick={() => { setSaleSuccess(false); clearCart() }}
                className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-500 transition-colors"
              >
                Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      )}

      <CreditSaleEditModal
        open={editSaleId !== null}
        onClose={() => setEditSaleId(null)}
        saleId={editSaleId || undefined}
        onSaved={() => { setEditSaleId(null); setSaleSuccess(false); clearCart() }}
      />
    </div>
  )
}
