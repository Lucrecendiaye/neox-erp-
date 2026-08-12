import { useState, useMemo } from 'react'
import { Button, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { cn, formatCurrency, generateId, generateInvoiceNumber, getProductUnits, getUnitPrice, getUnitStep, getUnitMinQty, pickContact } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { processSale } from '@/engine/operations'
import { exportSalePDF, shareSalePDF, buildProductPhotos } from '@/lib/pdf'
import { shareViaWeChat } from '@/lib/share'
import { thermalPrinter, printReceiptHTML } from '@/lib/thermalPrinter'
import {
  ShoppingCart, Plus, Minus, Trash2, Search, Package, X,
  CreditCard, Printer, Download, Tag, User, Phone, MapPin, Calendar,
  Check, Send, ChevronDown, Contact as ContactIcon, MessageCircle, Edit2, Truck
} from 'lucide-react'
import type { Product, Sale } from '@/types'
import { useAppStore } from '@/stores/appStore'
import { useSalePayment, ensureCustomer, ensureSupplier } from '@/modules/pos/salePayment'
import { SalePaymentPanel } from '@/modules/pos/SalePaymentPanel'
import UnitPriceModal from '@/components/pos/UnitPriceModal'
import MobileCartSheet from '@/components/pos/MobileCartSheet'
import PaymentScreen from '@/components/pos/PaymentScreen'
import { CreditSaleEditModal } from '@/components/credit/CreditSaleModals'
import { usePermission } from '@/hooks/usePermission'

interface CartItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  unitName: string
  unitQuantity: number
  locationId: string
  locationName: string
  discount: number
}

function cartItemKey(i: CartItem) {
  return `${i.productId}::${i.unitName}::${i.locationId}`
}

type PriceMode = 'detail' | 'gros'

