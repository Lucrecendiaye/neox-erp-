import { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Input, Select, NumericInput, Modal } from '@/components/ui'
import { formatCurrency, generateId, getProductUnits } from '@/lib/utils'
import { toast } from '@/lib/toast'
import db from '@/db'
import { useBusinessId } from '@/hooks/useBusinessId'
import { createDelivery, editDraft, editDelivery, nextDeliveryNumber } from '@/engine/deliveries'
import { allocateSaleItems, StockAllocationRequiredError } from '@/engine/stockAllocation'
import {
  ArrowLeft, Minus, Package, Plus, Search, ShoppingCart,
  Tag, Truck, User, X,
} from 'lucide-react'
import type { Delivery, PaymentMethod, Product, Customer, SaleItem } from '@/types'
import type { Location, ProductStock } from '@/engine/types'

const PAY_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'wave', label: 'Wave' },
  { value: 'orange', label: 'Orange Money' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'bank', label: 'Banque' },
  { value: 'card', label: 'Carte' },
]

interface FormItem {
  key: string
  productId: string
  productName: string
  quantity: string
  unitPrice: string
  unitName: string
  unitQuantity: number
}

interface Props {
  existing: Delivery | null
  customers: Customer[]
  products: Product[]
  stocks?: ProductStock[]
  locations?: Location[]
  users: { id: string; name: string; isActive?: boolean }[]
  defaultLocationId: string
  currency: string
  onClose: () => void
}

