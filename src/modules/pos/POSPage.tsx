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
  Check, SplitSquareVertical as SplitIcon, Banknote, Boxes, Contact as ContactIcon
} from 'lucide-react'
import BarcodeScanner from '@/components/ui/BarcodeScanner'
import SplitPaymentModal from '@/components/pos/SplitPaymentModal'
import CreditPaymentModal from '@/components/pos/CreditPaymentModal'
import { exportSalePDF } from '@/lib/pdf'
import { thermalPrinter } from '@/lib/thermalPrinter'
import type { SaleItem, Product, Sale, Customer } from '@/types'
import type { ProductStock } from '@/engine/types'
import type { SplitPayment } from '@/components/pos/SplitPaymentModal'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { processSale } from '@/engine/operations'

type PriceMode = 'detail' | 'gros'
type PaymentType = 'complet' | 'credit' | 'partiel'
type PayMethod = 'cash' | 'mobile' | 'card' | 'bank'

export default function POSPage() {
  const isCloud = isSupabaseConfigured()
  const businessId = useBusinessId()
  const dexieProducts = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const { data: supabaseProducts } = useSupabaseQuery<Product>('products', undefined, [])
  const products = (isCloud ? supabaseProducts : dexieProducts) || []

  const dexieCustomers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId])
  const { data: supabaseCustomers } = useSupabaseQuery<Customer>('customers', undefined, [])
  const allCustomers = (isCloud ? supabaseCustomers : dexieCustomers) || []

  const dexieCategories = useLiveQuery(() => db.categories.where('businessId').equals(businessId).toArray(), [businessId])
  const { data: supabaseCategories } = useSupabaseQuery<any>('categories', undefined, [])
  const categories = (isCloud ? supabaseCategories : dexieCategories) || []

  const dexieStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const { data: supabaseStocks } = useSupabaseQuery<any>('product_stocks', undefined, [])
  const allStocks = (isCloud ? supabaseStocks : dexieStocks) || ([] as ProductStock[])

  const dexieSettings = useLiveQuery(() => db.settings.get('default'), [])
  const { data: supabaseSettingsRaw } = useSupabaseQuery<any>('settings', undefined, [])
  const settings = isCloud ? (supabaseSettingsRaw || []).find((s: any) => s.id === 'default') : dexieSettings

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
  const [priceMode, setPriceMode] = useState<PriceMode>('detail')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)

  const [cart, setCart] = useState<SaleItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [discount, setDiscount] = useState(0)
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16))
  const [paymentType, setPaymentType] = useState<PaymentType>('complet')
  const [payMethod, setPayMethod] = useState<PayMethod>('cash')

  const [saleSuccess, setSaleSuccess] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)
  const [splitPayments, setSplitPayments] = useState<SplitPayment[]>([])

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

  function addToCart(product: Product, unitName?: string) {
    const units = getProductUnits(product)
    const unit = units.find(u => u.name === unitName) || units[0]
    const unitQty = unit.quantity
    const effectivePrice = priceMode === 'gros'
      ? (product.wholesalePrice || getUnitPrice(product, unit.name))
      : getUnitPrice(product, unit.name)

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
    setCart(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      const product = products.find(p => p.id === i.productId)
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

  async function handleSale(payments?: SplitPayment[], paidAmount?: number) {
    if (cart.length === 0) return
    if (!customerName) { toast('Nom du client requis', 'warning'); return }

    const now = new Date().toISOString()
    const customer = allCustomers.find(c => c.id === customerId)
    const invNum = generateInvoiceNumber(settings?.invoicePrefix || 'INV-', settings?.invoiceNextNumber || 1)

    const sale: Sale = {
      id: generateId(),
      businessId,
      locationId: shopId,
      invoiceNumber: invNum,
      customerId: customerId || undefined,
      customerName: customer?.name || customerName,
      items: cart,
      subtotal,
      discountTotal: discount,
      taxTotal: 0,
      total,
      paid: paymentType === 'credit' ? (paidAmount || 0) : (paidAmount || total),
      change: paidAmount ? Math.max(0, paidAmount - total) : 0,
      paymentMethod: paymentType === 'credit' ? 'credit' : (payments ? 'split' : (payMethod === 'cash' ? 'cash' : payMethod === 'mobile' ? 'mobile' : 'card')),
      splitPayments: payments,
      status: 'completed',
      createdAt: now,
      userId,
    }

    await processSale(sale)

    if (settings) {
      const nextNum = (settings.invoiceNextNumber || 1) + 1
      if (isCloud) { await sb.update('settings', 'default', { invoiceNextNumber: nextNum } as any) } else { await db.settings.update('default', { invoiceNextNumber: nextNum }) }
    }

    setLastSale(sale)
    setSaleSuccess(true)
    setTimeout(() => { setSaleSuccess(false); clearCart() }, 2500)
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
                          <img src={p.photos[0]} alt="" className="w-full h-full object-cover" />
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
                              title={`1 ${u.name} = ${u.quantity} pièces (${currency(unitPrice)})`}
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

        {/* ── RIGHT: Panier & Paiement ── */}
        <div className={cn(
          'flex-1 flex flex-col bg-surface-50 min-w-0',
          'lg:flex',
          'fixed inset-y-0 right-0 z-50 w-full max-w-md shadow-2xl',
          'lg:static lg:inset-auto lg:z-auto lg:w-auto lg:shadow-none lg:translate-x-0',
          cartOpen ? 'flex' : 'hidden',
          'transition-transform duration-300',
          cartOpen ? 'translate-x-0' : 'translate-x-full',
        )}>
          {/* Header */}
          <div className="px-4 py-4 border-b border-surface-200 bg-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setCartOpen(false)} className="lg:hidden p-1 -ml-1 rounded-lg hover:bg-surface-100 text-surface-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h2 className="text-sm font-semibold text-surface-900">Panier ({cart.length})</h2>
              </div>
              {cart.length > 0 && (
                <button onClick={clearCart} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex rounded-lg bg-surface-100 border border-surface-200 overflow-hidden w-fit">
              <button
                onClick={() => setPriceMode('detail')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  priceMode === 'detail' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700'
                )}
              >
                Détail
              </button>
              <button
                onClick={() => setPriceMode('gros')}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  priceMode === 'gros' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700'
                )}
              >
                Gros
              </button>
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cart.map((item) => {
              const key = cartItemKey(item)
              const product = products.find(p => p.id === item.productId)
              const units = product ? getProductUnits(product) : []
              return (
                <div key={key} className="flex items-center gap-2 p-3 rounded-xl bg-white border border-surface-200 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{item.productName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <select
                        value={item.unitName || 'Pièce'}
                        onChange={(e) => updateCartUnit(key, e.target.value)}
                        className="text-[10px] rounded border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-600 focus:outline-none"
                      >
                        {units.map(u => (
                          <option key={u.name} value={u.name}>{u.name}</option>
                        ))}
                      </select>
                      <span className="text-[10px] text-surface-400">×</span>
                      <input
                        type="number"
                        min={getUnitMinQty(item.unitName || 'Pièce')}
                        step={getUnitStep(item.unitName || 'Pièce')}
                        value={item.quantity}
                        onChange={(e) => {
                          const minQty = getUnitMinQty(item.unitName || 'Pièce')
                          const q = Math.max(minQty, Number(e.target.value) || minQty)
                          setCart(prev => prev.map(i =>
                            cartItemKey(i) === key
                              ? { ...i, quantity: q, total: q * i.unitPrice - i.discount }
                              : i
                          ))
                        }}
                        className="w-14 text-[10px] rounded border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-center focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-surface-400">Prix:</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={item.unitPrice}
                        onChange={(e) => updateCartPrice(key, Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 text-[10px] rounded border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-right focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateQuantity(key, -1)} className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 hover:text-surface-700 transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-10 text-center text-sm font-medium text-surface-900">{item.quantity.toLocaleString('fr-FR')}</span>
                    <button onClick={() => updateQuantity(key, 1)} className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 hover:text-surface-700 transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-surface-900 w-20 text-right">{currency(item.total)}</p>
                  <button onClick={() => removeFromCart(key)} className="p-1 text-surface-300 hover:text-red-500 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-surface-400 py-12">
                <ShoppingCart className="w-12 h-12 mb-3 text-surface-300" />
                <p className="text-sm">Cliquez sur un produit</p>
                <p className="text-xs text-surface-400">pour ajouter au panier</p>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="px-4 py-3 border-t border-surface-200 bg-white space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Sous-total</span>
              <span className="text-surface-900 font-medium">{currency(subtotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                <input
                  type="number" min="0" value={discount || ''}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Remise (FCFA)"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <span className="text-xs text-surface-400">Remise</span>
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span className="text-surface-900">Total</span>
              <span className="text-primary-600">{currency(total)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-surface-400">Marge</span>
              <span className={cn('font-medium', margin >= 20 ? 'text-success' : margin >= 10 ? 'text-warning' : 'text-danger')}>
                {margin.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Customer */}
          <div className="px-4 py-3 border-t border-surface-200 bg-white space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nom du client *"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Adresse client"
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Téléphone client"
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button type="button" onClick={async () => {
                const c = await pickContact()
                if (c) { setCustomerName(c.name); setCustomerPhone(c.tel); toast('Contact importé', 'success') }
              }} className="p-2.5 rounded-xl bg-surface-50 border border-surface-300 text-surface-500 hover:text-primary-600 hover:border-primary-300" title="Importer depuis contacts">
                <ContactIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Payment */}
          <div className="px-4 py-3 border-t border-surface-200 bg-white space-y-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="datetime-local"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex rounded-xl bg-surface-100 border border-surface-200 overflow-hidden">
              {(['complet', 'credit', 'partiel'] as PaymentType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPaymentType(t)}
                  className={cn(
                    'flex-1 px-3 py-2 text-xs font-medium transition-colors',
                    paymentType === t ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700'
                  )}
                >
                  {t === 'complet' ? 'Complet' : t === 'credit' ? 'Crédit' : 'Partiel'}
                </button>
              ))}
            </div>

            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PayMethod)}
              className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="cash">Espèces</option>
              <option value="mobile">Mobile Money</option>
              <option value="card">Carte</option>
              <option value="bank">Virement</option>
            </select>
          </div>

          {/* Validate */}
          <div className="px-4 py-3 border-t border-surface-200 bg-white space-y-2">
            <button
              onClick={() => {
                if (!customerName) { toast('Nom du client requis', 'warning'); return }
                if (paymentType === 'credit') { setCreditOpen(true); return }
                if (paymentType === 'partiel') { setSplitOpen(true); return }
                handleSale()
              }}
              disabled={cart.length === 0}
              className={cn(
                'w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
                cart.length > 0
                  ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-200 active:scale-[0.98]'
                  : 'bg-surface-100 text-surface-400 cursor-not-allowed'
              )}
            >
              <CreditCard className="w-4 h-4" />
              Valider ({currency(total)})
            </button>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  try {
                    const connected = thermalPrinter.isConnected() || await thermalPrinter.connect()
                    if (connected) {
                      await thermalPrinter.printReceipt([
                        { text: 'NEOX ERP', bold: true, doubleWidth: true, align: 'center' },
                        { text: 'Facture de vente', align: 'center' },
                        { text: '---' },
                        ...cart.map(i => ({ text: `${i.productName} x${i.quantity}  ${currency(i.total)}` })),
                        { text: '---' },
                        { text: `Total: ${currency(total)}`, bold: true, align: 'right' },
                        { text: '', align: 'center' },
                        { text: 'Merci de votre visite !', align: 'center' },
                      ])
                      await thermalPrinter.cut()
                      toast('Ticket imprimé', 'success')
                    }
                  } catch { toast('Imprimante non connectée', 'warning') }
                }}
                disabled={cart.length === 0}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border border-surface-200',
                  cart.length > 0
                    ? 'bg-white text-surface-700 hover:bg-surface-50'
                    : 'bg-surface-50 text-surface-300 cursor-not-allowed'
                )}
              >
                <Printer className="w-4 h-4" /> Ticket
              </button>
              <button
                onClick={() => { if (lastSale) exportSalePDF(lastSale, settings) }}
                disabled={cart.length === 0}
                className={cn(
                  'flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border border-surface-200',
                  cart.length > 0
                    ? 'bg-white text-surface-700 hover:bg-surface-50'
                    : 'bg-surface-50 text-surface-300 cursor-not-allowed'
                )}
              >
                <Download className="w-4 h-4" /> PDF
              </button>
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
      <CreditPaymentModal open={creditOpen} onClose={() => setCreditOpen(false)} customerId={customerId} onPaymentComplete={() => { setCreditOpen(false); handleSale() }} />
      <SplitPaymentModal open={splitOpen} onClose={() => setSplitOpen(false)} total={total} onConfirm={(payments) => { setSplitOpen(false); handleSale(payments, payments.reduce((s, p) => s + p.amount, 0)) }} />

      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={() => { setSaleSuccess(false); clearCart() }}>
          <div className="text-center py-12 px-8 bg-white rounded-2xl border border-surface-200 shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-success" />
            </div>
            <p className="text-xl font-bold text-surface-900">Vente confirmée !</p>
            <p className="text-sm text-surface-500 mt-1">{currency(total)}</p>
            <div className="flex gap-2 mt-6 justify-center">
              <button
                onClick={() => { if (lastSale) exportSalePDF(lastSale, settings) }}
                className="px-4 py-2 rounded-xl border border-surface-200 text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Reçu PDF
              </button>
              <button
                onClick={() => { setSaleSuccess(false); clearCart() }}
                className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors"
              >
                Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
