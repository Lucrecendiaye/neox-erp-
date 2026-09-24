import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { useGoBack } from '@/hooks/useGoBack'
import db from '@/db'
import { usePosStore, emptyCart, type CartState } from '@/stores/posStore'
import { generateId, formatCurrency, generateInvoiceNumber, cn, getProductUnits, getProductUnitInfo, convertToMainUnit, getUnitStep, getUnitMinQty, pickContact } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  Search, ShoppingCart, Minus, Plus, X, Trash2,
  CreditCard, Printer, Download, Package, AlertTriangle,
  ChevronDown, User, Phone, MapPin, Calendar, Tag, Percent,
  Check, Send, SplitSquareVertical as SplitIcon, Banknote, Boxes, Contact as ContactIcon, MessageCircle, Edit2, Pause
} from 'lucide-react'
import { exportSalePDF, shareSalePDF, buildProductPhotos } from '@/lib/pdf'
import { shareViaWeChat } from '@/lib/share'
import { thermalPrinter, printReceiptHTML } from '@/lib/thermalPrinter'
import type { SaleItem, Product, Sale, Customer } from '@/types'
import type { ProductStock } from '@/engine/types'
import { useAppStore } from '@/stores/appStore'
import { usePermission } from '@/hooks/usePermission'
import { processSale } from '@/engine/operations'
import { addCustomerEntry } from '@/engine/customerAccount'
import { nextInvoiceNumber } from '@/engine/invoiceNumbers'
import { useSalePayment, ensureCustomer } from './salePayment'
import { SalePaymentPanel } from './SalePaymentPanel'
import UnitPriceModal from '@/components/pos/UnitPriceModal'
import { CreditSaleEditModal } from '@/components/credit/CreditSaleModals'
import MobileCartSheet from '@/components/pos/MobileCartSheet'
import PaymentScreen from '@/components/pos/PaymentScreen'
import SyncIndicator from '@/components/ui/SyncIndicator'
import { Modal, NumericInput } from '@/components/ui'
import { syncWriteObject } from '@/lib/realtime'
import { StockAllocationRequiredError, type StockSourceOption } from '@/engine/stockAllocation'

type CartStatus = 'nouveau' | 'encours' | 'attente' | 'pret'

interface SourceModalState {
  product: Product
  unitName: string
  unitPrice: number
  quantity: number
  shopAvailable: number
  sources: StockSourceOption[]
}

function cartStatusLabel(c: CartState, isActive: boolean): CartStatus {
  if (c.items.length === 0 && !c.onHold) return 'nouveau'
  if (c.onHold) return 'attente'
  return isActive ? 'pret' : 'encours'
}

const CART_STATUS_LABELS: Record<CartStatus, string> = {
  nouveau: 'Nouveau',
  encours: 'En cours',
  attente: 'En attente',
  pret: 'Prêt à payer',
}

