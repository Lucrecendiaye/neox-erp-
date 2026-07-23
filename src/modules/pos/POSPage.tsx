import { useState, useMemo } from 'react'
import { Card, Button, Input, Modal, Badge } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { generateId, formatCurrency, generateInvoiceNumber } from '@/lib/utils'
import { Search, Plus, Minus, Trash2, Printer, Send, X, ShoppingCart, Scan, CreditCard, Download, ScanLine } from 'lucide-react'
import BarcodeScanner from '@/components/ui/BarcodeScanner'
import { exportSalePDF } from '@/lib/pdf'
import type { SaleItem, Product, Sale, Customer, StockMovement, Credit, AccountingEntry } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

export default function POSPage() {
  const isCloud = isSupabaseConfigured()
  const dexieProducts = useLiveQuery(() => db.products.toArray(), [])
  const { data: supabaseProducts } = useSupabaseQuery<Product>('products', undefined, [])
  const products = isCloud ? supabaseProducts : dexieProducts
  const dexieCustomers = useLiveQuery(() => db.customers.toArray(), [])
  const { data: supabaseCustomers } = useSupabaseQuery<Customer>('customers', undefined, [])
  const customers = isCloud ? supabaseCustomers : dexieCustomers
  const dexieSettings = useLiveQuery(() => db.settings.get('default'), [])
  const { data: supabaseSettingsRaw } = useSupabaseQuery<any>('settings', undefined, [])
  const settings = isCloud ? (supabaseSettingsRaw || []).find((s: any) => s.id === 'default') : dexieSettings
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<SaleItem[]>([])
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash')
  const [paid, setPaid] = useState(0)
  const [showPayment, setShowPayment] = useState(false)
  const [saleSuccess, setSaleSuccess] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)

  const filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  )

  const { subtotal, discountTotal, taxTotal, total } = useMemo(() => {
    const sub = cart.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const disc = cart.reduce((s, i) => s + i.discount, 0)
    const tax = cart.reduce((s, i) => s + i.taxRate * (i.quantity * i.unitPrice - i.discount) / 100, 0)
    return { subtotal: sub, discountTotal: disc, taxTotal: tax, total: sub - disc + tax }
  }, [cart])

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (existing) {
        return prev.map(i =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice - i.discount } : i
        )
      }
      return [...prev, {
        productId: product.id, productName: product.name,
        quantity: 1, unitPrice: product.sellingPrice,
        discount: 0, taxRate: product.taxRate,
        total: product.sellingPrice,
      }]
    })
  }

  function updateQuantity(productId: string, delta: number) {
    setCart(prev => prev.map(i => {
      if (i.productId !== productId) return i
      const newQty = Math.max(0, i.quantity + delta)
      return { ...i, quantity: newQty, total: newQty * i.unitPrice - i.discount }
    }).filter(i => i.quantity > 0))
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(i => i.productId !== productId))
  }

  function clearCart() {
    setCart([])
    setCustomerId('')
    setPaid(0)
    setShowPayment(false)
  }

  function handleBarcodeScan(code: string) {
    const product = products?.find(p => p.barcode === code)
    if (product) {
      addToCart(product)
      setSearch('')
    } else {
      setSearch(code)
    }
  }

  async function handleSale() {
    if (cart.length === 0) return
    const now = new Date().toISOString()
    const customer = customers?.find(c => c.id === customerId)
    const invNum = generateInvoiceNumber(settings?.invoicePrefix || 'INV-', settings?.invoiceNextNumber || 1)

    const sale = {
      id: generateId(),
      businessId: 'biz-default',
      invoiceNumber: invNum,
      customerId: customerId || undefined,
      customerName: customer?.name,
      items: cart,
      subtotal, discountTotal, taxTotal, total,
      paid: paymentMethod === 'cash' ? total : 0,
      change: paymentMethod === 'cash' ? Math.max(0, paid - total) : 0,
      paymentMethod,
      status: 'completed' as const,
      createdAt: now,
      userId: 'admin',
    }

    if (isCloud) { await sb.insert('sales', sale) } else { await db.sales.add(sale) }

    for (const item of cart) {
      if (isCloud) { await sb.insert('stock_movements', { id: generateId(), businessId: 'biz-default', productId: item.productId, type: 'out', quantity: -item.quantity, unitPrice: item.unitPrice, reference: invNum, createdAt: now, userId: 'admin' }) } else { await db.stockMovements.add({ id: generateId(), businessId: 'biz-default', productId: item.productId, type: 'out', quantity: -item.quantity, unitPrice: item.unitPrice, reference: invNum, createdAt: now, userId: 'admin' }) }
    }

    if (customerId && paymentMethod === 'credit') {
      if (isCloud) { await sb.insert('credits', { id: generateId(), businessId: 'biz-default', customerId, customerName: customer?.name || '', invoiceId: sale.id, amount: total, paid: 0, balance: total, dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), status: 'active', reminderSent: [], createdAt: now }) } else { await db.credits.add({ id: generateId(), businessId: 'biz-default', customerId, customerName: customer?.name || '', invoiceId: sale.id, amount: total, paid: 0, balance: total, dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), status: 'active', reminderSent: [], createdAt: now }) }
    }

    if (settings) {
      if (isCloud) { await sb.update('settings', 'default', { invoiceNextNumber: (settings.invoiceNextNumber || 1) + 1 }) } else { await db.settings.update('default', { invoiceNextNumber: (settings.invoiceNextNumber || 1) + 1 }) }
    }

    if (isCloud) { await sb.insert('accounting_entries', { id: generateId(), businessId: 'biz-default', date: now, type: 'revenue', accountId: 'acc-sales', accountName: 'Ventes', amount: total, direction: 'credit', reference: invNum, description: `Vente ${invNum} - ${customer?.name || 'Client divers'}`, linkedId: sale.id, linkedType: 'sale', createdAt: now, userId: 'admin' }) } else { await db.accountingEntries.add({ id: generateId(), businessId: 'biz-default', date: now, type: 'revenue', accountId: 'acc-sales', accountName: 'Ventes', amount: total, direction: 'credit', reference: invNum, description: `Vente ${invNum} - ${customer?.name || 'Client divers'}`, linkedId: sale.id, linkedType: 'sale', createdAt: now, userId: 'admin' }) }

    setLastSale(sale)
    setSaleSuccess(true)
    setTimeout(() => { setSaleSuccess(false); clearCart() }, 2000)
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col lg:flex-row gap-4">
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              autoFocus
              type="text" placeholder="Rechercher un produit (nom ou code-barres)..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button onClick={() => setScannerOpen(true)} className="p-3 rounded-xl border border-surface-300 bg-white text-surface-500 hover:bg-surface-50 transition-colors" title="Scanner un code-barres">
            <ScanLine className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filteredProducts?.map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-white rounded-xl border border-surface-200 p-3 text-left hover:border-primary-300 hover:shadow-sm transition-all active:scale-[0.97]"
              >
                <div className="w-full h-20 bg-surface-50 rounded-lg mb-2 flex items-center justify-center text-surface-300">
                  <ShoppingCart className="w-8 h-8" />
                </div>
                <p className="text-sm font-medium text-surface-900 truncate">{p.name}</p>
                <p className="text-sm font-bold text-primary-600">{formatCurrency(p.sellingPrice)}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-96 flex flex-col bg-white rounded-2xl border border-surface-200 shadow-sm">
        <div className="p-4 border-b border-surface-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-surface-900">Vente en cours</h2>
            <button onClick={clearCart} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Client au comptoir</option>
            {customers?.map(c => (
              <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.map((item) => (
            <div key={item.productId} className="flex items-center gap-3 p-2 bg-surface-50 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-900 truncate">{item.productName}</p>
                <p className="text-xs text-surface-400">{formatCurrency(item.unitPrice)} / unité</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQuantity(item.productId, -1)} className="w-7 h-7 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-surface-500 hover:bg-surface-100">
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.productId, 1)} className="w-7 h-7 rounded-lg bg-white border border-surface-200 flex items-center justify-center text-surface-500 hover:bg-surface-100">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <p className="text-sm font-semibold text-surface-900 w-20 text-right">{formatCurrency(item.total)}</p>
              <button onClick={() => removeFromCart(item.productId)} className="p-1 text-surface-300 hover:text-danger">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-surface-400 py-12">
              <ShoppingCart className="w-12 h-12 mb-3" />
              <p className="text-sm">Panier vide</p>
              <p className="text-xs">Ajoutez des produits</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-surface-200 space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Sous-total</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Taxes</span>
              <span>{formatCurrency(taxTotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-surface-900 pt-1 border-t border-surface-200">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => { setShowPayment(true); setPaymentMethod('cash') }} className="flex-1" size="lg">
              <CreditCard className="w-4 h-4" /> Paiement
            </Button>
            <Button onClick={handleSale} variant="secondary" size="lg" disabled={cart.length === 0}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <BarcodeScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleBarcodeScan} />

      {saleSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in" onClick={() => { setSaleSuccess(false); clearCart() }}>
          <Card className="text-center py-12 px-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-xl font-bold text-surface-900">Vente confirmée !</p>
            <p className="text-sm text-surface-500 mt-1">{formatCurrency(total)}</p>
            <div className="flex gap-2 mt-6 justify-center">
              <Button size="sm" variant="outline" onClick={() => { if (lastSale) exportSalePDF(lastSale) }}>
                <Download className="w-4 h-4" /> Reçu PDF
              </Button>
              <Button size="sm" onClick={() => { setSaleSuccess(false); clearCart() }}>
                Nouvelle vente
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
