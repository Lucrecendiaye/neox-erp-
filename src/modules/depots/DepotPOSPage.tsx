import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { cn, formatCurrency, formatDateTime, generateId, getProductUnits, getUnitPrice, getUnitStep, getUnitMinQty } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { processSale } from '@/engine/operations'
import { ArrowLeft, ShoppingCart, Plus, Minus, Trash2, Search } from 'lucide-react'
import type { SaleItem } from '@/types'
import { useBusinessId } from '@/hooks/useBusinessId'
import { useAppStore } from '@/stores/appStore'

export default function DepotPOSPage() {
  const { locationId } = useParams()
  const businessId = useBusinessId()
  const navigate = useNavigate()
  const location = useLiveQuery(() => db.locations.get(locationId!), [locationId])
  const allStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const allProducts = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const allLocations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])
  const sales = useLiveQuery(() => db.sales.where('locationId').equals(locationId!).reverse().sortBy('createdAt'), [locationId])

  interface CartItem {
    productId: string
    productName: string
    quantity: number
    unitPrice: number
    unitName: string
    unitQuantity: number
  }

  function cartItemKey(i: CartItem) {
    return `${i.productId}::${i.unitName}`
  }

  const [cart, setCart] = useState<CartItem[]>([])
  const [payment, setPayment] = useState<'cash' | 'mobile' | 'bank'>('cash')
  const [paid, setPaid] = useState(0)
  const [search, setSearch] = useState('')
  const [cartOpen, setCartOpen] = useState(false)

  const productMap = useMemo(() => new Map(allProducts?.map(p => [p.id, p])), [allProducts])
  const locationMap = useMemo(() => new Map(allLocations?.map(l => [l.id, l])), [allLocations])
  const stockMap = useMemo(() => new Map(allStocks?.filter(s => s.locationId === locationId).map(s => [s.productId, s.quantity])), [allStocks, locationId])
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

  const subtotal = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const total = subtotal
  const change = Math.max(0, paid - total)

  function getQtyInPieces(item: CartItem): number {
    return item.quantity * item.unitQuantity
  }

  function addToCart(productId: string, unitName?: string) {
    const p = productMap.get(productId)
    if (!p) return
    const units = getProductUnits(p)
    const unit = units.find(u => u.name === unitName) || units[0]
    const stock = stockMap.get(productId) || 0
    setCart(prev => {
      const key = `${productId}::${unit.name}`
      const step = getUnitStep(unit.name)
      const existing = prev.find(i => cartItemKey(i) === key)
      if (existing) {
        const newQty = +(existing.quantity + step).toFixed(1)
        const newPieces = Math.ceil(newQty * existing.unitQuantity)
        if (newPieces > stock) {
          toast('Stock insuffisant', 'error')
          return prev
        }
        return prev.map(i =>
          cartItemKey(i) === key
            ? { ...i, quantity: newQty, total: newQty * i.unitPrice }
            : i
        )
      }
      if (unit.quantity > stock) {
        toast('Stock insuffisant', 'error')
        return prev
      }
      return [...prev, {
        productId: p.id,
        productName: p.name,
        quantity: 1,
        unitPrice: p.sellingPrice,
        unitName: unit.name,
        unitQuantity: unit.quantity,
      }]
    })
  }

  function updateQuantity(itemKey: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      const step = getUnitStep(i.unitName)
      const minQty = getUnitMinQty(i.unitName)
      const newQty = Math.max(minQty, +(i.quantity + delta).toFixed(1))
      const stock = stockMap.get(i.productId) || 0
      if (Math.ceil(newQty * i.unitQuantity) > stock) {
        toast('Stock insuffisant', 'error')
        return i
      }
      return { ...i, quantity: newQty }
    }))
  }

  function updateCartUnit(itemKey: string, newUnitName: string) {
    setCart(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      const p = productMap.get(i.productId)
      if (!p) return i
      const units = getProductUnits(p)
      const unit = units.find(u => u.name === newUnitName)
      if (!unit) return i
      return {
        ...i,
        unitName: newUnitName,
        unitQuantity: unit.quantity,
        unitPrice: getUnitPrice(p, newUnitName),
      }
    }))
  }

  function updateCartPrice(itemKey: string, newPrice: number) {
    setCart(prev => prev.map(i => {
      if (cartItemKey(i) !== itemKey) return i
      return { ...i, unitPrice: Math.max(0, newPrice) }
    }))
  }

  function removeFromCart(itemKey: string) {
    setCart(prev => prev.filter(i => cartItemKey(i) !== itemKey))
  }

  async function handleCheckout() {
    if (cart.length === 0) return toast('Panier vide', 'warning')
    if (paid < total) return toast('Montant insuffisant', 'warning')

    const saleItems: SaleItem[] = cart.map(i => ({
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      unitName: i.unitName,
      unitQuantity: i.unitQuantity,
      discount: 0,
      taxRate: 0,
      total: i.quantity * i.unitPrice,
    }))

    const sale = {
      id: generateId(),
      businessId,
      locationId: locationId!,
      invoiceNumber: `VEN-${Date.now()}`,
      items: saleItems,
      subtotal,
      discountTotal: 0,
      taxTotal: 0,
      total,
      paid,
      change,
      paymentMethod: payment,
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      userId: useAppStore.getState().user?.id || '',
    }

    await processSale(sale)
    toast(`Vente ${sale.invoiceNumber} enregistrée`, 'success')
    setCart([])
    setPaid(0)
    setCartOpen(false)
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Vente — {location?.name}</h1>
          <p className="text-surface-500 text-sm">{location?.type === 'shop' ? 'Boutique' : 'Dépôt'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4 lg:border-r border-surface-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher produit ou code-barres..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-300 text-sm" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {filteredProducts.map(p => {
              const stockHere = stockMap.get(p.id) || 0
              const isOut = stockHere <= 0
              const units = getProductUnits(p)
              const allStock = stockByProduct.get(p.id) || []
              const otherStocks = allStock.filter(s => s.locationId !== locationId && s.quantity > 0)
              return (
                <div key={p.id}
                  className={isOut ? 'opacity-40 pointer-events-none' : ''}>
                  <button onClick={() => addToCart(p.id)} disabled={isOut}
                    className="w-full text-left p-3 rounded-xl border border-surface-200 hover:border-primary-300 hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-surface-400">{p.unit}</p>
                    <p className="text-sm font-semibold text-primary-600 mt-1">{formatCurrency(p.sellingPrice)}</p>
                    <p className="text-xs text-surface-500">Stock ici: <strong>{stockHere}</strong></p>
                    {otherStocks.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {otherStocks.map(os => (
                          <p key={os.locationId} className="text-[10px] text-surface-400">
                            {os.locationName}: {os.quantity}
                          </p>
                        ))}
                      </div>
                    )}
                  </button>
                  {!isOut && units.length > 0 && (
                    <div className="mt-1 flex gap-1 flex-wrap px-1">
                      {units.map(u => (
                        <button
                          key={u.name}
                          onClick={(e) => { e.stopPropagation(); addToCart(p.id, u.name) }}
                          className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-100 text-surface-500 hover:bg-primary-100 hover:text-primary-600 transition-colors"
                        >
                          1 {u.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {sales && sales.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Ventes récentes</CardTitle></CardHeader>
              <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
                {sales.slice(0, 10).map(s => (
                  <div key={s.id} className="flex justify-between text-sm p-2 rounded-lg bg-surface-50">
                    <span className="text-surface-600">{s.invoiceNumber}</span>
                    <span className="font-medium">{formatCurrency(s.total)}</span>
                    <span className="text-surface-400 text-xs">{formatDateTime(s.createdAt)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className={cn('space-y-4', 'fixed inset-y-0 right-0 z-50 w-full max-w-md shadow-2xl', 'lg:static lg:inset-auto lg:z-auto lg:w-auto lg:shadow-none lg:translate-x-0', cartOpen ? 'flex flex-col' : 'hidden', 'transition-transform duration-300', cartOpen ? 'translate-x-0' : 'translate-x-full')}>
          <Card>
            <CardHeader><div className="flex items-center gap-2"><button onClick={() => setCartOpen(false)} className="lg:hidden p-1 -ml-1 rounded-lg hover:bg-surface-100 text-surface-500 transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button><CardTitle><ShoppingCart className="w-5 h-5 inline mr-2" />Panier</CardTitle></div></CardHeader>
            <div className="p-4 space-y-3 min-h-[200px]">
              {cart.length === 0 && <p className="text-sm text-surface-400 text-center py-8">Panier vide</p>}
              {cart.map(i => {
                const key = cartItemKey(i)
                const p = productMap.get(i.productId)
                const units = p ? getProductUnits(p) : []
                return (
                  <div key={key} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{i.productName}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <select
                          value={i.unitName}
                          onChange={(e) => updateCartUnit(key, e.target.value)}
                          className="text-[10px] rounded border border-surface-200 bg-white px-1 py-0.5 text-surface-600 focus:outline-none"
                        >
                          {units.map(u => (
                            <option key={u.name} value={u.name}>{u.name}</option>
                          ))}
                        </select>
                        <span className="text-[10px] text-surface-400">×</span>
                        <input
                          type="number"
                          min={getUnitMinQty(i.unitName)}
                          step={getUnitStep(i.unitName)}
                          value={i.quantity}
                          onChange={(e) => {
                            const minQty = getUnitMinQty(i.unitName)
                            const q = Math.max(minQty, Number(e.target.value) || minQty)
                            setCart(prev => prev.map(x =>
                              cartItemKey(x) === key ? { ...x, quantity: q } : x
                            ))
                          }}
                          className="w-14 text-[10px] rounded border border-surface-200 bg-white px-1 py-0.5 text-surface-700 text-center focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-surface-400">Prix:</span>
                        <input
                          type="number" min="0" step="1"
                          value={i.unitPrice}
                          onChange={(e) => updateCartPrice(key, Number(e.target.value) || 0)}
                          className="w-20 text-[10px] rounded border border-surface-200 bg-white px-1 py-0.5 text-surface-700 text-right focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateQuantity(key, -1)} className="p-1 rounded hover:bg-surface-200"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm font-semibold w-10 text-center">{i.quantity.toLocaleString('fr-FR')}</span>
                      <button onClick={() => updateQuantity(key, 1)} className="p-1 rounded hover:bg-surface-200"><Plus className="w-3 h-3" /></button>
                      <button onClick={() => removeFromCart(key)} className="p-1 rounded hover:bg-danger-50 text-danger"><Trash2 className="w-3 h-3" /></button>
                    </div>
                    <p className="text-sm font-semibold text-surface-900 w-16 text-right">{formatCurrency(i.quantity * i.unitPrice)}</p>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm"><span>Sous-total</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span>{formatCurrency(total)}</span></div>

              <select value={payment} onChange={e => setPayment(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm">
                <option value="cash">Espèces</option>
                <option value="mobile">Mobile Money</option>
                <option value="bank">Virement</option>
              </select>

              <input type="number" placeholder="Montant reçu" value={paid || ''} onChange={e => setPaid(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-surface-300 text-sm" />

              {paid >= total && <div className="flex justify-between text-sm text-success font-medium"><span>Monnaie</span><span>{formatCurrency(change)}</span></div>}

              <Button onClick={handleCheckout} disabled={cart.length === 0 || paid < total} className="w-full">
                Valider la vente
              </Button>
            </div>
          </Card>
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
      </div>
    </div>
  )
}
