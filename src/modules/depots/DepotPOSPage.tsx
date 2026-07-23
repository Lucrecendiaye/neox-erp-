import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, formatDateTime, generateId } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { processSale } from '@/engine/operations'
import { ArrowLeft, ShoppingCart, Plus, Minus, Trash2, Search } from 'lucide-react'
import type { SaleItem } from '@/types'

export default function DepotPOSPage() {
  const { locationId } = useParams()
  const navigate = useNavigate()
  const location = useLiveQuery(() => db.locations.get(locationId!), [locationId])
  const stocks = useLiveQuery(() => db.productStocks.where('locationId').equals(locationId!).toArray(), [locationId])
  const allProducts = useLiveQuery(() => db.products.toArray(), [])
  const sales = useLiveQuery(() => db.sales.where('locationId').equals(locationId!).reverse().sortBy('createdAt'), [locationId])

  const [cart, setCart] = useState<{ productId: string; name: string; price: number; qty: number }[]>([])
  const [payment, setPayment] = useState<'cash' | 'mobile' | 'bank'>('cash')
  const [paid, setPaid] = useState(0)
  const [search, setSearch] = useState('')

  const productMap = useMemo(() => new Map(allProducts?.map(p => [p.id, p])), [allProducts])
  const stockMap = useMemo(() => new Map(stocks?.map(s => [s.productId, s.quantity])), [stocks])

  const filteredProducts = allProducts?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  ) || []

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0)
  const taxTotal = subtotal * 0.18
  const total = subtotal + taxTotal
  const change = Math.max(0, paid - total)

  function addToCart(productId: string) {
    const p = productMap.get(productId)
    if (!p) return
    const stock = stockMap.get(productId) || 0
    setCart(prev => {
      const existing = prev.find(i => i.productId === productId)
      const currentQty = existing?.qty || 0
      if (currentQty >= stock) {
        toast('Stock insuffisant', 'error')
        return prev
      }
      if (existing) {
        return prev.map(i => i.productId === productId ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { productId: p.id, name: p.name, price: p.sellingPrice, qty: 1 }]
    })
  }

  function updateQty(productId: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const newQty = i.qty + delta
      if (newQty <= 0) return null
      return { ...i, qty: newQty }
    }).filter(Boolean) as typeof cart)
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.productId !== productId))
  }

  async function handleCheckout() {
    if (cart.length === 0) return toast('Panier vide', 'warning')
    if (paid < total) return toast('Montant insuffisant', 'warning')

    const saleItems: SaleItem[] = cart.map(i => {
      const p = productMap.get(i.productId)!
      return {
        productId: i.productId,
        productName: i.name,
        quantity: i.qty,
        unitPrice: i.price,
        discount: 0,
        taxRate: 18,
        total: i.price * i.qty,
      }
    })

    const sale = {
      id: generateId(),
      businessId: 'biz-default',
      locationId: locationId!,
      invoiceNumber: `VEN-${Date.now()}`,
      items: saleItems,
      subtotal,
      discountTotal: 0,
      taxTotal,
      total,
      paid,
      change,
      paymentMethod: payment,
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      userId: 'admin',
    }

    await processSale(sale)
    toast(`Vente ${sale.invoiceNumber} enregistrée`, 'success')
    setCart([])
    setPaid(0)
  }

  return (
    <div className="space-y-6">
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
        <div className="lg:col-span-2 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher produit ou code-barres..." className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-300 text-sm" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {filteredProducts.map(p => {
              const stock = stockMap.get(p.id) || 0
              return (
                <button key={p.id} onClick={() => addToCart(p.id)} disabled={stock <= 0}
                  className="text-left p-3 rounded-xl border border-surface-200 hover:border-primary-300 hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-surface-400">{p.unit}</p>
                  <p className="text-sm font-semibold text-primary-600 mt-1">{formatCurrency(p.sellingPrice)}</p>
                  <p className="text-xs text-surface-400">Stock: {stock}</p>
                </button>
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

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle><ShoppingCart className="w-5 h-5 inline mr-2" />Panier</CardTitle></CardHeader>
            <div className="p-4 space-y-3 min-h-[200px]">
              {cart.length === 0 && <p className="text-sm text-surface-400 text-center py-8">Panier vide</p>}
              {cart.map(i => (
                <div key={i.productId} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{i.name}</p>
                    <p className="text-xs text-surface-400">{formatCurrency(i.price)} x {i.qty}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(i.productId, -1)} className="p-1 rounded hover:bg-surface-200"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm font-semibold w-6 text-center">{i.qty}</span>
                    <button onClick={() => updateQty(i.productId, 1)} className="p-1 rounded hover:bg-surface-200"><Plus className="w-3 h-3" /></button>
                    <button onClick={() => removeFromCart(i.productId)} className="p-1 rounded hover:bg-danger-50 text-danger"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm"><span>Sous-total</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span>TVA (18%)</span><span>{formatCurrency(taxTotal)}</span></div>
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
      </div>
    </div>
  )
}
