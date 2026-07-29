import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { cn, formatCurrency, generateId, generateInvoiceNumber, getProductUnits, getUnitPrice, getUnitStep, getUnitMinQty, pickContact } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { processSale } from '@/engine/operations'
import { exportSalePDF } from '@/lib/pdf'
import { thermalPrinter } from '@/lib/thermalPrinter'
import {
  ArrowLeft, ShoppingCart, Plus, Minus, Trash2, Search, Package, X,
  CreditCard, Printer, Download, Tag, User, Phone, MapPin, Calendar,
  Check, Percent, Contact as ContactIcon
} from 'lucide-react'
import type { SaleItem, Product, Sale, Customer, Supplier } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import SplitPaymentModal from '@/components/pos/SplitPaymentModal'
import CreditPaymentModal from '@/components/pos/CreditPaymentModal'
import type { SplitPayment } from '@/components/pos/SplitPaymentModal'

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

type PaymentType = 'complet' | 'credit' | 'partiel'
type PayMethod = 'cash' | 'mobile' | 'card' | 'bank'

export default function DepotGlobalPOSPage() {
  const businessId = useBusinessId()
  const navigate = useNavigate()
  const isCloud = isSupabaseConfigured()

  const allProducts = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const allStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).filter(l => l.type === 'warehouse').toArray(), [businessId])
  const dexieCustomers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId])
  const { data: supabaseCustomers } = useSupabaseQuery<Customer>('customers', undefined, [])
  const allCustomers = (isCloud ? supabaseCustomers : dexieCustomers) || []
  const dexieSuppliers = useLiveQuery(() => db.suppliers.where('businessId').equals(businessId).toArray(), [businessId])
  const { data: supabaseSuppliers } = useSupabaseQuery<Supplier>('suppliers', undefined, [])
  const allSuppliers = (isCloud ? supabaseSuppliers : dexieSuppliers) || []
  const dexieSettings = useLiveQuery(() => db.settings.get('default'), [])
  const userId = useAppStore(s => s.user?.id || '')

  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [pickModal, setPickModal] = useState<{ product: Product; unitName: string } | null>(null)
  const [splitModal, setSplitModal] = useState<{ item: CartItem; targetQty: number } | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [clientType, setClientType] = useState<'client' | 'fournisseur'>('client')
  const [contactSearch, setContactSearch] = useState('')
  const [contactDropdown, setContactDropdown] = useState(false)
  const [discount, setDiscount] = useState(0)
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16))
  const [paymentType, setPaymentType] = useState<PaymentType>('complet')
  const [payMethod, setPayMethod] = useState<PayMethod>('cash')

  const [saleSuccess, setSaleSuccess] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [splitOpen, setSplitOpen] = useState(false)
  const [creditOpen, setCreditOpen] = useState(false)

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
  const margin = useMemo(() => {
    if (subtotal === 0) return 0
    const cost = cart.reduce((s, i) => {
      const p = allProducts?.find(pr => pr.id === i.productId)
      const mainQty = i.quantity * i.unitQuantity
      return s + mainQty * (p?.purchasePrice || 0)
    }, 0)
    return ((subtotal - discount - cost) / (subtotal - discount || 1)) * 100
  }, [cart, subtotal, discount, allProducts])

  const contacts = useMemo(() => {
    const list: { id: string; name: string; phone: string; address: string; type: 'client' | 'fournisseur' }[] = []
    allCustomers.forEach(c => list.push({ id: c.id, name: c.name, phone: c.phone, address: c.address || '', type: 'client' }))
    allSuppliers.forEach(s => list.push({ id: s.id, name: s.name, phone: s.phone, address: s.address || '', type: 'fournisseur' }))
    return list
  }, [allCustomers, allSuppliers])

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts
    const q = contactSearch.toLowerCase()
    return contacts.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q))
  }, [contacts, contactSearch])

  function selectContact(contact: typeof contacts[0]) {
    setClientType(contact.type)
    setCustomerId(contact.id)
    setCustomerName(contact.name)
    setCustomerPhone(contact.phone)
    setCustomerAddress(contact.address)
    setContactSearch('')
    setContactDropdown(false)
  }

  function addToCart(productId: string, unitName?: string, locationId?: string) {
    const p = allProducts?.find(x => x.id === productId)
    if (!p) return
    const units = getProductUnits(p)
    const unit = units.find(u => u.name === unitName) || units[0]
    const locId = locationId
    if (!locId) return
    const stockHere = allStocks?.find(s => s.productId === productId && s.locationId === locId)?.quantity || 0
    if (stockHere < unit.quantity) { toast('Stock insuffisant dans ce dépôt', 'error'); return }

    setCart(prev => {
      const key = `${productId}::${unit.name}::${locId}`
      const step = getUnitStep(unit.name)
      const existing = prev.find(i => cartItemKey(i) === key)
      if (existing) {
        const newQty = +(existing.quantity + step).toFixed(1)
        const neededPieces = Math.ceil(newQty * unit.quantity)
        if (neededPieces > stockHere) { toast('Stock insuffisant', 'error'); return prev }
        return prev.map(i =>
          cartItemKey(i) === key ? { ...i, quantity: newQty } : i
        )
      }
      return [...prev, {
        productId: p.id, productName: p.name, quantity: 1,
        unitPrice: getUnitPrice(p, unit.name), unitName: unit.name,
        unitQuantity: unit.quantity, locationId: locId,
        locationName: locationMap.get(locId)?.name || 'Inconnu', discount: 0,
      }]
    })
  }

  function handleProductClick(product: Product, unitName?: string) {
    const available = (stockByProduct.get(product.id) || []).filter(s => s.quantity > 0)
    if (available.length === 0) { toast('Aucun stock disponible', 'warning'); return }
    if (available.length === 1) { addToCart(product.id, unitName, available[0].locationId); return }
    setPickModal({ product, unitName: unitName || 'Pièce' })
  }

  function handlePickDepot(locationId: string) {
    if (!pickModal) return
    addToCart(pickModal.product.id, pickModal.unitName, locationId)
    setPickModal(null)
  }

  function updateQuantity(itemKey: string, delta: number) {
    setCart(prev => {
      const item = prev.find(i => cartItemKey(i) === itemKey)
      if (!item) return prev
      const step = getUnitStep(item.unitName)
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

  function updateCartPrice(itemKey: string, newPrice: number) {
    setCart(prev => prev.map(i =>
      cartItemKey(i) === itemKey ? { ...i, unitPrice: Math.max(0, newPrice) } : i
    ))
  }

  function removeFromCart(itemKey: string) {
    setCart(prev => prev.filter(i => cartItemKey(i) !== itemKey))
  }

  function clearCart() {
    setCart([]); setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setCustomerId(''); setClientType('client'); setContactSearch(''); setContactDropdown(false); setDiscount(0); setCartOpen(false)
  }

  async function handleSale(payments?: SplitPayment[], paidAmount?: number) {
    if (cart.length === 0) return
    if (!customerName) { toast('Nom du client requis', 'warning'); return }

    const customer = allCustomers.find(c => c.id === customerId)
    const supplier = allSuppliers.find(s => s.id === customerId)
    const contact = customer || supplier
    const now = new Date().toISOString()

    const saleItems: SaleItem[] = cart.map(i => ({
      productId: i.productId, productName: i.productName,
      quantity: i.quantity, unitPrice: i.unitPrice,
      unitName: i.unitName, unitQuantity: i.unitQuantity,
      discount: 0, taxRate: 0, total: i.quantity * i.unitPrice,
    }))

    const sale: Sale = {
      id: generateId(), businessId, locationId: cart[0].locationId,
      invoiceNumber: `VEN-${Date.now()}`,
      customerId: customerId || undefined, customerName: contact?.name || customerName,
      items: saleItems, subtotal, discountTotal: discount, taxTotal: 0, total,
      paid: paidAmount || total, change: paidAmount ? Math.max(0, paidAmount - total) : 0,
      paymentMethod: payments ? 'split' : payMethod,
      splitPayments: payments, status: 'completed', createdAt: now, userId,
    }

    await processSale(sale)

    if (paymentType === 'credit' && customerId && clientType === 'client') {
      const credit = {
        id: generateId(), businessId, customerId, customerName: contact?.name || customerName,
        invoiceId: sale.id, amount: total, paid: 0, balance: total,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active' as const, reminderSent: [], createdAt: now,
      }
      if (isCloud) { await sb.insert('credits', credit as any) } else { await db.credits.add(credit as any) }
    }

    setLastSale(sale)
    setSaleSuccess(true)
    setTimeout(() => { setSaleSuccess(false); clearCart() }, 2500)
  }

  const currency = formatCurrency

  return (
    <div className="w-full h-full flex flex-col gap-0">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-surface-200 bg-white">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-surface-900">Vente dépôts</h1>
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden bg-white">
        {/* ── LEFT: Produits ── */}
        <div className="flex-[2] flex flex-col min-w-0 lg:border-r border-surface-200">
          <div className="p-4 border-b border-surface-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher produit..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map(p => {
                const allStock = stockByProduct.get(p.id) || []
                const units = getProductUnits(p)
                return (
                  <div key={p.id} className="relative rounded-xl border border-surface-200 p-3 bg-white hover:border-primary-300 hover:shadow-md transition-all">
                    <button onClick={() => handleProductClick(p)} className="w-full text-left">
                      <div className="w-full aspect-square bg-surface-50 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                        {p.photos?.[0] ? (
                          <img src={p.photos[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-8 h-8 text-surface-300" />
                        )}
                      </div>
                      <p className="text-xs font-medium text-surface-900 truncate">{p.name}</p>
                      <p className="text-sm font-bold text-primary-600 mt-0.5">{currency(p.sellingPrice)}</p>
                      {allStock.length > 0 ? (
                        <div className="mt-1 space-y-0.5">
                          {allStock.map(s => (
                            <p key={s.locationId} className={cn('text-[10px]', s.quantity > 0 ? 'text-surface-500' : 'text-surface-300')}>
                              {s.locationName}: {s.quantity}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-surface-400 mt-1">Aucun stock</p>
                      )}
                    </button>
                    {allStock.some(s => s.quantity > 0) && units.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                        {units.map(u => (
                          <button key={u.name} onClick={() => handleProductClick(p, u.name)}
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 hover:bg-primary-100 hover:text-primary-600 transition-colors">
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
                  <Package className="w-12 h-12 mb-3 text-surface-300" />
                  <p className="text-sm">Aucun produit trouvé</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Panier & Paiement ── */}
        <div className={cn('flex-1 flex flex-col bg-surface-50 min-w-0', 'lg:flex', 'fixed inset-y-0 right-0 z-50 w-full max-w-md shadow-2xl', 'lg:static lg:inset-auto lg:z-auto lg:w-auto lg:shadow-none lg:translate-x-0', cartOpen ? 'flex' : 'hidden', 'transition-transform duration-300', cartOpen ? 'translate-x-0' : 'translate-x-full')}>
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
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cart.map(item => {
              const key = cartItemKey(item)
              const product = allProducts?.find(p => p.id === item.productId)
              const units = product ? getProductUnits(product) : []
              return (
                <div key={key} className="flex items-center gap-2 p-3 rounded-xl bg-white border border-surface-200 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{item.productName}</p>
                    <p className="text-[10px] text-primary-500 font-medium">{item.locationName}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <select value={item.unitName} onChange={e => {
                        const val = e.target.value
                        setCart(prev => prev.map(i => {
                          if (cartItemKey(i) !== key) return i
                          const prod = allProducts?.find(p => p.id === i.productId)
                          if (!prod) return i
                          const u = (getProductUnits(prod)).find(x => x.name === val)
                          if (!u) return i
                          return { ...i, unitName: u.name, unitQuantity: u.quantity, unitPrice: getUnitPrice(prod, u.name) }
                        }))
                      }}
                        className="text-[10px] rounded border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-600 focus:outline-none">
                        {units.map(u => <option key={u.name} value={u.name}>{u.name}</option>)}
                      </select>
                      <span className="text-[10px] text-surface-400">×</span>
                      <input type="number"
                        min={getUnitMinQty(item.unitName)}
                        step={getUnitStep(item.unitName)}
                        value={item.quantity}
                        onChange={e => {
                          const minQty = getUnitMinQty(item.unitName)
                          const q = Math.max(minQty, Number(e.target.value) || minQty)
                          setCart(prev => prev.map(i => cartItemKey(i) === key ? { ...i, quantity: q } : i))
                        }}
                        className="w-14 text-[10px] rounded border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-center focus:outline-none" />
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[10px] text-surface-400">Prix:</span>
                      <input type="number" min="0" step="1" value={item.unitPrice}
                        onChange={e => updateCartPrice(key, Math.max(0, Number(e.target.value) || 0))}
                        className="w-20 text-[10px] rounded border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-right focus:outline-none" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => updateQuantity(key, -1)} className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-10 text-center text-sm font-medium text-surface-900">{item.quantity.toLocaleString('fr-FR')}</span>
                    <button onClick={() => updateQuantity(key, 1)} className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-surface-900 w-20 text-right">{currency(item.quantity * item.unitPrice)}</p>
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
                <input type="number" min="0" value={discount || ''}
                  onChange={e => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="Remise (FCFA)"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-50 border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
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

          {/* Customer / Supplier */}
          <div className="px-4 py-3 border-t border-surface-200 bg-white space-y-3">
            <div className="flex rounded-xl bg-surface-100 border border-surface-200 overflow-hidden">
              <button onClick={() => { setClientType('client'); setCustomerId(''); setCustomerName(''); setCustomerPhone(''); setCustomerAddress('') }}
                className={cn('flex-1 px-3 py-2 text-xs font-medium transition-colors', clientType === 'client' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700')}>
                Client
              </button>
              <button onClick={() => { setClientType('fournisseur'); setCustomerId(''); setCustomerName(''); setCustomerPhone(''); setCustomerAddress('') }}
                className={cn('flex-1 px-3 py-2 text-xs font-medium transition-colors', clientType === 'fournisseur' ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700')}>
                Fournisseur
              </button>
            </div>
            <div className="relative flex-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 z-10" />
              <input value={contactSearch || customerName} onFocus={() => setContactDropdown(true)}
                onChange={e => { setContactSearch(e.target.value); setContactDropdown(true); setCustomerName(''); setCustomerId('') }}
                placeholder={clientType === 'client' ? 'Nom du client *' : 'Nom du fournisseur *'}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" required />
              {contactDropdown && filteredContacts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-surface-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                  {filteredContacts.map(c => (
                    <button key={c.id} onClick={() => selectContact(c)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-50 text-left transition-colors">
                      <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 text-xs font-bold">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-900 truncate">{c.name}</p>
                        <p className="text-xs text-surface-400">{c.phone} · {c.type === 'client' ? 'Client' : 'Fournisseur'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)}
                placeholder={clientType === 'client' ? 'Adresse client' : 'Adresse fournisseur'}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                  placeholder={clientType === 'client' ? 'Téléphone client' : 'Téléphone fournisseur'}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
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
              <input type="datetime-local" value={saleDate} onChange={e => setSaleDate(e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-surface-50 border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="flex rounded-xl bg-surface-100 border border-surface-200 overflow-hidden">
              {(['complet', 'credit', 'partiel'] as PaymentType[]).map(t => (
                <button key={t} onClick={() => setPaymentType(t)}
                  className={cn('flex-1 px-3 py-2 text-xs font-medium transition-colors',
                    paymentType === t ? 'bg-primary-600 text-white' : 'text-surface-500 hover:text-surface-700')}>
                  {t === 'complet' ? 'Complet' : t === 'credit' ? 'Crédit' : 'Partiel'}
                </button>
              ))}
            </div>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value as PayMethod)}
              className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="cash">Espèces</option>
              <option value="mobile">Mobile Money</option>
              <option value="card">Carte</option>
              <option value="bank">Virement</option>
            </select>
          </div>

          {/* Validate */}
          <div className="px-4 py-3 border-t border-surface-200 bg-white space-y-2">
            <button onClick={() => {
              if (!customerName) { toast('Nom du client requis', 'warning'); return }
              if (paymentType === 'credit') { setCreditOpen(true); return }
              if (paymentType === 'partiel') { setSplitOpen(true); return }
              handleSale()
            }}
              disabled={cart.length === 0}
              className={cn('w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
                cart.length > 0
                  ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-200 active:scale-[0.98]'
                  : 'bg-surface-100 text-surface-400 cursor-not-allowed')}>
              <CreditCard className="w-4 h-4" />
              Valider ({currency(total)})
            </button>
            <div className="flex gap-2">
              <button onClick={async () => {
                try {
                  const connected = thermalPrinter.isConnected() || await thermalPrinter.connect()
                  if (connected) {
                    await thermalPrinter.printReceipt([
                      { text: 'NEOX ERP', bold: true, doubleWidth: true, align: 'center' },
                      { text: 'Facture de vente', align: 'center' },
                      { text: '---' },
                      ...cart.map(i => ({ text: `${i.productName} x${i.quantity}  ${currency(i.quantity * i.unitPrice)}` })),
                      { text: '---' },
                      { text: `Total: ${currency(total)}`, bold: true, align: 'right' },
                      { text: 'Merci de votre visite !', align: 'center' },
                    ])
                    await thermalPrinter.cut()
                    toast('Ticket imprimé', 'success')
                  }
                } catch { toast('Imprimante non connectée', 'warning') }
              }}
                disabled={cart.length === 0}
                className={cn('flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border border-surface-200',
                  cart.length > 0 ? 'bg-white text-surface-700 hover:bg-surface-50' : 'bg-surface-50 text-surface-300 cursor-not-allowed')}>
                <Printer className="w-4 h-4" /> Ticket
              </button>
              <button onClick={() => { if (lastSale) exportSalePDF(lastSale, dexieSettings as any) }}
                disabled={cart.length === 0}
                className={cn('flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border border-surface-200',
                  cart.length > 0 ? 'bg-white text-surface-700 hover:bg-surface-50' : 'bg-surface-50 text-surface-300 cursor-not-allowed')}>
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
            Panier ({cart.length}) &middot; {total.toLocaleString('fr-FR')} FCFA
          </button>
        </div>
      )}

      <Modal open={pickModal !== null} onClose={() => setPickModal(null)} title="Choisir le dépôt">
        {pickModal && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-surface-900">{pickModal.product.name}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(stockByProduct.get(pickModal.product.id) || []).filter(s => s.quantity > 0).map(s => (
                <button key={s.locationId} onClick={() => handlePickDepot(s.locationId)}
                  className="w-full text-left p-3 rounded-xl border border-surface-200 hover:border-primary-300 hover:bg-primary-50 transition-all flex items-center justify-between">
                  <span className="text-sm font-medium text-surface-700">{s.locationName}</span>
                  <span className="text-sm font-bold text-primary-600">Stock: {s.quantity}</span>
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

      <CreditPaymentModal open={creditOpen} onClose={() => setCreditOpen(false)} customerId={customerId}
        onPaymentComplete={() => { setCreditOpen(false); handleSale() }} />
      <SplitPaymentModal open={splitOpen} onClose={() => setSplitOpen(false)} total={total}
        onConfirm={(payments) => { setSplitOpen(false); handleSale(payments, payments.reduce((s, p) => s + p.amount, 0)) }} />

      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => { setSaleSuccess(false); clearCart() }}>
          <div className="text-center py-12 px-8 bg-white rounded-2xl border border-surface-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-success" />
            </div>
            <p className="text-xl font-bold text-surface-900">Vente confirmée !</p>
            <p className="text-sm text-surface-500 mt-1">{currency(total)}</p>
            <div className="flex gap-2 mt-6 justify-center">
              <button onClick={() => { if (lastSale) exportSalePDF(lastSale, dexieSettings as any) }}
                className="px-4 py-2 rounded-xl border border-surface-200 text-surface-700 text-sm font-medium hover:bg-surface-50 transition-colors flex items-center gap-2">
                <Download className="w-4 h-4" /> Reçu PDF
              </button>
              <button onClick={() => { setSaleSuccess(false); clearCart() }}
                className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-colors">
                Nouvelle vente
              </button>
            </div>
          </div>
        </div>
      )}
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
      <div className="space-y-4">
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