export default function DepotGlobalPOSPage() {
  const businessId = useBusinessId()

  const allProducts = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const allStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])
  const allCustomers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const allSuppliers = useLiveQuery(() => db.suppliers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const dexieSettings = useLiveQuery(() => db.settings.get('default'), [])
  const userId = useAppStore(s => s.user?.id || '')
  const { can } = usePermission()

  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [priceMode, setPriceMode] = useState<PriceMode>('gros')
  const [pickModal, setPickModal] = useState<{ product: Product; unitName: string } | null>(null)
  const [splitModal, setSplitModal] = useState<{ item: CartItem; targetQty: number } | null>(null)
  const [unitPriceModal, setUnitPriceModal] = useState<{ product: Product; unitName: string; itemKey?: string; locationId?: string } | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16))

  const [saleSuccess, setSaleSuccess] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [editSaleId, setEditSaleId] = useState<string | null>(null)

  const locationMap = useMemo(() => new Map(locations?.map(l => [l.id, l])), [locations])

  const stockByProduct = useMemo(() => {
    const map = new Map<string, { locationId: string; locationName: string; quantity: number }[]>()
    allStocks?.forEach(s => {
      if (!map.has(s.productId)) map.set(s.productId, [])
      map.get(s.productId)!.push({
        locationId: s.locationId,
        locationName: locationMap.get(s.locationId)?.name || 'Inconnu',
        quantity: s.quantity,
      })
    })
    return map
  }, [allStocks, locationMap])

  const filteredProducts = allProducts?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  ) || []

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0), [cart])
  const total = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount])
  const pay = useSalePayment(total)
  const margin = useMemo(() => {
    if (subtotal === 0) return 0
    const cost = cart.reduce((s, i) => {
      const p = allProducts?.find(pr => pr.id === i.productId)
      const mainQty = i.quantity * (i.unitQuantity || 1)
      return s + mainQty * (p?.purchasePrice || 0)
    }, 0)
    return ((subtotal - discount - cost) / (subtotal - discount || 1)) * 100
  }, [cart, subtotal, discount, allProducts])

  function needsUnitPrice(p: Product, unitName: string) {
    if ((unitName === 'Douzaine' || unitName === 'Demi-douzaine') && !p.priceDozen) return true
    if ((unitName === 'Paquet' || unitName === 'Demi-paquet') && !p.pricePack) return true
    return false
  }

  async function handleUnitPriceConfirm(price: number) {
    if (!unitPriceModal) return
    const { product, unitName, itemKey, locationId } = unitPriceModal
    const dozen = (unitName === 'Douzaine' || unitName === 'Demi-douzaine')
    const storedPrice = (unitName === 'Demi-douzaine' || unitName === 'Demi-paquet') ? price * 2 : price
    await db.products.update(product.id, dozen ? { priceDozen: storedPrice } : { pricePack: storedPrice })
    setUnitPriceModal(null)
    if (itemKey) {
      const u = getProductUnits(product).find(x => x.name === unitName)
      if (!u) return
      setCart(prev => prev.map(i =>
        cartItemKey(i) === itemKey
          ? { ...i, unitName: u.name, unitQuantity: u.quantity, unitPrice: price }
          : i
      ))
    } else if (locationId) {
      addToCart(product.id, unitName, locationId, price)
    } else {
      handleProductClick(product, unitName, price)
    }
  }

  function addToCart(productId: string, unitName?: string, locationId?: string, priceOverride?: number) {
    const p = allProducts?.find(x => x.id === productId)
    if (!p) return
    const units = getProductUnits(p)
    const unit = units.find(u => u.name === unitName) || units[0]
    if (priceOverride === undefined && needsUnitPrice(p, unit.name)) {
      setUnitPriceModal({ product: p, unitName: unit.name })
      return
    }
    const locId = locationId
    if (!locId) return
    const stockHere = allStocks?.find(s => s.productId === productId && s.locationId === locId)?.quantity || 0
    if (stockHere < unit.quantity) { toast('Stock insuffisant dans ce dépôt', 'error'); return }
    const effectivePrice = priceOverride ?? (priceMode === 'gros'
      ? (p.wholesalePrice || getUnitPrice(p, unit.name))
      : getUnitPrice(p, unit.name))

    setCart(prev => {
      const key = `${productId}::${unit.name}::${locId}`
      const step = getUnitStep(unit.name)
      const existing = prev.find(i => cartItemKey(i) === key)
      if (existing) {
        const newQty = +(existing.quantity + step).toFixed(1)
        const neededPieces = Math.ceil(newQty * unit.quantity)
        if (neededPieces > stockHere) { toast('Stock insuffisant', 'error'); return prev }
        return prev.map(i =>
          cartItemKey(i) === key ? { ...i, quantity: newQty, unitPrice: priceOverride ?? i.unitPrice } : i
        )
      }
      return [...prev, {
        productId: p.id, productName: p.name, quantity: 1,
        unitPrice: effectivePrice, unitName: unit.name,
        unitQuantity: unit.quantity, locationId: locId,
        locationName: locationMap.get(locId)?.name || 'Inconnu', discount: 0,
      }]
    })
  }

  function handleProductClick(product: Product, unitName?: string, priceOverride?: number) {
    const available = (stockByProduct.get(product.id) || []).filter(s => s.quantity > 0)
    if (available.length === 0) { toast('Aucun stock disponible', 'warning'); return }
    if (available.length === 1) { addToCart(product.id, unitName, available[0].locationId, priceOverride); return }
    setPickModal({ product, unitName: unitName || 'Pièce' })
  }

  function handlePickDepot(locationId: string) {
    if (!pickModal) return
    const p = pickModal.product
    if (needsUnitPrice(p, pickModal.unitName)) {
      setUnitPriceModal({ product: p, unitName: pickModal.unitName, locationId })
      setPickModal(null)
      return
    }
    addToCart(pickModal.product.id, pickModal.unitName, locationId)
    setPickModal(null)
  }

  function updateQuantity(itemKey: string, delta: number) {
    setCart(prev => {
      const item = prev.find(i => cartItemKey(i) === itemKey)
      if (!item) return prev
      const minQty = getUnitMinQty(item.unitName)
      const newQty = +(item.quantity + delta).toFixed(1)
      if (newQty < minQty) return prev.filter(i => cartItemKey(i) !== itemKey)

      const maxFromDepot = allStocks?.find(s => s.productId === item.productId && s.locationId === item.locationId)?.quantity || 0
      const maxUnit = Math.floor(maxFromDepot / item.unitQuantity)

      if (newQty <= maxUnit) {
        return prev.map(i => cartItemKey(i) === itemKey ? { ...i, quantity: newQty } : i)
      }

      const other = (stockByProduct.get(item.productId) || []).filter(s => s.locationId !== item.locationId && s.quantity > 0)
      if (other.length === 0) {
        toast(`Stock insuffisant: max ${maxUnit}`, 'warning')
        return prev.map(i => cartItemKey(i) === itemKey ? { ...i, quantity: maxUnit } : i)
      }
      setSplitModal({ item, targetQty: newQty })
      return prev.map(i => cartItemKey(i) === itemKey ? { ...i, quantity: maxUnit } : i)
    })
  }

  function setQuantity(itemKey: string, value: number) {
    setCart(prev => {
      const item = prev.find(i => cartItemKey(i) === itemKey)
      if (!item) return prev
      const minQty = getUnitMinQty(item.unitName)
      const newQty = +(value || minQty).toFixed(1)
      if (newQty < minQty) return prev.map(i => cartItemKey(i) === itemKey ? { ...i, quantity: minQty } : i)

      const maxFromDepot = allStocks?.find(s => s.productId === item.productId && s.locationId === item.locationId)?.quantity || 0
      const maxUnit = Math.floor(maxFromDepot / item.unitQuantity)

      if (newQty <= maxUnit) {
        return prev.map(i => cartItemKey(i) === itemKey ? { ...i, quantity: newQty } : i)
      }

      const other = (stockByProduct.get(item.productId) || []).filter(s => s.locationId !== item.locationId && s.quantity > 0)
      if (other.length === 0) {
        toast(`Stock insuffisant: max ${maxUnit}`, 'warning')
        return prev.map(i => cartItemKey(i) === itemKey ? { ...i, quantity: maxUnit } : i)
      }
      setSplitModal({ item, targetQty: newQty })
      return prev.map(i => cartItemKey(i) === itemKey ? { ...i, quantity: maxUnit } : i)
    })
  }

  function updateCartUnit(itemKey: string, newUnitName: string) {
    const item = cart.find(i => cartItemKey(i) === itemKey)
    const prod = item ? allProducts?.find(p => p.id === item.productId) : undefined
    if (prod && needsUnitPrice(prod, newUnitName)) {
      setUnitPriceModal({ product: prod, unitName: newUnitName, itemKey })
      return
    }
    setCart(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      if (!prod) return i
      const u = getProductUnits(prod).find(x => x.name === newUnitName)
      if (!u) return i
      const newUnitPrice = priceMode === 'gros'
        ? (prod.wholesalePrice || getUnitPrice(prod, newUnitName))
        : getUnitPrice(prod, newUnitName)
      return { ...i, unitName: u.name, unitQuantity: u.quantity, unitPrice: newUnitPrice }
    }))
  }

  function updateCartPrice(itemKey: string, newPrice: number) {
    setCart(prev => prev.map(i =>
      cartItemKey(i) === itemKey ? { ...i, unitPrice: Math.max(0, newPrice) } : i
    ))
  }

  function removeFromCart(itemKey: string) {
    setCart(prev => prev.filter(i => cartItemKey(i) !== itemKey))
  }

  function clearCart() {
    setCart([]); setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setCustomerId(''); setSupplierId(''); setSupplierName(''); setSupplierPhone(''); setDiscount(0); pay.reset(); setCartSheetOpen(false); setPaymentOpen(false)
  }

  async function handleSale(createCustomer: boolean = true) {
    if (cart.length === 0) return
    if (pay.isCredit && !supplierId && !customerId && !supplierName.trim() && !customerName.trim()) {
      toast('Client ou fournisseur requis pour une vente à crédit', 'error')
      return
    }
    if (pay.paymentType === 'complet' && pay.payMethod === 'cash' && pay.isShort) {
      toast('Montant reçu insuffisant', 'error')
      return
    }

    const isSupplierSale = !!(supplierId || supplierName.trim())

    let resolvedSupplier: { id?: string; name: string } | undefined
    if (isSupplierSale) {
      resolvedSupplier = createCustomer
        ? await ensureSupplier({
            businessId,
            name: supplierName,
            phone: supplierPhone,
            address: '',
            supplierId,
            allSuppliers,
          })
        : { id: supplierId || undefined, name: supplierName }
    }

    const resolved = isSupplierSale
      ? { id: undefined, name: customerName }
      : createCustomer
        ? await ensureCustomer({
            businessId,
            name: customerName,
            phone: customerPhone,
            address: customerAddress,
            customerId,
            allCustomers,
          })
        : { id: customerId || undefined, name: customerName }
    const customer = allCustomers.find(c => c.id === resolved.id)
    const supplier = allSuppliers.find(s => s.id === resolvedSupplier?.id)
    const invNum = generateInvoiceNumber(dexieSettings?.invoicePrefix || 'INV-', dexieSettings?.invoiceNextNumber || 1)

    const sale: Sale = {
      id: generateId(),
      businessId,
      locationId: cart[0].locationId,
      invoiceNumber: invNum,
      customerId: isSupplierSale ? undefined : resolved.id,
      customerName: isSupplierSale ? undefined : (customer?.name || resolved.name || customerName),
      supplierId: resolvedSupplier?.id || undefined,
      supplierName: isSupplierSale ? (supplier?.name || resolvedSupplier?.name || supplierName) : undefined,
      items: cart.map(i => ({
        productId: i.productId, productName: i.productName,
        quantity: i.quantity, unitPrice: i.unitPrice,
        unitName: i.unitName, unitQuantity: i.unitQuantity,
        discount: 0, taxRate: 0, total: i.quantity * i.unitPrice,
        locationId: i.locationId,
      })),
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

    if (dexieSettings) {
      const nextNum = (dexieSettings.invoiceNextNumber || 1) + 1
      await db.settings.update('default', { invoiceNextNumber: nextNum })
    }

    setLastSale(sale)
    setSaleSuccess(true)
    setPaymentOpen(false)
    setCartSheetOpen(false)
  }

  const currency = formatCurrency

  return (
    <div className="w-full h-full flex flex-col gap-0">
      <div className="flex-1 flex gap-0 overflow-hidden bg-surface-100">
        {/* â”€â”€ LEFT: Catalogue â”€â”€ */}
        <div className="flex-[2] flex flex-col min-w-0 lg:border-r border-surface-200">
          {/* Toolbar */}
          <div className="p-4 border-b border-surface-200 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                autoFocus
                type="text" placeholder="Rechercher un produit..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-100 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex rounded-xl bg-surface-100 border border-surface-200 overflow-hidden w-fit">
              <button
                onClick={() => setPriceMode('detail')}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  priceMode === 'detail' ? 'bg-primary-500 text-on-accent' : 'text-surface-500 hover:text-surface-700'
                )}
              >
                Détail
              </button>
              <button
                onClick={() => setPriceMode('gros')}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition-colors',
                  priceMode === 'gros' ? 'bg-primary-500 text-on-accent' : 'text-surface-500 hover:text-surface-700'
                )}
              >
                Gros
              </button>
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map(p => {
                const allStock = stockByProduct.get(p.id) || []
                const available = allStock.filter(s => s.quantity > 0)
                const isOut = available.length === 0
                const units = getProductUnits(p)
                const displayPrice = priceMode === 'gros' ? (p.wholesalePrice || p.sellingPrice) : p.sellingPrice
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'relative rounded-xl border p-3 transition-all bg-surface-100',
                      isOut
                        ? 'border-surface-200 bg-surface-50 opacity-50'
                        : 'border-surface-200 hover:border-primary-300 hover:shadow-md'
                    )}
                  >
                    <button onClick={() => !isOut && handleProductClick(p)} className="w-full text-left">
                      <div className="w-full aspect-square bg-surface-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                        {p.photos?.[0] ? (
                          <img src={p.photos[0]} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-8 h-8 text-surface-500" />
                        )}
                      </div>
                      {isOut && (
                        <span className="absolute top-4 left-4 px-2 py-0.5 rounded-md bg-red-500/90 text-[10px] font-semibold text-white">
                          Rupture
                        </span>
                      )}
                      <p className="text-xs font-medium text-surface-900 truncate leading-tight">{p.name}</p>
                      <p className="text-sm font-bold text-primary-400 mt-0.5">{currency(displayPrice)}</p>
                      {allStock.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {allStock.map(s => (
                            <p key={s.locationId} className={cn('text-[10px]', s.quantity > 0 ? 'text-surface-500' : 'text-surface-500')}>
                              {s.locationName}: {s.quantity}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-surface-400 mt-1">Aucun stock</p>
                      )}
                    </button>
                    {!isOut && units.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                        {units.map(u => (
                          <button key={u.name} onClick={() => handleProductClick(p, u.name)}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 hover:bg-primary-100 hover:text-primary-400 transition-colors"
                            title={needsUnitPrice(p, u.name) ? `1 ${u.name} = ${u.quantity} pièces (prix non défini)` : `1 ${u.name} = ${u.quantity} pièces`}>
                            1 {u.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredProducts.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-surface-400">
                  <Package className="w-12 h-12 mb-3 text-surface-500" />
                  <p className="text-sm">Aucun produit trouvé</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* â”€â”€ RIGHT: Panier & Paiement (desktop only, mobile uses bottom sheet) â”€â”€ */}
        <div className={cn(
          'hidden lg:flex flex-1 flex-col min-w-0 bg-surface-50',
        )}>
          {/* Fixed header */}
          <div className="shrink-0 px-4 py-3 bg-surface-100 border-b border-surface-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-surface-900">Panier <span className="text-surface-400 font-normal">({cart.length})</span></h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg bg-surface-100 border border-surface-200 overflow-hidden">
                <button onClick={() => setPriceMode('detail')} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', priceMode === 'detail' ? 'bg-primary-500 text-on-accent' : 'text-surface-500 hover:text-surface-700')}>Détail</button>
                <button onClick={() => setPriceMode('gros')} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', priceMode === 'gros' ? 'bg-primary-500 text-on-accent' : 'text-surface-500 hover:text-surface-700')}>Gros</button>
              </div>
              {cart.length > 0 && (
                <button onClick={clearCart} className="p-1.5 rounded-lg hover:bg-red-500/15 text-surface-400 hover:text-red-500 transition-colors" title="Vider le panier">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Customer (collapsible, closed by default) */}
          <div className="shrink-0 px-4 pt-2 pb-1 bg-surface-100 border-b border-surface-100">
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
                    className="p-2 rounded-lg bg-surface-50 border border-surface-300 text-surface-500 hover:text-primary-400" title="Importer">
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

          {/* Fournisseur (collapsible) */}
          <div className="shrink-0 px-4 pt-2 pb-1 bg-surface-100 border-b border-surface-100">
            <button onClick={() => setSupplierOpen(!supplierOpen)} className="flex items-center justify-between w-full text-left py-1">
              <div className="flex items-center gap-2 text-sm">
                <Truck className="w-3.5 h-3.5 text-surface-400" />
                <span className="text-surface-500">Fournisseur</span>
                {supplierName ? <span className="text-surface-900 font-medium truncate max-w-[160px]">{supplierName}</span> : <span className="text-surface-400">(optionnel)</span>}
              </div>
              <ChevronDown className={cn('w-4 h-4 text-surface-400 transition-transform', supplierOpen && 'rotate-180')} />
            </button>
            {supplierOpen && (
              <div className="mt-2 space-y-2 pb-2">
                {supplierId && (
                  <div className="flex items-center justify-between rounded-lg bg-primary-50 border border-primary-200 px-3 py-2">
                    <span className="text-sm font-semibold text-surface-900 truncate">{supplierName}</span>
                    <button onClick={() => { setSupplierId(''); setSupplierName(''); setSupplierPhone('') }} className="p-1 rounded-lg text-surface-400 hover:text-danger transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="relative">
                  <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input value={supplierName} onChange={(e) => { setSupplierName(e.target.value); if (supplierId) setSupplierId('') }} placeholder="Nom du fournisseur"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  {supplierName.trim() && !supplierId && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-surface-100 border border-surface-200 rounded-xl shadow-xl z-20 max-h-40 overflow-y-auto">
                      {allSuppliers.filter(s => (s.name || '').toLowerCase().includes(supplierName.trim().toLowerCase()) || (s.phone || '').includes(supplierName.trim())).slice(0, 5).map(s => (
                        <button key={s.id} type="button" onClick={() => { setSupplierId(s.id); setSupplierName(s.name); setSupplierPhone(s.phone || '') }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-50 transition-colors">
                          <Truck className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                          <span className="text-sm text-surface-700 truncate">{s.name}</span>
                          {s.phone && <span className="text-xs text-surface-400 ml-auto">{s.phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} placeholder="Téléphone"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                {supplierName.trim() && !supplierId && (
                  <p className="text-xs text-amber-500 font-medium">
                    « {supplierName.trim()} » sera enregistré comme nouveau fournisseur à la validation
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Scrollable cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {cart.map((item) => {
              const key = cartItemKey(item)
              const product = allProducts?.find(p => p.id === item.productId)
              const units = product ? getProductUnits(product) : []
              return (
                <div key={key} className="bg-surface-100 border border-surface-200 rounded-2xl p-4 shadow-sm relative">
                  <button onClick={() => removeFromCart(key)}
                    className="absolute top-3 right-3 p-1 rounded-lg text-surface-500 hover:text-red-500 hover:bg-red-500/15 transition-colors z-10">
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex gap-3 items-start">
                    <div className="w-12 h-12 rounded-xl bg-surface-50 flex items-center justify-center overflow-hidden shrink-0 border border-surface-100">
                      {product?.photos?.[0] ? (
                        <img src={product.photos[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-6 h-6 text-surface-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-surface-900 leading-tight">{item.productName}</p>
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-400 text-[10px] font-medium">{item.locationName}</span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <select value={item.unitName || 'Pièce'} onChange={(e) => updateCartUnit(key, e.target.value)}
                          className="text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-surface-600 focus:outline-none">
                          {units.map(u => (<option key={u.name} value={u.name}>{u.name}</option>))}
                        </select>
                        <span className="text-xs text-surface-500">×</span>
                        <input type="number" min={getUnitMinQty(item.unitName || 'Pièce')} step={getUnitStep(item.unitName || 'Pièce')}
                          value={item.quantity}
                          onChange={(e) => {
                            const minQty = getUnitMinQty(item.unitName || 'Pièce')
                            const q = Math.max(minQty, Number(e.target.value) || minQty)
                            setCart(prev => prev.map(i => cartItemKey(i) === key ? { ...i, quantity: q } : i))
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
                    <input
                      type="number"
                      min={getUnitMinQty(item.unitName || 'Pièce')}
                      step={getUnitStep(item.unitName || 'Pièce')}
                      value={item.quantity}
                      onChange={(e) => setQuantity(key, Number(e.target.value))}
                      inputMode="decimal"
                      className="w-16 text-center text-base font-bold text-surface-900 bg-surface-50 border border-surface-200 rounded-xl px-1 py-2 focus:outline-none focus:ring-2 focus:ring-primary-200"
                    />
                    <button onClick={() => updateQuantity(key, 1)} className="w-9 h-9 rounded-xl bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 active:bg-surface-300 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="ml-auto text-lg font-bold text-primary-400">{currency(item.quantity * item.unitPrice)}</span>
                  </div>
                </div>
              )
            })}
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-surface-400 py-16">
                <ShoppingCart className="w-14 h-14 mb-4 text-surface-500" />
                <p className="text-sm font-medium">Panier vide</p>
                <p className="text-xs text-surface-400 mt-1">Cliquez sur un produit</p>
              </div>
            )}
          </div>

          {/* Summary section (compact) */}
          <div className="shrink-0 bg-surface-100 border-t border-surface-200">
            {cart.length > 0 && (
              <div className="flex gap-2 px-4 pt-3 pb-2">
                <div className="flex-1 bg-primary-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-primary-400">{cart.length}</p>
                  <p className="text-[10px] text-primary-400 font-medium">Articles</p>
                </div>
                <div className="flex-1 bg-surface-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-surface-700">{cart.reduce((s, i) => s + i.quantity, 0)}</p>
                  <p className="text-[10px] text-surface-400 font-medium">Qté</p>
                </div>
                <div className="flex-1 bg-emerald-500/15 rounded-xl px-3 py-2 text-center">
                  <p className="text-lg font-bold text-emerald-400">{currency(total)}</p>
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
                <span className={cn('text-xs font-medium', margin >= 20 ? 'text-emerald-400' : margin >= 10 ? 'text-amber-400' : 'text-red-400')}>{margin.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Payment type */}
          <SalePaymentPanel pay={pay} customerName={customerName} total={total} />

          {/* Fixed bottom bar */}
          <div className="shrink-0 bg-surface-100 border-t border-surface-200 px-4 pt-3 pb-3 space-y-2" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 16px))' }}>
            <button onClick={() => handleSale()} disabled={cart.length === 0 || pay.isShort}
              className={cn(
                'w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
                cart.length > 0
                  ? 'bg-primary-500 hover:bg-primary-600 text-on-accent shadow-lg shadow-primary-200 active:scale-[0.98]'
                  : 'bg-surface-100 text-surface-400 cursor-not-allowed'
              )}>
              <CreditCard className="w-5 h-5" />
              Valider ({currency(total)})
            </button>
            <div className="flex gap-2">
              <button onClick={async () => {
                const customer = allCustomers.find(c => c.id === customerId)
                const printName = supplierName || customer?.name || customerName
                const saleData = { invoiceNumber: generateInvoiceNumber(dexieSettings?.invoicePrefix || 'INV-', dexieSettings?.invoiceNextNumber || 1), items: cart.map(i => ({ productName: i.productName, quantity: i.quantity, unitName: i.unitName, unitPrice: i.unitPrice, total: i.quantity * i.unitPrice })), total, paid: pay.paid, change: pay.change, customerName: printName, createdAt: saleDate, paymentMethod: pay.creditAmount > 0 ? 'credit' : pay.payMethod }
                try { const connected = thermalPrinter.isConnected() || await thermalPrinter.connect()
                  if (connected) { await thermalPrinter.printReceipt([{ text: 'NEOX ERP', bold: true, doubleWidth: true, align: 'center' }, { text: 'Facture de vente', align: 'center' }, { text: '---' }, ...cart.map(i => ({ text: `${i.productName} x${i.quantity}  ${currency(i.quantity * i.unitPrice)}` })), { text: '---' }, { text: `Total: ${currency(total)}`, bold: true, align: 'right' }, { text: '', align: 'center' }, { text: 'Merci de votre visite !', align: 'center' }]); await thermalPrinter.cut(); toast('Ticket imprimé', 'success'); return }
                } catch {}
                printReceiptHTML(saleData, dexieSettings?.name)
              }} disabled={cart.length === 0}
                className={cn('flex-1 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border border-surface-200', cart.length > 0 ? 'bg-surface-100 text-surface-700 hover:bg-surface-50' : 'bg-surface-50 text-surface-500 cursor-not-allowed')}>
                <Printer className="w-3.5 h-3.5" /> Ticket
              </button>
              <button onClick={async () => { if (lastSale) exportSalePDF(lastSale, dexieSettings as any, await buildProductPhotos(allProducts as any)) }} disabled={cart.length === 0}
                className={cn('flex-1 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border border-surface-200', cart.length > 0 ? 'bg-surface-100 text-surface-700 hover:bg-surface-50' : 'bg-surface-50 text-surface-500 cursor-not-allowed')}>
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-surface-200 bg-surface-100 text-surface-600 text-xs cursor-pointer" onClick={() => (document.getElementById('saleDateInput') as HTMLInputElement)?.showPicker?.()}>
                <Calendar className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">{new Date(saleDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <input type="datetime-local" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} id="saleDateInput" className="w-0 h-0 opacity-0 absolute pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: floating cart button */}
      {cart.length > 0 && !paymentOpen && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 p-4 safe-area-bottom pointer-events-none">
          <button onClick={() => setCartSheetOpen(true)} className="pointer-events-auto w-full py-3.5 rounded-xl bg-primary-500 text-on-accent font-bold shadow-lg shadow-primary-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
            Panier ({cart.length}) &middot; {currency(total)}
          </button>
        </div>
      )}

      {/* Mobile: cart bottom sheet */}
      <MobileCartSheet
        open={cartSheetOpen}
        onClose={() => setCartSheetOpen(false)}
        cart={cart}
        products={allProducts || []}
        subtotal={subtotal}
        discount={discount}
        setDiscount={setDiscount}
        total={total}
        updateQuantity={updateQuantity}
        setQuantity={setQuantity}
        updateCartUnit={updateCartUnit}
        updateCartPrice={updateCartPrice}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        canEditPrice={can('products', 'edit')}
        onCheckout={() => { setCartSheetOpen(false); setPaymentOpen(true) }}
      />

      {/* Mobile: écran de paiement dédié */}
      <PaymentScreen
        open={paymentOpen}
        onBack={() => { setPaymentOpen(false); setCartSheetOpen(true) }}
        subtotal={subtotal}
        discount={discount}
        total={total}
        pay={pay}
        customers={allCustomers}
        customerId={customerId}
        setCustomerId={setCustomerId}
        customerName={customerName}
        setCustomerName={setCustomerName}
        customerPhone={customerPhone}
        setCustomerPhone={setCustomerPhone}
        customerAddress={customerAddress}
        setCustomerAddress={setCustomerAddress}
        customerOpen={customerOpen}
        setCustomerOpen={setCustomerOpen}
        suppliers={allSuppliers}
        supplierId={supplierId}
        setSupplierId={setSupplierId}
        supplierName={supplierName}
        setSupplierName={setSupplierName}
        supplierPhone={supplierPhone}
        setSupplierPhone={setSupplierPhone}
        onConfirm={handleSale}
      />

      <Modal open={pickModal !== null} onClose={() => setPickModal(null)} title="Choisir le dépôt">
        {pickModal && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-surface-900">{pickModal.product.name}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(stockByProduct.get(pickModal.product.id) || []).filter(s => s.quantity > 0).map(s => (
                <button key={s.locationId} onClick={() => handlePickDepot(s.locationId)}
                  className="w-full text-left p-3 rounded-xl border border-surface-200 hover:border-primary-300 hover:bg-primary-50 transition-all flex items-center justify-between">
                  <span className="text-sm font-medium text-surface-700">{s.locationName}</span>
                  <span className="text-sm font-bold text-primary-400">Stock: {s.quantity}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <SplitDepotModal
        open={splitModal !== null} item={splitModal?.item || null}
        stockByProduct={stockByProduct} locationMap={locationMap}
        onConfirm={(locationId, qty) => {
          if (!splitModal) return
          addToCart(splitModal.item.productId, splitModal.item.unitName, locationId)
          setCart(prev => prev.map(i => {
            if (cartItemKey(i) === `${splitModal.item.productId}::${splitModal.item.unitName}::${locationId}`)
              return { ...i, quantity: qty }
            return i
          }))
          setSplitModal(null)
        }}
        onClose={() => setSplitModal(null)}
      />

      <UnitPriceModal
        open={!!unitPriceModal}
        productName={unitPriceModal?.product.name || ''}
        unitName={unitPriceModal?.unitName || ''}
        suggestedPrice={unitPriceModal ? Math.round(unitPriceModal.product.sellingPrice * (unitPriceModal.unitName === 'Douzaine' || unitPriceModal.unitName === 'Demi-douzaine' ? (unitPriceModal.unitName === 'Demi-douzaine' ? 6 : 12) : (unitPriceModal.unitName === 'Demi-paquet' ? (unitPriceModal.product.packSize || 2) / 2 : (unitPriceModal.product.packSize || 1)))) : 0}
        onConfirm={handleUnitPriceConfirm}
        onClose={() => setUnitPriceModal(null)}
      />

      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in p-4">
          <div className="relative text-center py-8 px-6 bg-surface-100 rounded-[20px] border border-surface-200 shadow-2xl animate-slide-up w-[95%] sm:w-[90%] md:w-[640px] max-w-[640px] max-h-[95vh] md:max-h-[820px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                  onClick={async () => { if (lastSale) { exportSalePDF(lastSale, dexieSettings as any, await buildProductPhotos(allProducts as any)); toast('PDF téléchargé', 'success') } }}
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
                    printReceiptHTML(lastSale, dexieSettings?.name)
                  }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
                >
                  <Printer className="w-5 h-5" /> Imprimer
                </button>
                <button
                  onClick={async () => { if (lastSale) { shareSalePDF(lastSale, dexieSettings as any, await buildProductPhotos(allProducts as any)); toast('Partage en cours...', 'success') } }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
                >
                  <Send className="w-5 h-5" /> WhatsApp
                </button>
                <button
                  onClick={() => { if (lastSale) shareViaWeChat(`Facture ${lastSale.invoiceNumber} â€” ${lastSale.customerName || 'Client divers'}\nTotal: ${currency(lastSale.total)}\nPayé: ${currency(lastSale.paid)}\nRestant: ${currency(lastSale.total - lastSale.paid)}`, `Facture ${lastSale.invoiceNumber}`) }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-surface-200 text-surface-700 text-xs font-medium hover:bg-surface-50 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" /> WeChat
                </button>
                <button
                  onClick={() => { if (lastSale) setEditSaleId(lastSale.id) }}
                  className="flex flex-col items-center gap-1 py-3 rounded-xl border border-amber-500/30 text-amber-300 text-xs font-medium hover:bg-amber-500/15 transition-colors"
                >
                  <Edit2 className="w-5 h-5" /> Modifier la vente
                </button>
              </div>
              <button
                onClick={() => { setSaleSuccess(false); clearCart() }}
                className="w-full py-3 rounded-xl bg-primary-500 text-on-accent text-sm font-bold hover:bg-primary-500 transition-colors"
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

function SplitDepotModal({ open, item, stockByProduct, locationMap, onConfirm, onClose }: {
  open: boolean
  item: CartItem | null
  stockByProduct: Map<string, { locationId: string; locationName: string; quantity: number }[]>
  locationMap: Map<string, { name: string }>
  onConfirm: (locationId: string, qty: number) => void
  onClose: () => void
}) {
  const [qtyPerDepot, setQtyPerDepot] = useState<Record<string, number>>({})
  if (!item) return null
  const others = (stockByProduct.get(item.productId) || []).filter(s => s.locationId !== item.locationId && s.quantity > 0)

  return (
    <Modal open={open} onClose={onClose} title="Répartir sur plusieurs dépôts">
      <div className="p-6 space-y-4">
        <p className="text-sm text-surface-600">
          Stock insuffisant dans <strong>{item.locationName}</strong>.
          Répartissez sur les autres dépôts :
        </p>
        {others.map(s => (
          <div key={s.locationId} className="flex items-center gap-3 p-3 rounded-xl border border-surface-200">
            <span className="text-sm font-medium flex-1">{s.locationName}</span>
            <span className="text-xs text-surface-400">Dispo: {s.quantity}</span>
            <input type="number" min="0" max={s.quantity} placeholder="0"
              value={qtyPerDepot[s.locationId] || ''}
              onChange={e => setQtyPerDepot(p => ({ ...p, [s.locationId]: Math.min(s.quantity, Number(e.target.value) || 0) }))}
              className="w-20 px-3 py-1.5 rounded-lg border border-surface-300 text-sm text-right" />
          </div>
        ))}
        <Button onClick={() => {
          for (const [locId, qty] of Object.entries(qtyPerDepot)) {
            if (qty > 0) onConfirm(locId, qty)
          }
        }} className="w-full">Ajouter au panier</Button>
      </div>
    </Modal>
  )
}