function CartItemRow({ it, products, fmt, onChange, onRemove }: {
  it: FormItem
  products: Product[]
  fmt: (n: number) => string
  onChange: (patch: Partial<FormItem>) => void
  onRemove: () => void
}) {
  const prod = products.find(p => p.id === it.productId)
  const pu = parseFloat(it.unitPrice) || 0
  const qty = parseFloat(it.quantity) || 0
  return (
    <div className="bg-surface-100 border border-surface-200 rounded-2xl p-3 relative">
      <button onClick={onRemove}
        className="absolute top-2 right-2 p-1 rounded-lg text-surface-500 hover:text-red-500 hover:bg-red-500/15 transition-colors z-10">
        <X className="w-4 h-4" />
      </button>
      <div className="flex gap-3 items-start">
        <div className="w-12 h-12 rounded-xl bg-surface-50 flex items-center justify-center overflow-hidden shrink-0 border border-surface-100">
          {prod?.photos?.[0] ? (
            <img src={prod.photos[0]} alt="" className="w-full h-full object-cover" />
          ) : (
            <Package className="w-6 h-6 text-surface-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-surface-900 leading-tight truncate">{it.productName}</p>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <select
              value={it.unitName || 'Pièce'}
              onChange={e => {
                const unitName = e.target.value
                const unit = (prod ? getProductUnits(prod) : []).find(u => u.name === unitName)
                onChange({ unitName, unitQuantity: unit?.quantity || 1 })
              }}
              className="text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1.5 py-1 text-surface-600 focus:outline-none"
            >
              {(prod ? getProductUnits(prod) : [{ name: 'Pièce', quantity: 1 }, { name: 'Douzaine', quantity: 12 }]).map(u => (
                <option key={u.name} value={u.name}>{u.name}</option>
              ))}
            </select>
            <button onClick={() => onChange({ quantity: String(Math.max(0.5, qty - 1)) })}
              className="w-7 h-7 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-center text-surface-500 hover:bg-surface-200 transition-colors">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <NumericInput min="0" step="any" value={it.quantity}
              onChange={e => onChange({ quantity: e.target.value })}
              className="w-14 text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1 py-1 text-surface-700 text-center focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <button onClick={() => onChange({ quantity: String(qty + 1) })}
              className="w-7 h-7 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-center text-surface-500 hover:bg-surface-200 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] text-surface-400 mx-1">×</span>
            <NumericInput min="0" step="any" value={it.unitPrice}
              onChange={e => onChange({ unitPrice: e.target.value })}
              className="w-20 text-[11px] rounded-md border border-surface-200 bg-surface-50 px-1 py-1 text-surface-700 text-right focus:outline-none focus:ring-2 focus:ring-primary-500" />
            <span className="ml-auto text-sm font-semibold text-primary-500">{fmt(pu * qty)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DeliveryComposePage({ existing, customers, products, stocks = [], locations = [], users, defaultLocationId, currency, onClose }: Props) {
  const fmt = (n: number) => formatCurrency(n, currency)
  const businessId = useBusinessId()

  const [customerId, setCustomerId] = useState(existing?.customerId || '')
  const [customerName, setCustomerName] = useState(existing?.customerName || '')
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone || '')
  const [customerAddress, setCustomerAddress] = useState(existing?.customerAddress || '')
  const [quarter, setQuarter] = useState(existing?.quarter || '')
  const [deliveryNote, setDeliveryNote] = useState(existing?.deliveryNote || '')
  const [saveCustomerAsk, setSaveCustomerAsk] = useState(false)
  const [items, setItems] = useState<FormItem[]>(
    existing && existing.items.length
      ? existing.items.map(it => ({ key: it.id, productId: it.productId, productName: it.productName, quantity: String(it.quantity), unitPrice: String(it.unitPrice), unitName: it.unitName || 'Pièce', unitQuantity: it.unitQuantity || 1 }))
      : []
  )
  const [feeClient, setFeeClient] = useState(existing ? String(existing.deliveryFeeClient) : '0')
  const [feeShop, setFeeShop] = useState(existing ? String(existing.deliveryFeeShop) : '0')
  const [discount, setDiscount] = useState(existing ? String(existing.discount) : '0')
  const [payMethod, setPayMethod] = useState<PaymentMethod | ''>(existing?.paymentMethod || 'cash')
  const [advance, setAdvance] = useState(existing ? String(existing.paid) : '0')
  const [courierId, setCourierId] = useState(existing?.courierId || '')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [sourceSelections, setSourceSelections] = useState<Record<string, string>>({})
  const [sourcePrompt, setSourcePrompt] = useState<StockAllocationRequiredError | null>(null)

  const [nextNumber, setNextNumber] = useState(existing?.number || '')
  const loadedNext = useRef(false)
  useEffect(() => {
    if (!existing && !loadedNext.current) {
      loadedNext.current = true
      nextDeliveryNumber().then(setNextNumber).catch(() => {})
    }
  }, [existing])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      return !q || p.name.toLowerCase().includes(q)
    })
  }, [products, search])

  const customerMatches = useMemo(() => {
    const q = customerName.trim().toLowerCase()
    if (!q) return []
    return customers.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)).slice(0, 5)
  }, [customers, customerName])

  const subtotal = items.reduce((s, it) => s + (parseFloat(it.unitPrice) || 0) * (parseFloat(it.quantity) || 0), 0)
  const feeC = parseFloat(feeClient) || 0
  const feeS = parseFloat(feeShop) || 0
  const disc = parseFloat(discount) || 0
  const total = Math.max(0, subtotal - disc + feeC)
  const advanceVal = Math.min(parseFloat(advance) || 0, total)

  function addProduct(p: Product, unitName: string = 'Pièce') {
    const unit = getProductUnits(p).find(u => u.name === unitName) || { name: 'Pièce', quantity: 1 }
    setItems(prev => {
      const existingItem = prev.find(it => it.productId === p.id && it.unitName === unit.name)
      if (existingItem) {
        return prev.map(it => it.key === existingItem.key ? { ...it, quantity: String((parseFloat(it.quantity) || 0) + 1) } : it)
      }
      return [...prev, { key: generateId(), productId: p.id, productName: p.name, quantity: '1', unitPrice: String(p.sellingPrice || p.wholesalePrice || 0), unitName: unit.name, unitQuantity: unit.quantity }]
    })
  }

  function updateItem(key: string, patch: Partial<FormItem>) {
    setItems(prev => prev.map(it => it.key === key ? { ...it, ...patch } : it))
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(it => it.key !== key))
  }

  function handleSelectCustomer(id: string) {
    setCustomerId(id)
    const c = customers.find(x => x.id === id)
    if (c) {
      setCustomerName(c.name || '')
      setCustomerPhone(c.phone || '')
      setCustomerAddress(c.address || '')
    }
  }

  async function handleSave(confirmed?: boolean) {
    const validItems = items.filter(it => it.productId && (parseFloat(it.quantity) || 0) > 0)
    if (!customerName.trim()) { toast('Nom du client requis', 'error'); return }
    if (!validItems.length) { toast('Ajoutez au moins un article', 'error'); return }
    if (subtotal <= 0) { toast('Montant des articles invalide', 'error'); return }

    const typedName = customerName.trim()
    const isKnown = customers.some(c => (c.name || '').toLowerCase() === typedName.toLowerCase())
    if (!customerId && !isKnown && !saveCustomerAsk && !confirmed) {
      setSaveCustomerAsk(true)
      return
    }
    const shouldSave = saveCustomerAsk || confirmed === true

    setSaving(true)
    try {
      const saleItems: SaleItem[] = validItems.map(it => ({
        productId: it.productId,
        productName: it.productName || products.find(p => p.id === it.productId)?.name || '',
        quantity: parseFloat(it.quantity) || 0,
        unitPrice: parseFloat(it.unitPrice) || 0,
        unitName: it.unitName || 'Pièce',
        unitQuantity: it.unitQuantity || 1,
        discount: 0,
        taxRate: 0,
        total: Math.round((parseFloat(it.unitPrice) || 0) * (parseFloat(it.quantity) || 0)),
      }))
      let allocatedItems: SaleItem[]
      try {
        allocatedItems = await allocateSaleItems(saleItems, businessId, defaultLocationId, sourceSelections)
      } catch (e) {
        if (e instanceof StockAllocationRequiredError) setSourcePrompt(e)
        throw e
      }
      let cid = customerId || undefined
      if (!cid && typedName) {
        const match = customers.find(c => (c.name || '').toLowerCase() === typedName.toLowerCase())
        if (match) {
          cid = match.id
        } else if (shouldSave) {
          const now = new Date().toISOString()
          const record = {
            id: generateId(),
            businessId,
            name: typedName,
            phone: customerPhone,
            email: '',
            address: customerAddress,
            creditLimit: 0,
            currentBalance: 0,
            notes: '',
            createdAt: now,
            updatedAt: now,
          }
          await db.customers.add(record)
          cid = record.id
        }
      }
      const input = {
        locationId: defaultLocationId,
        customerId: cid,
        customerName: typedName,
        customerPhone,
        customerAddress,
        quarter,
        deliveryNote,
         items: allocatedItems.map(it => ({
           productId: it.productId,
           productName: it.productName,
           quantity: it.quantity,
           unitPrice: it.unitPrice,
           unitName: it.unitName,
           unitQuantity: it.unitQuantity,
           locationId: it.locationId,
         })),
        deliveryFeeClient: feeC,
        deliveryFeeShop: feeS,
        discount: disc,
        paymentMethod: payMethod,
        advance: advanceVal,
        courierId: courierId || undefined,
      }
      if (existing) {
        if (existing.status === 'draft') {
          await editDraft(existing.id, input)
        } else {
          await editDelivery(existing.id, input)
        }
        toast(`Livraison ${existing.number} modifiée`, 'success')
      } else {
        const created = await createDelivery(input)
        toast(`Livraison ${created.number} créée`, 'success')
      }
      onClose()
    } catch (e) {
      if (!(e instanceof StockAllocationRequiredError)) toast(e instanceof Error ? e.message : 'Erreur d’enregistrement', 'error')
    } finally { setSaving(false) }
  }

  const itemCount = items.reduce((s, it) => s + ((parseFloat(it.quantity) || 0)), 0)

  const basketContent = (
    <div className="space-y-3">
      {/* Client */}
      <div className="bg-surface-100 rounded-2xl border border-surface-200 p-3">
        <button onClick={() => setCustomerOpen(!customerOpen)} className="flex items-center justify-between w-full text-left py-1">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-surface-400" />
            <span className="text-surface-500">Client</span>
            <span className="text-surface-900 font-medium truncate">{customerName || '(optionnel)'}</span>
          </div>
          <span className="text-xs text-primary-500">{customerOpen ? 'Fermer' : 'Renseigner'}</span>
        </button>
        {customerOpen && (
          <div className="mt-2 space-y-2">
            <Select
              label="Client existant"
              value={customerId}
              onChange={e => handleSelectCustomer(e.target.value)}
              placeholder="Choisir un client"
              options={customers.map(c => ({ value: c.id, label: c.name }))}
            />
            <div className="relative">
              <Input label="Nom du client" value={customerName} onChange={e => { setCustomerName(e.target.value); setCustomerId('') }} placeholder="Nom complet" />
              {customerMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface-100 border border-surface-300 rounded-xl shadow-xl overflow-hidden">
                  {customerMatches.map(c => (
                    <button key={c.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => handleSelectCustomer(c.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-50 transition-colors border-b border-surface-100 last:border-b-0">
                      <User className="w-3.5 h-3.5 text-primary-400 shrink-0" />
                      <span className="text-sm text-surface-800 truncate">{c.name}</span>
                      {c.phone && <span className="text-xs text-surface-400 ml-auto">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Input label="Téléphone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+226 ..." />
            <Input label="Adresse de livraison" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Quartier, rue, repère..." />
            <Input label="Quartier" value={quarter} onChange={e => setQuarter(e.target.value)} />
            <Select
              label="Livreur"
              value={courierId}
              onChange={e => setCourierId(e.target.value)}
              placeholder="Aucun livreur"
              options={users.map(u => ({ value: u.id, label: u.name }))}
            />
            <Input label="Note de livraison" value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} placeholder="Instructions livreur..." />
          </div>
        )}
      </div>

      {/* Panier */}
      <div className="bg-surface-100 rounded-2xl border border-surface-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-sm font-bold text-surface-900">Panier</span>
          <span className="text-xs text-surface-400">{items.length} article(s) · {itemCount} qté</span>
        </div>
        <div className="p-3 space-y-2">
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-300 py-8 text-surface-400">
              <Package className="w-8 h-8 mb-2 text-surface-500" />
              <p className="text-xs">Panier vide — cliquez sur un produit à gauche</p>
            </div>
          )}
          {items.map(it => (
            <CartItemRow key={it.key} it={it} products={products} fmt={fmt}
              onChange={(p) => updateItem(it.key, p)}
              onRemove={() => removeItem(it.key)} />
          ))}
        </div>
      </div>

      {/* Frais & remise */}
      <div className="bg-surface-100 rounded-2xl border border-surface-200 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-surface-400 shrink-0" />
          <Input label="Frais livraison (client)" type="number" min="0" value={feeClient} onChange={e => setFeeClient(e.target.value)} />
        </div>
        <Input label="Frais livraison (boutique)" type="number" min="0" value={feeShop} onChange={e => setFeeShop(e.target.value)} />
        <Input label="Remise" type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} />
      </div>

      {/* Paiement */}
      <div className="bg-surface-100 rounded-2xl border border-surface-200 p-3 space-y-2">
        <Select
          label="Mode de paiement"
          value={payMethod}
          onChange={e => setPayMethod(e.target.value as PaymentMethod)}
          options={PAY_METHODS.map(m => ({ value: m.value, label: m.label }))}
        />
        <Input label="Acompte / payé d’avance" type="number" min="0" value={advance} onChange={e => setAdvance(e.target.value)} placeholder="0" />
      </div>

      {/* Résumé */}
      <div className="rounded-xl bg-primary-500/10 p-4 space-y-1 text-sm">
        <div className="flex justify-between text-surface-600"><span>Sous-total articles</span><span>{fmt(subtotal)}</span></div>
        <div className="flex justify-between text-surface-600"><span>Frais livraison (client)</span><span>{fmt(feeC)}</span></div>
        <div className="flex justify-between text-surface-600"><span>Frais livraison (boutique)</span><span>{fmt(feeS)}</span></div>
        <div className="flex justify-between text-surface-600"><span>Remise</span><span>- {fmt(disc)}</span></div>
        <div className="flex justify-between font-bold text-surface-900 border-t border-surface-200 pt-2">
          <span>Total client</span><span>{fmt(total)}</span>
        </div>
        <div className="flex justify-between text-success font-medium">
          <span>Payé d’avance</span><span>{fmt(advanceVal)}</span>
        </div>
        <div className="flex justify-between text-danger font-medium">
          <span>À encaisser à la livraison</span><span>{fmt(Math.max(0, total - advanceVal))}</span>
        </div>
      </div>

      <Button onClick={() => handleSave()} loading={saving} className="w-full">
        <Truck className="w-4 h-4" /> {existing ? 'Enregistrer la livraison' : 'Créer la livraison'}
      </Button>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto pb-24 lg:pb-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-surface-100 border border-surface-200 flex items-center justify-center text-surface-500 hover:text-primary-500 hover:border-primary-300 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-primary-500/15 text-primary-500 flex items-center justify-center">
          <Truck className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-surface-900">{existing ? `Modifier ${existing.number}` : 'Nouvelle livraison'}</h1>
          <p className="text-xs text-surface-500">N° {nextNumber || (existing ? '' : 'VL-…')}</p>
        </div>
        <Button onClick={() => handleSave()} loading={saving} className="hidden lg:inline-flex">
          {existing ? 'Enregistrer' : 'Créer'}
        </Button>
      </div>

      <div className="lg:flex lg:gap-4 lg:items-start">
        {/* LEFT: Catalogue */}
        <div className="lg:sticky lg:top-0 lg:w-[56%] xl:w-[60%] shrink-0">
          <div className="lg:max-h-[calc(100vh-150px)] lg:overflow-y-auto rounded-2xl border border-surface-200 bg-surface-50">
            <div className="p-3 border-b border-surface-200 sticky top-0 bg-surface-50 z-10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input
                  autoFocus
                  type="text" placeholder="Rechercher un produit..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-100 border border-surface-300 text-sm text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredProducts.map(p => {
                  const sourceStocks = locations
                    .filter(l => l.type === 'shop' || l.type === 'warehouse')
                    .map(l => ({ name: l.type === 'shop' ? 'Boutique' : l.name, quantity: stocks.find(s => s.productId === p.id && s.locationId === l.id)?.quantity || 0, type: l.type }))
                  return (
                    <div key={p.id}
                      className="text-left rounded-2xl border p-3 transition-all bg-surface-100 border-surface-200 hover:border-primary-300 hover:shadow-md flex flex-col">
                      <div className="w-full aspect-square bg-surface-50 rounded-xl flex items-center justify-center overflow-hidden">
                        {p.photos?.[0] ? (
                          <img loading="lazy" src={p.photos[0]} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <Package className="w-10 h-10 text-surface-500" />
                        )}
                      </div>
                      <p className="text-sm font-semibold text-surface-900 leading-snug mt-2 line-clamp-2 min-h-[2.5em]">{p.name}</p>
                      <p className="text-sm font-semibold text-primary-500 mt-0.5">Prix à définir à la vente</p>
                      <div className="mt-1 space-y-0.5">
                        {sourceStocks.filter(s => s.type === 'shop' || s.quantity > 0).slice(0, 3).map(s => (
                          <p key={s.name} className="text-[10px] text-surface-400">{s.name} : {s.quantity}</p>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <button type="button" onClick={() => addProduct(p, 'Pièce')}
                          className="py-2 rounded-xl bg-primary-500 text-on-accent font-bold text-xs active:scale-[0.97] transition-transform">
                          1 Pièce
                        </button>
                        <button type="button" onClick={() => addProduct(p, 'Douzaine')}
                          className="py-2 rounded-xl bg-primary-500/15 border border-primary-500/40 text-primary-500 font-bold text-xs active:scale-[0.97] transition-transform">
                          1 Douzaine
                        </button>
                      </div>
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
        </div>

        {/* RIGHT: Panier & livraison (desktop) */}
        <div className="hidden lg:block flex-1 min-w-0">
          {basketContent}
        </div>
      </div>

      {/* Mobile: barre panier flottante */}
      {items.length > 0 && !cartOpen && (
        <div className="lg:hidden fixed left-3 right-3 z-30" style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>
          <button onClick={() => setCartOpen(true)}
            className="w-full py-4 px-5 rounded-2xl bg-primary-500 text-on-accent font-bold shadow-xl shadow-primary-200 flex items-center justify-between gap-3 active:scale-[0.98] transition-transform min-h-[56px]">
            <span className="flex items-center gap-2 text-base">
              <ShoppingCart className="w-6 h-6" />
              Panier ({itemCount})
            </span>
            <span className="text-lg font-extrabold">{fmt(total)}</span>
          </button>
        </div>
      )}

      {/* Confirmation nouveau client */}
      {saveCustomerAsk && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 animate-fade-in">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={() => setSaveCustomerAsk(false)} />
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
              <button onClick={() => { setSaveCustomerAsk(true); handleSave(true) }}
                className="w-full py-3.5 rounded-xl bg-primary-500 text-on-accent font-bold text-sm transition-all active:scale-[0.98]">
                Oui, ajouter ce client
              </button>
              <button onClick={() => { setSaveCustomerAsk(false); handleSave(false) }}
                className="w-full py-3.5 rounded-xl bg-surface-100 border border-surface-200 text-surface-700 font-semibold text-sm transition-all active:scale-[0.98]">
                Non, sans enregistrer le client
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={sourcePrompt !== null} onClose={() => setSourcePrompt(null)} title="Choisir le dépôt complémentaire">
        {sourcePrompt && (
          <div className="space-y-4 p-5">
            <div className="rounded-2xl bg-primary-50 border border-primary-200 p-4 space-y-1">
              <p className="font-bold text-surface-900">{sourcePrompt.productName}</p>
              <p className="text-sm text-surface-600">Boutique : <strong>{sourcePrompt.shopQuantity}</strong> disponible(s)</p>
              <p className="text-sm font-semibold text-amber-600">Il manque {sourcePrompt.missingQuantity} unité(s).</p>
            </div>
            <div className="space-y-2">
              {sourcePrompt.sources.filter(s => s.type === 'warehouse' && s.quantity >= sourcePrompt.missingQuantity).map(source => (
                <button
                  key={source.locationId}
                  type="button"
                  onClick={() => { setSourceSelections(prev => ({ ...prev, [sourcePrompt.productId]: source.locationId })); setSourcePrompt(null) }}
                  className="w-full flex items-center justify-between rounded-xl border border-surface-200 bg-surface-100 px-4 py-3 text-left hover:border-primary-300 hover:bg-primary-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-surface-900">{source.locationName}</span>
                  <span className="text-sm font-bold text-primary-500">{source.quantity} disponibles</span>
                </button>
              ))}
              {sourcePrompt.sources.filter(s => s.type === 'warehouse' && s.quantity >= sourcePrompt.missingQuantity).length === 0 && (
                <p className="text-sm text-danger">Aucun dépôt ne possède suffisamment de stock pour cette quantité.</p>
              )}
            </div>
            <p className="text-xs text-surface-500">Après votre choix, appuyez à nouveau sur Enregistrer. Le stock sera revérifié lors de la validation.</p>
          </div>
        )}
      </Modal>

      {/* Mobile: tiroir panier */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCartOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-surface-50 p-4 pb-8 animate-slide-up"
            style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-surface-900">Panier</h2>
              <button onClick={() => setCartOpen(false)} className="p-2 rounded-lg bg-surface-100 text-surface-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            {basketContent}
          </div>
        </div>
      )}
    </div>
  )
}