export default function POSPage() {
  const businessId = useBusinessId()
  const location = useLocation()
  const navigate = useNavigate()
  const goBack = useGoBack()
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const allCustomers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const categories = useLiveQuery(() => db.categories.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const allStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const settings = useLiveQuery(() => db.settings.get('default'), [])

  const shopLocation = useLiveQuery(() => db.locations.where('businessId').equals(businessId).filter(l => l.type === 'shop').first(), [businessId])
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const shopId = shopLocation?.id || ''

  const userId = useAppStore(s => s.user?.id || '')
  const userName = useAppStore(s => s.user?.name || 'Vendeur')
  const { can } = usePermission()
  const shopStocks = useMemo(() => {
    const map = new Map<string, ProductStock>()
    allStocks.forEach((s: any) => {
      if (s.locationId === shopId) map.set(s.productId, s as ProductStock)
    })
    return map
  }, [allStocks, shopId])

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [cartSheetOpen, setCartSheetOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)

  const carts = usePosStore(s => s.carts)
  const setCarts = usePosStore(s => s.setCarts)
  const activeCartIndex = usePosStore(s => s.activeCartIndex)
  const setActiveCartIndex = usePosStore(s => s.setActiveCartIndex)
  const clearCarts = usePosStore(s => s.clearCarts)
  const saleCustomer = location.state?.saleCustomer as { id?: string; name?: string; phone?: string; address?: string } | undefined
  const appliedCustomerId = useRef<string | null>(null)

  const prevBusinessId = useRef(businessId)
  useEffect(() => {
    if (prevBusinessId.current !== businessId) {
      prevBusinessId.current = businessId
      clearCarts()
    }
  }, [businessId, clearCarts])

  useEffect(() => {
    if (!saleCustomer?.id || !businessId || appliedCustomerId.current === saleCustomer.id) return
    const targetIndex = carts.findIndex(c => c.items.length === 0 && !c.onHold)
    const idx = targetIndex >= 0 ? targetIndex : activeCartIndex
    appliedCustomerId.current = saleCustomer.id
    setActiveCartIndex(idx)
    setCarts(prev => prev.map((c, i) => i === idx
      ? { ...c, customerId: saleCustomer.id!, customerName: saleCustomer.name || '', customerPhone: saleCustomer.phone || '', customerAddress: saleCustomer.address || '' }
      : c
    ))
    navigate(location.pathname, { replace: true, state: null })
  }, [saleCustomer, businessId, carts, activeCartIndex, setActiveCartIndex, setCarts, navigate, location.pathname])

  const [customerOpen, setCustomerOpen] = useState(false)
  const [pendingCustomerModal, setPendingCustomerModal] = useState(false)
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 16))

  const [saleSuccess, setSaleSuccess] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [editSaleId, setEditSaleId] = useState<string | null>(null)
  const [saleSubmitting, setSaleSubmitting] = useState(false)
  const saleSubmittingRef = useRef(false)

  const [unitPriceModal, setUnitPriceModal] = useState<{ product: Product; unitName: string; itemKey?: string; stockOverride?: number; initialQuantity?: number } | null>(null)
  const [quickProductOpen, setQuickProductOpen] = useState(false)
  const [quickProductForm, setQuickProductForm] = useState({ name: '', unit: 'piece' as Product['unit'], purchaseCost: 0, packQty: 0, packUnit: 'piece' as 'piece' | 'dozen', stock: 1 })
  const [sourceModal, setSourceModal] = useState<SourceModalState | null>(null)


  const filteredCategories = useMemo(() => {
    const ids = new Set(products.map(p => p.categoryId).filter(Boolean))
    return categories.filter((c: any) => ids.has(c.id))
  }, [categories, products])

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q)) return false
      }
      if (categoryId !== 'all' && p.categoryId !== categoryId) return false
      return true
    })
  }, [products, search, categoryId])

  const cartTotals = useMemo(() =>
    carts.map(c => {
      const subtotal = c.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
      return { subtotal, total: Math.max(0, subtotal - c.discount) }
    }),
    [carts]
  )

  const pays = [
    useSalePayment(cartTotals[0].total),
    useSalePayment(cartTotals[1].total),
    useSalePayment(cartTotals[2].total),
    useSalePayment(cartTotals[3].total),
  ]

  const activeCart = carts[activeCartIndex]
  const cart = activeCart.items
  const subtotal = cartTotals[activeCartIndex].subtotal
  const total = cartTotals[activeCartIndex].total
  const discount = activeCart.discount
  const customerId = activeCart.customerId
  const customerName = activeCart.customerName
  const customerPhone = activeCart.customerPhone
  const customerAddress = activeCart.customerAddress
  const pay = pays[activeCartIndex]

  const desktopMatches = useMemo(() => {
    const q = customerName.trim().toLowerCase()
    if (!q) return []
    return allCustomers.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)).slice(0, 5)
  }, [customerName, allCustomers])

  function updateCart(idx: number, fn: (c: CartState) => CartState) {
    setCarts(prev => prev.map((c, i) => (i === idx ? fn(c) : c)))
  }

  function setActiveCartItems(fn: (items: SaleItem[]) => SaleItem[]) {
    setCarts(prev => prev.map((c, i) => (i === activeCartIndex ? { ...c, items: fn(c.items), onHold: false } : c)))
  }

  function setActiveCartDiscount(v: number) {
    setCarts(prev => prev.map((c, i) => (i === activeCartIndex ? { ...c, discount: Math.max(0, v) } : c)))
  }

  function setActiveCartCustomer(patch: Partial<Pick<CartState, 'customerId' | 'customerName' | 'customerPhone' | 'customerAddress'>>) {
    setCarts(prev => prev.map((c, i) => (i === activeCartIndex ? { ...c, ...patch } : c)))
  }

  function resetCart(idx: number) {
    setCarts(prev => prev.map((c, i) => (i === idx ? emptyCart() : c)))
    pays[idx].reset()
  }

  function resetActiveCart() {
    resetCart(activeCartIndex)
    setCartSheetOpen(false)
    setPaymentOpen(false)
  }

  function selectCart(idx: number) {
    setActiveCartIndex(idx)
    if (carts[idx].onHold) updateCart(idx, c => ({ ...c, onHold: false }))
  }

  function holdActiveCart() {
    if (activeCart.items.length === 0) {
      toast('Panier vide — rien à mettre en attente', 'error')
      return
    }
    if (activeCart.onHold) return
    updateCart(activeCartIndex, c => ({ ...c, onHold: true }))
    let next = carts.findIndex((c, i) => i !== activeCartIndex && c.items.length > 0 && !c.onHold)
    if (next === -1) next = carts.findIndex((c, i) => i !== activeCartIndex && c.items.length === 0 && !c.onHold)
    setActiveCartIndex(next >= 0 ? next : (activeCartIndex + 1) % 4)
    toast(`Panier P${activeCartIndex + 1} mis en attente`, 'success')
  }

  function newCart() {
    const idx = carts.findIndex(c => c.items.length === 0 && !c.onHold)
    if (idx === -1) {
      toast('4 paniers maximum — mettez un panier en attente ou videz-en un', 'error')
      return
    }
    resetCart(idx)
    setActiveCartIndex(idx)
    setCartSheetOpen(false)
    setPaymentOpen(false)
    toast(`Nouveau panier P${idx + 1}`, 'success')
  }
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

  function availableStockFor(productId: string) {
    return availableStockAt(productId, shopId)
  }

  function stockAt(productId: string, locationId: string) {
    return allStocks.find(s => s.productId === productId && s.locationId === locationId)?.quantity ?? 0
  }

  function availableStockAt(productId: string, locationId: string) {
    if (!locationId) return 0
    let reserved = 0
    carts.forEach((c, i) => {
      if (i === activeCartIndex) return
      c.items.forEach(it => {
        const itemLocationId = it.locationId || shopId
        if (it.productId === productId && itemLocationId === locationId) reserved += it.quantity * (it.unitQuantity || 1)
      })
    })
    return Math.max(0, stockAt(productId, locationId) - reserved)
  }

  /** Total sellable stock for a product across the shop and all active warehouses. */
  function totalAvailableStock(productId: string) {
    const sellable = locations.filter(l => l.type === 'shop' || l.type === 'warehouse')
    const list = sellable.length ? sellable : (shopLocation ? [shopLocation] : [])
    return list.reduce((sum, l) => sum + availableStockAt(productId, l.id), 0)
  }

  /** Main-unit quantity already present in the active cart for a product. */
  function cartMainQty(productId: string) {
    return activeCart.items
      .filter(i => i.productId === productId)
      .reduce((s, i) => s + i.quantity * (i.unitQuantity || 1), 0)
  }

  function cartItemKey(i: SaleItem) {
    return `${i.productId}::${i.unitName || 'Pièce'}::${i.locationId || shopId}`
  }

  async function handleUnitPriceConfirm(price: number, quantity: number) {
    if (!unitPriceModal) return
    const { product, unitName, itemKey, stockOverride } = unitPriceModal
    setUnitPriceModal(null)
    if (itemKey) {
      const unit = getProductUnits(product).find(u => u.name === unitName)
      if (!unit) return
      const lineMainQty = quantity * unit.quantity
      const otherLines = activeCart.items
        .filter(i => cartItemKey(i) !== itemKey && i.productId === product.id)
        .reduce((s, i) => s + i.quantity * (i.unitQuantity || 1), 0)
      const available = totalAvailableStock(product.id)
      if (otherLines + lineMainQty > available) {
        toast(`Stock insuffisant pour "${product.name}" : ${available} disponible(s), ${otherLines + lineMainQty} demandé(s)`, 'error')
        return
      }
      setActiveCartItems(prev => prev.map(i =>
        cartItemKey(i) === itemKey
           ? { ...i, unitName, unitQuantity: unit.quantity, quantity, unitPrice: price, total: quantity * price - i.discount }
          : i
      ))
    } else {
      addToCart(product, unitName, price, stockOverride, quantity)
    }
  }

  function openSourceModal(product: Product, unitName: string, unitPrice: number, quantity: number, shopAvailable: number, excludeLocationId?: string) {
    const sources: StockSourceOption[] = locations
      .filter(l => l.type === 'warehouse' && l.isActive !== false && l.id !== excludeLocationId)
      .map(l => ({ locationId: l.id, locationName: l.name, type: 'warehouse' as const, quantity: stockAt(product.id, l.id) }))
    setSourceModal({ product, unitName, unitPrice, quantity, shopAvailable, sources })
  }

  function addFromSource(source: StockSourceOption) {
    if (!sourceModal) return
    const unit = getProductUnits(sourceModal.product).find(u => u.name === sourceModal.unitName)
    if (!unit) return
    const available = availableStockAt(sourceModal.product.id, source.locationId)
    if (sourceModal.quantity * unit.quantity > available) {
      toast(`Stock insuffisant dans ${source.locationName}`, 'error')
      return
    }
    const item: SaleItem = {
      productId: sourceModal.product.id,
      productName: sourceModal.product.name,
      quantity: sourceModal.quantity,
      unitPrice: sourceModal.unitPrice,
      discount: 0,
      taxRate: 0,
      total: sourceModal.quantity * sourceModal.unitPrice,
      unitName: unit.name,
      unitQuantity: unit.quantity,
      locationId: source.locationId,
      locationName: source.locationName,
    }
    setActiveCartItems(prev => {
      const key = cartItemKey(item)
      const existing = prev.find(i => cartItemKey(i) === key)
      if (!existing) return [item, ...prev]
      return prev.map(i => cartItemKey(i) === key
        ? { ...i, quantity: i.quantity + item.quantity, total: (i.quantity + item.quantity) * i.unitPrice - i.discount }
        : i
      )
    })
    setSourceModal(null)
  }

  function addToCart(product: Product, unitName?: string, priceOverride?: number, stockOverride?: number, quantityOverride = 1) {
    const units = getProductUnits(product)
    const unit = units.find(u => u.name === unitName) || units[0]
    if (priceOverride === undefined) {
      setUnitPriceModal({ product, unitName: unit.name, initialQuantity: quantityOverride })
      return
    }
    const unitQty = unit.quantity
    const effectivePrice = priceOverride

    const requestedQuantity = Math.max(0.1, Number(quantityOverride) || 1)

    const availableTotal = totalAvailableStock(product.id)
    const alreadyInCart = cartMainQty(product.id)
    const requestedMainQty = requestedQuantity * unitQty
    if (alreadyInCart + requestedMainQty > availableTotal) {
      const remaining = Math.max(0, availableTotal - alreadyInCart)
      toast(
        `Stock insuffisant pour "${product.name}" : ${availableTotal} disponible(s)${alreadyInCart > 0 ? ` (dont ${alreadyInCart} déjà au panier)` : ''}. Quantité maximale restante : ${remaining}`,
        'error'
      )
      return
    }

    const shopAvailable = stockOverride ?? availableStockFor(product.id)
    const shopCapacity = Math.floor(shopAvailable / unitQty)
    const shopKey = `${product.id}::${unit.name}::${shopId}`
    const existingShop = cart.find(i => cartItemKey(i) === shopKey)
    const existingQuantity = existingShop?.quantity || 0
    const shopQuantity = Math.min(requestedQuantity, Math.max(0, shopCapacity - existingQuantity))

    if (shopQuantity > 0 && shopId) {
      setActiveCartItems(prev => {
        const existing = prev.find(i => cartItemKey(i) === shopKey)
        if (existing) {
          const newQty = +(existing.quantity + shopQuantity).toFixed(1)
          return prev.map(i => cartItemKey(i) === shopKey
            ? { ...i, quantity: newQty, total: newQty * effectivePrice - i.discount }
            : i
          )
        }
        return [{
          productId: product.id, productName: product.name,
          quantity: shopQuantity, unitPrice: effectivePrice, discount: 0, taxRate: 0,
          total: shopQuantity * effectivePrice, unitName: unit.name, unitQuantity: unitQty,
          locationId: shopId,
          locationName: 'Boutique',
        }, ...prev]
      })
    }

    const missingQuantity = +(requestedQuantity - shopQuantity).toFixed(3)
    if (missingQuantity > 0) openSourceModal(product, unit.name, effectivePrice, missingQuantity, shopAvailable)
  }

  function requestAdditionalSource(item: SaleItem, targetQuantity: number) {
    const product = products.find(p => p.id === item.productId)
    if (!product) return
    const unitQty = item.unitQuantity || 1
    const sourceId = item.locationId || shopId
    const maxQuantity = Math.floor((availableStockAt(item.productId, sourceId) + item.quantity * unitQty) / unitQty)
    const allowedQuantity = Math.max(0, Math.min(targetQuantity, maxQuantity))
    setActiveCartItems(prev => prev.flatMap(i => {
      if (cartItemKey(i) !== cartItemKey(item)) return [i]
      if (allowedQuantity < getUnitMinQty(i.unitName || 'Pièce')) return []
      return [{ ...i, quantity: allowedQuantity, total: allowedQuantity * i.unitPrice - i.discount }]
    }))
    openSourceModal(product, item.unitName || 'Pièce', item.unitPrice, targetQuantity - allowedQuantity, availableStockFor(item.productId), sourceId)
  }

  function updateQuantity(itemKey: string, delta: number) {
    const item = cart.find(i => cartItemKey(i) === itemKey)
    if (!item) return
    const minQty = getUnitMinQty(item.unitName || 'Pièce')
    const newQty = +(item.quantity + delta).toFixed(1)
    if (newQty < minQty) {
      removeFromCart(itemKey)
      return
    }
    setQuantity(itemKey, newQty)
  }

  function setQuantity(itemKey: string, value: number) {
    const item = cart.find(i => cartItemKey(i) === itemKey)
    if (!item) return
    const minQty = getUnitMinQty(item.unitName || 'Pièce')
    const newQty = Math.max(minQty, +(value || minQty).toFixed(1))
    const unitQty = item.unitQuantity || 1
    const otherLines = cart
      .filter(i => i.productId === item.productId && cartItemKey(i) !== itemKey)
      .reduce((s, i) => s + i.quantity * (i.unitQuantity || 1), 0)
    const availableTotal = totalAvailableStock(item.productId)
    const maxByTotal = Math.floor(Math.max(0, availableTotal - otherLines) / unitQty)
    if (newQty * unitQty > availableTotal - otherLines) {
      toast(`Stock insuffisant : ${availableTotal} disponible(s) au total (boutique + dépôts). Quantité maximale : ${Math.max(0, maxByTotal)}`, 'error')
      if (maxByTotal < minQty) return
      setActiveCartItems(prev => prev.map(i => cartItemKey(i) === itemKey
        ? { ...i, quantity: maxByTotal, total: maxByTotal * i.unitPrice - i.discount }
        : i
      ))
      return
    }
    const sourceId = item.locationId || shopId
    const maxQuantity = Math.floor((availableStockAt(item.productId, sourceId) + item.quantity * unitQty) / unitQty)
    if (newQty > maxQuantity) {
      requestAdditionalSource(item, newQty)
      return
    }
    setActiveCartItems(prev => prev.map(i => cartItemKey(i) === itemKey
      ? { ...i, quantity: newQty, total: newQty * i.unitPrice - i.discount }
      : i
    ))
  }

  function updateCartUnit(itemKey: string, newUnitName: string) {
    const item = cart.find(i => cartItemKey(i) === itemKey)
    const product = item ? products.find(p => p.id === item.productId) : undefined
    if (product && item) {
      setUnitPriceModal({ product, unitName: newUnitName, itemKey, initialQuantity: item.quantity })
    }
  }

  function updateCartPrice(itemKey: string, newPrice: number) {
    setActiveCartItems(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      return {
        ...i,
        unitPrice: newPrice,
        total: i.quantity * newPrice - i.discount,
      }
    }))
  }

  function removeFromCart(itemKey: string) {
    setActiveCartItems(prev => prev.filter(i => cartItemKey(i) !== itemKey))
  }

  function openQuickProduct() {
    setQuickProductForm({ name: search.trim(), unit: 'piece', purchaseCost: 0, packQty: 0, packUnit: 'piece', stock: 1 })
    setQuickProductOpen(true)
  }

  async function createQuickProduct() {
    const name = quickProductForm.name.trim()
    const purchaseCost = Math.max(0, Number(quickProductForm.purchaseCost) || 0)
    const packSize = quickProductForm.unit === 'pack' ? (quickProductForm.packUnit === 'dozen' ? quickProductForm.packQty * 12 : quickProductForm.packQty) : undefined
    const purchasePrice = Math.round((purchaseCost / (quickProductForm.unit === 'dozen' ? 12 : quickProductForm.unit === 'pack' ? (packSize || 1) : 1)) * 100) / 100
    const stock = Math.max(1, Math.floor(Number(quickProductForm.stock) || 0))

    if (!name) { toast('Nom du produit requis', 'warning'); return }
    if (!purchaseCost || purchaseCost <= 0) { toast('Prix de revient requis', 'warning'); return }
    if (quickProductForm.unit === 'pack' && (!packSize || packSize <= 0)) { toast('Indiquez la composition du paquet', 'warning'); return }
    if (!shopId) { toast('Boutique indisponible, réessayez dans un instant', 'error'); return }

    const now = new Date().toISOString()
    const product: Product = {
      id: generateId(), businessId, name, photos: [], unit: quickProductForm.unit,
      purchasePrice, sellingPrice: 0, wholesalePrice: 0, packSize,
      margin: 0, taxRate: 0,
      stockAlert: 0, location: '', status: 'active', createdAt: now, updatedAt: now,
    }
    const movement = {
      id: generateId(), businessId, locationId: shopId, productId: product.id,
      type: 'in' as const, quantity: stock, unitPrice: purchasePrice,
      reference: 'INIT', note: 'Produit créé rapidement depuis la vente', createdAt: now, userId,
    }
    const productStock = {
      id: generateId(), businessId, productId: product.id, locationId: shopId,
      quantity: stock, stockAlert: 0, stockMin: 0, stockMax: 0, updatedAt: now,
    }

    try {
      await db.transaction('rw', db.products, db.stockMovements, db.productStocks, async () => {
        await db.products.add(product)
        await db.stockMovements.add(movement)
        await db.productStocks.add(productStock)
      })
      try {
        await syncWriteObject('products', product)
        await syncWriteObject('stockMovements', movement)
        await syncWriteObject('productStocks', productStock)
      } catch { /* local creation remains valid while offline */ }
    } catch {
      toast('Impossible de créer le produit', 'error')
      return
    }

    setSearch('')
    setQuickProductOpen(false)
    const unit = getProductUnitInfo(product)
    setUnitPriceModal({ product, unitName: unit.name, stockOverride: stock })
    toast(`${name} créé, indiquez son prix de vente`, 'success')
  }

  async function handleSale(createCustomer?: boolean) {
    if (saleSubmittingRef.current) return
    saleSubmittingRef.current = true
    setSaleSubmitting(true)
    try {
      await handleSaleOnce(createCustomer)
    } finally {
      saleSubmittingRef.current = false
      setSaleSubmitting(false)
    }
  }

  async function handleSaleOnce(createCustomer?: boolean) {
    if (cart.length === 0) return
    for (const item of cart) {
      const needed = item.quantity * (item.unitQuantity || 1)
      const otherLines = cart
        .filter(i => i.productId === item.productId && cartItemKey(i) !== cartItemKey(item))
        .reduce((s, i) => s + i.quantity * (i.unitQuantity || 1), 0)
      const available = totalAvailableStock(item.productId)
      if (otherLines + needed > available) {
        toast(`Stock insuffisant pour "${item.productName}" : ${available} disponible(s), ${otherLines + needed} demandé(s). Vente bloquée.`, 'error')
        return
      }
    }
    if (pay.isCredit && !customerId && !customerName.trim()) {
      toast('Client requis pour une vente à crédit', 'error')
      return
    }
    if (pay.paymentType === 'complet' && pay.payMethod === 'cash' && pay.isShort) {
      toast('Montant reçu insuffisant', 'error')
      return
    }
    if (pay.isSplit && pay.splitPaid <= 0) {
      toast('Saisissez au moins un montant de paiement', 'error')
      return
    }

    const name = customerName.trim()
    let shouldCreate = createCustomer
    if (!customerId && name) {
      const exact = allCustomers.some(c => (c.name || '').toLowerCase() === name.toLowerCase())
      if (exact) shouldCreate = true
      else if (shouldCreate === undefined) {
        setPendingCustomerModal(true)
        return
      }
    }

    const resolved = shouldCreate
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
    const invNum = await nextInvoiceNumber()

    const sale: Sale = {
      id: generateId(),
      businessId,
      locationId: shopId,
      invoiceNumber: invNum,
      customerId: resolved.id,
      customerName: customer?.name || resolved.name || customerName,
      customerPhone: customer?.phone || customerPhone,
      saleType: 'shop',
      items: cart,
      subtotal,
      discountTotal: discount,
      taxTotal: 0,
      total,
      paid: pay.paid,
      change: pay.isSplit ? Math.max(0, pay.splitPaid - total) : pay.change,
      paymentMethod: pay.isSplit ? 'split' : (pay.creditAmount > 0 ? 'credit' : pay.payMethod),
      splitPayments: pay.isSplit
        ? pay.splitPayments.filter(p => p.amount > 0).map(p => ({ method: p.method, amount: p.amount }))
        : undefined,
      status: 'completed',
      createdAt: saleDate,
      userId,
    }

    try {
      await processSale(sale, { downPaymentMethod: pay.isSplit ? (pay.splitPayments.find(p => p.amount > 0)?.method || 'cash') : pay.payMethod, dueDate: pay.dueDate || undefined })
    } catch (e: any) {
      if (e instanceof StockAllocationRequiredError) {
        const item = cart.find(i => i.productId === e.productId)
        const product = products.find(p => p.id === e.productId)
        if (item && product) {
          openSourceModal(product, item.unitName || 'Pièce', item.unitPrice, e.missingQuantity, e.shopQuantity)
          return
        }
      }
      toast(e?.message || 'Erreur lors de la vente', 'error')
      return
    }

    setLastSale(sale)
    setSaleSuccess(true)
    setPaymentOpen(false)
    setCartSheetOpen(false)

    if (pay.advanceKept > 0 && resolved.id) {
      try {
        await addCustomerEntry({
          customerId: resolved.id,
          customerName: sale.customerName || resolved.name || 'Client',
          type: 'advance_received',
          amount: pay.advanceKept,
          reference: invNum,
          linkedId: sale.id,
          note: `Trop-perçu conservé sur la vente ${invNum}`,
          category: 'Avance déposée',
          sideEffects: async () => {
            await db.cashBook.add({
              id: generateId(),
              businessId,
              date: saleDate,
              type: 'in',
              category: 'Avance client',
              amount: pay.advanceKept!,
              description: `Avance client (trop-perçu) — vente ${invNum}`,
              partyId: resolved.id,
              partyName: sale.customerName || resolved.name || 'Client',
              paymentMethod: pay.payMethod,
              reference: invNum,
              linkedId: sale.id,
              createdAt: saleDate,
              userId,
            })
          },
        })
        toast(`Avance client de ${formatCurrency(pay.advanceKept)} enregistrée`, 'success')
      } catch (e: any) {
        toast(e?.message || "Avance non enregistrée", 'error')
      }
    }

    resetCart(activeCartIndex)
  }

  const currency = formatCurrency

  return (
    <div className="w-full h-full flex flex-col gap-0">
      {/* Selecteur de paniers (4 max, independants) */}
      <div className="flex shrink-0 bg-surface-100 border-b border-surface-200 px-2 lg:px-4 py-2 items-center gap-2 overflow-x-auto scrollbar-none">
        {carts.map((c, idx) => {
          const isActive = idx === activeCartIndex
          const t = cartTotals[idx].total
          const status = cartStatusLabel(c, isActive)
          return (
            <button
              key={idx}
              data-testid={`cart-tab-${idx}`}
              onClick={() => selectCart(idx)}
              className={cn(
                'shrink-0 flex items-center gap-2 px-2.5 lg:px-3 py-2 rounded-xl border transition-colors min-w-0 lg:min-w-[165px]',
                isActive ? 'bg-primary-500 border-primary-500 text-on-accent shadow' : 'bg-surface-100 border-surface-300 hover:border-primary-300 text-surface-700'
              )}
            >
              <span className={cn('w-7 h-7 lg:w-8 lg:h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0', isActive ? 'bg-white/20 text-on-accent' : 'bg-surface-200 text-surface-700')}>
                {idx + 1}
              </span>
              <span className="flex flex-col min-w-0 hidden lg:flex">
                <span className={cn('text-xs font-bold truncate leading-tight', isActive ? 'text-on-accent' : 'text-surface-900')}>{c.customerName || 'Client divers'}</span>
                <span className={cn('text-[11px] truncate', isActive ? 'text-on-accent/85' : 'text-surface-500')}>
                  {CART_STATUS_LABELS[status]} · {c.items.length} art. · {formatCurrency(t)}
                </span>
              </span>
              <span className={cn('lg:hidden text-xs font-bold whitespace-nowrap', isActive ? 'text-on-accent' : 'text-surface-700')}>
                {CART_STATUS_LABELS[status]}{t > 0 ? ` · ${formatCurrency(t)}` : ''}
              </span>
            </button>
          )
        })}
        <div className="shrink-0 flex items-center gap-2 ml-auto">
          <button
            onClick={holdActiveCart}
            data-testid="cart-hold"
            disabled={activeCart.items.length === 0 || activeCart.onHold}
            className={cn(
              'px-2.5 lg:px-3 py-2 rounded-xl border text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap',
              activeCart.items.length > 0 && !activeCart.onHold
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
                : 'bg-surface-50 border-surface-200 text-surface-400 cursor-not-allowed'
            )}
          >
            <Pause className="w-4 h-4 lg:inline lg:mr-1" /><span className="hidden lg:inline">Mettre en attente</span>
          </button>
          <button
            onClick={newCart}
            data-testid="cart-new"
            className="px-2.5 lg:px-3 py-2 rounded-xl bg-primary-500 text-on-accent text-xs font-semibold hover:bg-primary-600 transition-colors min-h-[40px] whitespace-nowrap shadow shadow-primary-200"
          >
            <Plus className="w-4 h-4 lg:inline lg:mr-1" /><span className="hidden lg:inline">Nouveau panier</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-0 overflow-hidden bg-surface-100">
        {/* â”€â”€ LEFT: Catalogue â”€â”€ */}
        <div className="flex-[2] flex flex-col min-w-0 lg:border-r border-surface-200">
          {/* Toolbar */}
          <div className="p-3 lg:p-4 border-b border-surface-200 space-y-2.5 lg:space-y-3">
            {/* Mobile: vendeur + sync */}
            <div className="flex items-center justify-between lg:hidden">
              <div className="flex items-center gap-2">
                <button
                  onClick={goBack}
                  className="w-10 h-10 rounded-xl bg-surface-100 border border-surface-200 flex items-center justify-center text-surface-500"
                  title="Retour"
                  aria-label="Retour"
                >
                  <ChevronDown className="w-5 h-5 rotate-90" />
                </button>
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-400 flex items-center justify-center text-sm font-bold">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-surface-900">{userName}</span>
              </div>
              <SyncIndicator />
            </div>

            {/* Recherche produit */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
                <input
                  autoFocus
                  type="text" placeholder="Rechercher un produit..."
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-surface-100 border border-surface-300 text-base text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[48px]"
                />
              </div>
              {can('products', 'create') && (
                <button
                  onClick={openQuickProduct}
                  data-testid="quick-product"
                  title="Ajouter un nouveau produit"
                  className="shrink-0 flex items-center justify-center gap-1.5 px-3 lg:px-4 py-3 rounded-2xl bg-primary-500 text-on-accent text-sm font-bold shadow shadow-primary-200 hover:bg-primary-600 transition-colors min-h-[48px]"
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">Nouveau</span>
                </button>
              )}
            </div>

            {/* Mobile: catégories en chips */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none lg:hidden -mx-1 px-1">
              <button
                onClick={() => setCategoryId('all')}
                className={cn(
                  'shrink-0 px-4 py-2.5 rounded-full text-sm font-medium min-h-[40px] transition-colors',
                  categoryId === 'all' ? 'bg-primary-500 text-on-accent shadow' : 'bg-surface-100 border border-surface-200 text-surface-600'
                )}
              >
                Tous
              </button>
              {filteredCategories.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'shrink-0 px-4 py-2.5 rounded-full text-sm font-medium min-h-[40px] transition-colors',
                    categoryId === c.id ? 'bg-primary-500 text-on-accent shadow' : 'bg-surface-100 border border-surface-200 text-surface-600'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Desktop: catégories */}
            <div className="hidden lg:flex items-center gap-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex-1 rounded-xl border border-surface-300 bg-surface-100 px-3 py-2 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Toutes catégories</option>
                {filteredCategories.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
               </select>
            </div>
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto p-3 lg:p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredProducts.map((p) => {
                const stock = getProductStock(p.id)
                const units = getProductUnits(p)
                const sourceStocks = locations
                  .filter(l => l.type === 'shop' || l.type === 'warehouse')
                  .map(l => ({ name: l.type === 'shop' ? 'Boutique' : l.name, quantity: stockAt(p.id, l.id), type: l.type }))
                const isOut = sourceStocks.length > 0 ? sourceStocks.every(s => s.quantity <= 0) : stock <= 0
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'relative rounded-2xl border p-3 transition-all bg-surface-100 flex flex-col',
                      isOut
                        ? 'border-surface-200 bg-surface-50 opacity-60'
                        : 'border-surface-200 hover:border-primary-300 hover:shadow-md'
                    )}
                  >
                    <div className="relative">
                      <div className="w-full aspect-square bg-surface-50 rounded-xl flex items-center justify-center overflow-hidden">
                        {p.photos?.[0] ? (
                          <img loading="lazy" src={p.photos[0]} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-10 h-10 text-surface-500" />
                        )}
                      </div>
                      {isOut && (
                        <span className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-red-500/90 text-[11px] font-semibold text-white shadow">
                          Rupture
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-surface-900 leading-snug mt-2 line-clamp-2 min-h-[2.5em]">{p.name}</p>
                      <p className="text-sm font-semibold text-primary-500 mt-0.5">Prix à définir</p>
                      <p className={cn(
                        'text-xs font-medium mt-0.5',
                        isOut ? 'text-red-500' : stock <= (p.stockAlert || 5) ? 'text-amber-500' : 'text-surface-600'
                      )}>
                        {isOut ? 'En rupture' : `Stock: ${stock} pièces`}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {sourceStocks.filter(s => s.type === 'shop' || s.quantity > 0).slice(0, 3).map(s => (
                          <p key={s.name} className="text-[10px] text-surface-400">{s.name} : {s.quantity}</p>
                        ))}
                      </div>
                    </div>
                    {!isOut && (
                      <button
                        onClick={() => addToCart(p)}
                        className="w-full mt-2 py-3 rounded-xl bg-primary-500 text-on-accent font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.97] transition-transform shadow shadow-primary-200 min-h-[48px]"
                      >
                        <Plus className="w-5 h-5" /> Ajouter
                      </button>
                    )}
                    {!isOut && units.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {units.map(u => {
                          return (
                            <button
                              key={u.name}
                              onClick={() => addToCart(p, u.name)}
                              className="px-2 py-1 rounded-lg text-[11px] font-medium bg-surface-50 text-surface-500 hover:bg-primary-100 hover:text-primary-400 transition-colors min-h-[32px]"
                              title={`1 ${u.name} = ${u.quantity} pièces`}
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
                  <Package className="w-12 h-12 mb-3 text-surface-500" />
                  <p className="text-sm">Aucun produit trouvé</p>
                  {search.trim() && (
                    <button
                      onClick={openQuickProduct}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-on-accent shadow-lg shadow-primary-200 transition-colors hover:bg-primary-600"
                    >
                      <Plus className="w-4 h-4" /> Créer « {search.trim()} » rapidement
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* â”€â”€ RIGHT: Panier & Paiement (redesign mobile) â”€â”€ */}
        <div className="hidden lg:flex flex-1 flex-col min-w-0 bg-surface-50">
          {/* Fixed header */}
          <div className="shrink-0 px-4 py-3 bg-surface-100 border-b border-surface-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-surface-900">Panier P{activeCartIndex + 1} <span className="text-surface-400 font-normal">({cart.length})</span></h2>
            </div>
              <div className="flex items-center gap-2">
               {cart.length > 0 && (
                <button onClick={resetActiveCart} className="p-1.5 rounded-lg hover:bg-red-500/15 text-surface-400 hover:text-red-500 transition-colors" title="Vider le panier">
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
                  <input value={customerName} onChange={(e) => setActiveCartCustomer({ customerName: e.target.value, customerId: '' })} placeholder="Nom du client"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                {desktopMatches.length > 0 && (
                  <div className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
                    {desktopMatches.map(c => (
                      <button key={c.id} type="button" onClick={() => setActiveCartCustomer({ customerId: c.id, customerName: c.name || '', customerPhone: c.phone || '', customerAddress: c.address || '' })}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-100 transition-colors border-b border-surface-100 last:border-b-0">
                        <User className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                        <span className="text-sm text-surface-800 truncate">{c.name}</span>
                        {c.phone && <span className="text-xs text-surface-400 ml-auto">{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                    <input value={customerPhone} onChange={(e) => setActiveCartCustomer({ customerPhone: e.target.value })} placeholder="Téléphone"
                      className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-50 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <button type="button" onClick={async () => { const c = await pickContact(); if (c) { setActiveCartCustomer({ customerName: c.name, customerPhone: c.tel }); toast('Contact importé', 'success') } }}
                    className="p-2 rounded-lg bg-surface-50 border border-surface-300 text-surface-500 hover:text-primary-400" title="Importer">
                    <ContactIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
                  <input value={customerAddress} onChange={(e) => setActiveCartCustomer({ customerAddress: e.target.value })} placeholder="Adresse"
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
              const sourceName = item.locationId === shopId ? 'Boutique' : locations.find(l => l.id === item.locationId)?.name || 'Dépôt'
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
                       <span className="inline-block mt-1 rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-500">Source : {sourceName}</span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <select value={item.unitName || 'Pièce'} onChange={(e) => updateCartUnit(key, e.target.value)}
                          className="text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1.5 py-0.5 text-surface-600 focus:outline-none">
                          {units.map(u => (<option key={u.name} value={u.name}>{u.name}</option>))}
                        </select>
                        <span className="text-xs text-surface-500">×</span>
                        <NumericInput min={getUnitMinQty(item.unitName || 'Pièce')} step={getUnitStep(item.unitName || 'Pièce')}
                          value={item.quantity}
                          onChange={(e) => {
                            const minQty = getUnitMinQty(item.unitName || 'Pièce')
                            const q = Math.max(minQty, Number(e.target.value) || minQty)
                            const unitQty = item.unitQuantity || 1
                            const maxUnit = Math.floor(availableStockFor(item.productId) / unitQty)
                            const capped = Math.min(q, Math.max(maxUnit, minQty))
                            setActiveCartItems(prev => prev.map(i => cartItemKey(i) === key ? { ...i, quantity: capped, total: capped * i.unitPrice - i.discount } : i))
                          }}
                          className="w-14 text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-center focus:outline-none" />
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[11px] text-surface-400">Prix vente:</span>
                        <NumericInput min="0" step="1" value={item.unitPrice}
                          onChange={(e) => updateCartPrice(key, Math.max(0, Number(e.target.value) || 0))}
                          className="w-16 text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1 py-0.5 text-surface-700 text-right focus:outline-none" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => updateQuantity(key, -1)} className="w-9 h-9 rounded-xl bg-surface-100 flex items-center justify-center text-surface-500 hover:bg-surface-200 active:bg-surface-300 transition-colors">
                      <Minus className="w-4 h-4" />
                    </button>
                    <NumericInput
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
                    <span className="ml-auto text-lg font-bold text-primary-400">{currency(item.total)}</span>
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
                  <NumericInput min="0" value={discount || ''}
                    onChange={(e) => setActiveCartDiscount(Math.max(0, Number(e.target.value) || 0))}
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
            <button onClick={() => handleSale()} disabled={cart.length === 0 || pay.isShort || saleSubmitting}
              className={cn(
                'w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
                cart.length > 0
                  ? 'bg-primary-500 hover:bg-primary-600 text-on-accent shadow-lg shadow-primary-200 active:scale-[0.98]'
                  : 'bg-surface-100 text-surface-400 cursor-not-allowed'
              )}>
              <CreditCard className="w-5 h-5" />
              {saleSubmitting ? 'Enregistrement...' : `Valider (${currency(total)})`}
            </button>
            <div className="flex gap-2">
              <button onClick={async () => {
                const customer = allCustomers.find(c => c.id === customerId)
                const saleData = { invoiceNumber: generateInvoiceNumber(settings?.invoicePrefix || 'INV-', settings?.invoiceNextNumber || 1), items: cart.map(i => ({ productName: i.productName, quantity: i.quantity, unitName: i.unitName, unitPrice: i.unitPrice, total: i.total })), total, paid: pay.paid, change: pay.isSplit ? Math.max(0, pay.splitPaid - total) : pay.change, customerName: customer?.name || customerName, createdAt: saleDate, paymentMethod: pay.isSplit ? 'split' : (pay.creditAmount > 0 ? 'credit' : pay.payMethod), splitPayments: pay.isSplit ? pay.splitPayments.filter(p => p.amount > 0) : undefined }
                try { const connected = thermalPrinter.isConnected() || await thermalPrinter.connect()
                  if (connected) {
                    const payNames: Record<string, string> = { cash: 'Espèces', wave: 'Wave', orange: 'Orange', mobile: 'Mobile', card: 'Carte', bank: 'Virement' }
                    const ticketLines: { text: string; bold?: boolean; doubleWidth?: boolean; align?: 'left' | 'center' | 'right' }[] = [
                      { text: 'NEOX ERP', bold: true, doubleWidth: true, align: 'center' },
                      { text: 'Facture de vente', align: 'center' },
                      { text: '---' },
                      ...cart.map(i => ({ text: `${i.productName} x${i.quantity}  ${currency(i.total)}` })),
                      { text: '---' },
                      { text: `Total: ${currency(total)}`, bold: true, align: 'right' },
                      { text: `Paye: ${currency(pay.paid)}`, align: 'right' },
                    ]
                    if (pay.isSplit) {
                      for (const p of pay.splitPayments.filter(p => p.amount > 0)) {
                        ticketLines.push({ text: `  ${payNames[p.method]}: ${currency(p.amount)}` })
                      }
                    } else {
                      ticketLines.push({ text: `Mode: ${payNames[pay.payMethod] || pay.payMethod}` })
                    }
                    if (pay.paid < total) ticketLines.push({ text: `Reste: ${currency(total - pay.paid)}`, bold: true, align: 'right' })
                    ticketLines.push({ text: '', align: 'center' }, { text: 'Merci de votre visite !', align: 'center' })
                    await thermalPrinter.printReceipt(ticketLines); await thermalPrinter.cut(); toast('Ticket imprimé', 'success'); return
                  }
                } catch {}
                printReceiptHTML(saleData, settings?.name)
              }} disabled={cart.length === 0}
                className={cn('flex-1 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 border border-surface-200', cart.length > 0 ? 'bg-surface-100 text-surface-700 hover:bg-surface-50' : 'bg-surface-50 text-surface-500 cursor-not-allowed')}>
                <Printer className="w-3.5 h-3.5" /> Ticket
              </button>
              <button onClick={async () => { if (lastSale) exportSalePDF(lastSale, settings, await buildProductPhotos(products), userName) }} disabled={cart.length === 0}
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

      {/* Mobile: fixed cart bar (toujours visible) */}
      {cart.length > 0 && !paymentOpen && (
        <div
          className="lg:hidden fixed left-3 right-3 z-30 pointer-events-none"
          style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={() => setCartSheetOpen(true)}
            className="pointer-events-auto w-full py-4 px-5 rounded-2xl bg-primary-500 text-on-accent font-bold shadow-xl shadow-primary-200 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform min-h-[56px]"
          >
            <span className="flex items-center gap-2 text-base">
              <ShoppingCart className="w-6 h-6" />
              Panier P{activeCartIndex + 1} ({cart.length})
            </span>
            <span className="text-sm opacity-90">Qté {cart.reduce((s, i) => s + i.quantity, 0)}</span>
            <span className="text-lg font-extrabold">{currency(total)}</span>
          </button>
        </div>
      )}

      {/* Mobile: cart bottom sheet */}
      <MobileCartSheet
        open={cartSheetOpen}
        onClose={() => setCartSheetOpen(false)}
        title={`Panier P${activeCartIndex + 1}`}
        cart={cart}
        products={products}
        subtotal={subtotal}
        discount={discount}
        setDiscount={setActiveCartDiscount}
        total={total}
        updateQuantity={updateQuantity}
        setQuantity={setQuantity}
        updateCartUnit={updateCartUnit}
        updateCartPrice={updateCartPrice}
        removeFromCart={removeFromCart}
        clearCart={resetActiveCart}
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
        setCustomerId={(id) => setActiveCartCustomer({ customerId: id })}
        customerName={customerName}
        setCustomerName={(v) => setActiveCartCustomer({ customerName: v })}
        customerPhone={customerPhone}
        setCustomerPhone={(v) => setActiveCartCustomer({ customerPhone: v })}
        customerAddress={customerAddress}
        setCustomerAddress={(v) => setActiveCartCustomer({ customerAddress: v })}
        customerOpen={customerOpen}
        setCustomerOpen={setCustomerOpen}
        submitting={saleSubmitting}
        onConfirm={handleSale}
      />

      <UnitPriceModal
        key={unitPriceModal ? `${unitPriceModal.product.id}:${unitPriceModal.unitName}:${unitPriceModal.itemKey || 'new'}` : 'closed'}
        open={!!unitPriceModal}
        productName={unitPriceModal?.product.name || ''}
        unitName={unitPriceModal?.unitName || ''}
        initialQuantity={unitPriceModal?.initialQuantity}
        onConfirm={handleUnitPriceConfirm}
        onClose={() => setUnitPriceModal(null)}
      />

      <Modal open={sourceModal !== null} onClose={() => setSourceModal(null)} title="Compléter avec un dépôt" size="md">
        {sourceModal && (
          <div className="space-y-4 p-5">
            <div className="rounded-2xl bg-primary-50 border border-primary-200 p-4 space-y-1">
              <p className="font-bold text-surface-900">{sourceModal.product.name}</p>
              <p className="text-sm text-surface-600">Quantité à ajouter : <strong>{sourceModal.quantity}</strong> {sourceModal.unitName}</p>
              <p className="text-sm text-surface-600">Boutique disponible : <strong>{sourceModal.shopAvailable}</strong></p>
              <p className="text-sm font-semibold text-amber-600">Il manque {sourceModal.quantity} unité(s) dans la boutique.</p>
            </div>
            <p className="text-sm font-semibold text-surface-700">Sélectionnez la source complémentaire :</p>
            <div className="space-y-2">
              {sourceModal.sources.map(source => {
                const unitQty = getProductUnits(sourceModal.product).find(u => u.name === sourceModal.unitName)?.quantity || 1
                const available = availableStockAt(sourceModal.product.id, source.locationId)
                const canCover = sourceModal.quantity * unitQty <= available
                return (
                  <button
                    key={source.locationId}
                    type="button"
                    disabled={!canCover}
                    onClick={() => addFromSource({ ...source, quantity: available })}
                    className={cn('w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors', canCover ? 'border-surface-200 bg-surface-100 hover:border-primary-300 hover:bg-primary-50' : 'border-surface-100 bg-surface-50 text-surface-400 cursor-not-allowed')}
                  >
                    <span className="text-sm font-semibold">{source.locationName}</span>
                    <span className="text-sm font-bold">{available} disponibles</span>
                  </button>
                )
              })}
              {sourceModal.sources.length === 0 && <p className="text-sm text-danger">Aucun dépôt disponible.</p>}
            </div>
          </div>
        )}
      </Modal>

      {quickProductOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-3xl bg-surface-100 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-surface-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-surface-900">Produit rapide</h2>
                <p className="mt-0.5 text-xs text-surface-500">Créez-le sans quitter la vente</p>
              </div>
              <button onClick={() => setQuickProductOpen(false)} className="rounded-xl p-2 text-surface-400 hover:bg-surface-50 hover:text-surface-700" aria-label="Fermer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <label className="block text-sm font-medium text-surface-700">
                Nom du produit
                <input
                  autoFocus value={quickProductForm.name}
                  onChange={(e) => setQuickProductForm({ ...quickProductForm, name: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-surface-300 bg-surface-50 px-4 py-3 text-base text-surface-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </label>
              <label className="block text-sm font-medium text-surface-700">
                Unité
                <select
                  value={quickProductForm.unit}
                  onChange={(e) => setQuickProductForm({ ...quickProductForm, unit: e.target.value as Product['unit'] })}
                  className="mt-1.5 w-full rounded-xl border border-surface-300 bg-surface-50 px-4 py-3 text-base text-surface-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="piece">Pièce</option>
                  <option value="dozen">Douzaine</option>
                </select>
              </label>
              {quickProductForm.unit === 'pack' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-surface-700">
                    Composition
                    <select value={quickProductForm.packUnit} onChange={(e) => setQuickProductForm({ ...quickProductForm, packUnit: e.target.value as 'piece' | 'dozen' })} className="mt-1.5 w-full rounded-xl border border-surface-300 bg-surface-50 px-3 py-3 text-sm text-surface-900">
                      <option value="piece">Pièces</option>
                      <option value="dozen">Douzaines</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-surface-700">
                    Nombre
                    <NumericInput min="1" value={quickProductForm.packQty || ''} onChange={(e) => setQuickProductForm({ ...quickProductForm, packQty: Number(e.target.value) || 0 })} className="mt-1.5" />
                  </label>
                </div>
              )}
              <label className="block text-sm font-medium text-surface-700">
                Prix de revient ({quickProductForm.unit === 'piece' ? 'pièce' : quickProductForm.unit === 'dozen' ? 'douzaine' : 'paquet'})
                <NumericInput min="0" value={quickProductForm.purchaseCost || ''} onChange={(e) => setQuickProductForm({ ...quickProductForm, purchaseCost: Number(e.target.value) || 0 })} className="mt-1.5" />
              </label>
              <label className="block text-sm font-medium text-surface-700">
                Stock initial (pièces)
                <NumericInput min="1" value={quickProductForm.stock} onChange={(e) => setQuickProductForm({ ...quickProductForm, stock: Number(e.target.value) || 0 })} className="mt-1.5" />
              </label>
              <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-primary-700">Le produit sera ajouté au catalogue et au stock. Le prix de vente sera demandé ensuite.</p>
            </div>
            <div className="flex gap-3 border-t border-surface-200 px-5 py-4">
              <button onClick={() => setQuickProductOpen(false)} className="flex-1 rounded-xl border border-surface-200 bg-surface-100 px-4 py-3 text-sm font-semibold text-surface-700 hover:bg-surface-50">Annuler</button>
              <button onClick={createQuickProduct} className="flex-1 rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-on-accent shadow-lg shadow-primary-200 hover:bg-primary-600">Créer et vendre</button>
            </div>
          </div>
        </div>
      )}

      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in p-4">          <div className="relative text-center py-8 px-6 bg-surface-100 rounded-[20px] border border-surface-200 shadow-2xl animate-slide-up w-[95%] sm:w-[90%] md:w-[640px] max-w-[640px] max-h-[95vh] md:max-h-[820px] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSaleSuccess(false)} className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-100 text-surface-400">
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
                  onClick={async () => { if (lastSale) { exportSalePDF(lastSale, settings, await buildProductPhotos(products), userName); toast('PDF téléchargé', 'success') } }}
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
                  onClick={async () => { if (lastSale) { shareSalePDF(lastSale, settings, await buildProductPhotos(products), userName); toast('Partage en cours...', 'success') } }}
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
                onClick={() => setSaleSuccess(false)}
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
        onSaved={() => { setEditSaleId(null); setSaleSuccess(false) }}
      />

      {pendingCustomerModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fade-in">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => setPendingCustomerModal(false)} />
          <div className="relative w-[95%] sm:w-[400px] bg-surface-100 rounded-[20px] shadow-2xl p-5 animate-scale-in">
            <div className="w-12 h-12 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <User className="w-6 h-6 text-primary-500" />
            </div>
            <h3 className="text-center text-base font-bold text-surface-900">Nouveau client</h3>
            <p className="text-center text-sm text-surface-500 mt-2 leading-relaxed">
              « <span className="font-semibold text-surface-900">{customerName.trim()}</span> » n'est pas un client enregistré.
              <br />Voulez-vous l'ajouter comme nouveau client ?
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <button
                onClick={() => { setPendingCustomerModal(false); handleSale(true) }}
                className="w-full py-3.5 rounded-xl bg-primary-500 text-on-accent font-bold text-sm transition-all active:scale-[0.98]">
                Oui, ajouter ce client
              </button>
              <button
                onClick={() => { setPendingCustomerModal(false); handleSale(false) }}
                className="w-full py-3.5 rounded-xl bg-surface-100 border border-surface-200 text-surface-700 font-semibold text-sm transition-all active:scale-[0.98]">
                Non, sans enregistrer le client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
