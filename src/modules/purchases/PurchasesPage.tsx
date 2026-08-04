import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, generateInvoiceNumber, formatCurrency, getProductUnits, convertToMainUnit } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, Plus, Edit2, Trash2, Package, DollarSign, FileText, ChevronDown, ChevronUp, X, Minus, Plus as PlusIcon } from 'lucide-react'
import type { Purchase, SaleItem, Product, Supplier, StockMovement, AuditLog, AccountingEntry } from '@/types'


import { useAppStore } from '@/stores/appStore'
import { processPurchase, deletePurchase } from '@/engine/operations'
import type { Location } from '@/engine/types'

const statusColors = {
  pending: 'warning',
  completed: 'success',
  cancelled: 'danger',
  returned: 'info',
} as const

export default function PurchasesPage() {
  const businessId = useBusinessId()
  const purchases = useLiveQuery(() => db.purchases.where('businessId').equals(businessId).reverse().sortBy('createdAt'), [businessId]) ?? []
  const suppliers = useLiveQuery(() => db.suppliers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const allLocations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Purchase | null>(null)
  const userId = useAppStore(s => s.user?.id || '')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [supplierId, setSupplierId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: number; discount: number; taxRate: number; total: number; unitName?: string; unitQuantity?: number }[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile' | 'credit' | 'bank'>('cash')
  const [paid, setPaid] = useState(0)

  const supplierList = suppliers || []

  const filtered = purchases?.filter(p =>
    (p.supplierName || '').toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 10)

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0)
    const discountTotal = items.reduce((s, i) => s + i.discount, 0)
    const taxTotal = items.reduce((s, i) => s + (i.unitPrice * i.quantity * i.taxRate / 100), 0)
    return { subtotal, discountTotal, taxTotal, total: subtotal - discountTotal + taxTotal }
  }, [items])

  function openCreate() {
    setEditing(null)
    setSupplierId('')
    setLocationId('')
    setNote('')
    setItems([])
    setPaymentMethod('cash')
    setPaid(0)
    setModalOpen(true)
  }

  function openEdit(purchase: Purchase) {
    setEditing(purchase)
    setSupplierId(purchase.supplierId || '')
    setNote(purchase.note || '')
    setItems(purchase.items.map(i => ({ ...i, unitName: i.unitName || undefined, unitQuantity: i.unitQuantity || 1 })))
    setPaid(purchase.paid)
    setModalOpen(true)
  }

  function addItem(productId: string) {
    const product = products?.find(p => p.id === productId)
    if (!product) return
    const existing = items.find(i => i.productId === productId)
    if (existing) {
      setItems(items.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice * (1 + i.taxRate / 100) - i.discount } : i))
      return
    }
    setItems([...items, {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.purchasePrice,
      discount: 0,
      taxRate: product.taxRate,
      total: product.purchasePrice * (1 + product.taxRate / 100),
      unitName: product.unit,
      unitQuantity: 1,
    }])
  }

  function changeItemUnit(productId: string, unitName: string, unitQuantity: number, unitPrice: number) {
    setItems(items.map(i => {
      if (i.productId !== productId) return i
      const newUnitPrice = unitQuantity > 1 ? unitPrice : i.unitPrice
      return { ...i, unitName, unitQuantity, unitPrice: newUnitPrice, total: i.quantity * newUnitPrice * (1 + i.taxRate / 100) - i.discount }
    }))
  }

  function updateItem(productId: string, field: string, value: number) {
    setItems(items.map(i => {
      if (i.productId !== productId) return i
      const updated = { ...i, [field]: value }
      updated.total = updated.unitPrice * updated.quantity * (1 + updated.taxRate / 100) - updated.discount
      return updated
    }))
  }

  function removeItem(productId: string) {
    setItems(items.filter(i => i.productId !== productId))
  }

  async function handleSave() {
    if (!locationId) { toast('Veuillez sélectionner un emplacement de stockage', 'warning'); return }
    const now = new Date().toISOString()
    const supplier = suppliers?.find(s => s.id === supplierId)
    const purchase: Purchase = {
      id: editing ? editing.id : generateId(),
      businessId,
      locationId,
      supplierId: supplierId || undefined,
      supplierName: supplier?.name || 'Fournisseur inconnu',
      items: items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        taxRate: i.taxRate,
        total: i.total,
        unitName: i.unitName,
        unitQuantity: i.unitQuantity,
      })),
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      paid,
      status: editing ? editing.status : 'completed',
      note: note || undefined,
      createdAt: editing ? editing.createdAt : now,
      userId,
    }

    try {
      if (editing) {
        const { editPurchase } = await import('@/engine/operations')
        await editPurchase(editing.id, purchase)
        toast('Achat mis à jour avec succès', 'success')
      } else {
        await processPurchase(purchase)
        toast('Achat créé avec succès', 'success')
      }
      setModalOpen(false)
    } catch (error) {
      toast('Erreur lors de la sauvegarde de l\'achat', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer cet achat ?')) return
    try {
      await deletePurchase(id)
      toast('Achat supprimé avec succès', 'success')
    } catch (error) {
      toast('Erreur lors de la suppression de l\'achat', 'error')
    }
  }

  function getStatusVariant(status: string) {
    return statusColors[status as keyof typeof statusColors] || 'default'
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Achats</h1>
          <p className="text-surface-500 text-sm mt-1">{purchases?.length || 0} achats</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouvel achat</Button>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" placeholder="Rechercher par fournisseur..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="space-y-3">
        {paginatedItems?.map((p) => (
          <Card key={p.id} padding="sm" className="hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center text-cyan-600 shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-surface-900 truncate">{p.supplierName || 'N/A'}</p>
                  <p className="text-xs text-surface-400">{new Date(p.createdAt).toLocaleDateString('fr-FR')} · {p.items.length} article{p.items.length > 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="font-semibold text-surface-900">{formatCurrency(p.total)}</p>
                  <Badge variant={getStatusVariant(p.status)}>{p.status}</Badge>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                    {expandedId === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            {expandedId === p.id && (
              <div className="px-4 pb-4 border-t border-surface-100 pt-3 animate-fade-in">
                <div className="overflow-x-auto responsive-table">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-surface-400 text-xs">
                      <th className="text-left pb-2">Produit</th>
                      <th className="text-right pb-2">Qté</th>
                      <th className="text-right pb-2">Prix unit.</th>
                      <th className="text-right pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.items.map((item, idx) => (
                      <tr key={idx} className="border-t border-surface-50">
                        <td className="py-2 text-surface-900">{item.productName}</td>
                        <td className="py-2 text-right text-surface-600">{item.quantity} {item.unitName || ''}</td>
                        <td className="py-2 text-right text-surface-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(item.unitPrice * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-surface-200">
                      <td colSpan={3} className="pt-2 text-right text-surface-500">Total</td>
                      <td className="pt-2 text-right font-bold text-surface-900">{formatCurrency(p.total)}</td>
                    </tr>
                    {p.note && (
                      <tr>
                        <td colSpan={4} className="pt-2 text-xs text-surface-400 italic">{p.note}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
                </div>
              </div>
            )}
          </Card>
        ))}
        <div className="flex justify-center pt-4">
          <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
        </div>
        {(!filtered || filtered.length === 0) && (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-400">Aucun achat trouvé</p>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier achat' : 'Nouvel achat'} size="lg">
        <div className="p-6 space-y-4">
          <Select
            label="Fournisseur"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            options={supplierList.map(s => ({ value: s.id, label: `${s.name} (${s.phone})` }))}
            placeholder="Sélectionner un fournisseur"
          />
          <Select
            label="Emplacement de stockage *"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            options={allLocations.map(l => ({ value: l.id, label: `${l.name} (${l.type === 'shop' ? 'Boutique' : 'Dépôt'})` }))}
            placeholder="Choisir où stocker la marchandise"
          />

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Produits</label>
            <div className="space-y-2">
              {items.map((item) => {
                const product = products?.find(p => p.id === item.productId)
                const units = product ? getProductUnits(product) : [{ name: 'Pièce', quantity: 1 }]
                return (
                  <div key={item.productId} className="flex items-center gap-2 p-2 bg-surface-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-900 truncate">{item.productName}</p>
                    </div>
                    <select
                      value={item.unitName || 'Pièce'}
                      onChange={(e) => {
                        const val = e.target.value
                        if (!product) return
                        const unit = units.find(u => u.name === val) || units[0]
                        changeItemUnit(item.productId, unit.name, unit.quantity, unit.quantity * product.purchasePrice)
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-surface-200 bg-white"
                    >
                      {units.map(u => (
                        <option key={u.name} value={u.name}>{u.name}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateItem(item.productId, 'quantity', Math.max(1, item.quantity - 1))} className="p-1 rounded-md hover:bg-surface-200 text-surface-500"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <button onClick={() => updateItem(item.productId, 'quantity', item.quantity + 1)} className="p-1 rounded-md hover:bg-surface-200 text-surface-500"><Plus className="w-3 h-3" /></button>
                    </div>
                    <input
                      type="number" value={item.unitPrice}
                      onChange={(e) => updateItem(item.productId, 'unitPrice', Number(e.target.value))}
                      className="w-20 text-sm px-2 py-1 rounded-lg border border-surface-200 text-right"
                    />
                    <p className="text-sm font-semibold text-surface-900 w-20 text-right">{formatCurrency(item.unitPrice * item.quantity)}</p>
                    <button onClick={() => removeItem(item.productId)} className="p-1 rounded-md hover:bg-red-50 text-surface-400 hover:text-danger"><X className="w-4 h-4" /></button>
                  </div>
                )
              })}
            </div>
            <Select
              value=""
              onChange={(e) => { if (e.target.value) { addItem(e.target.value); e.target.value = '' } }}
              options={(products || [])
                .filter(p => !items.find(i => i.productId === p.id))
                .map(p => ({ value: p.id, label: `${p.name} - ${formatCurrency(p.purchasePrice)}` }))
              }
              placeholder="+ Ajouter un produit"
            />
          </div>

          <div className="bg-surface-50 rounded-xl p-4 space-y-1 text-sm">
            <div className="flex justify-between text-surface-500"><span>Sous-total</span><span>{formatCurrency(totals.subtotal)}</span></div>
            {totals.discountTotal > 0 && <div className="flex justify-between text-danger"><span>Remise</span><span>-{formatCurrency(totals.discountTotal)}</span></div>}
            {totals.taxTotal > 0 && <div className="flex justify-between text-surface-500"><span>TVA</span><span>{formatCurrency(totals.taxTotal)}</span></div>}
            <div className="flex justify-between font-bold text-surface-900 pt-1 border-t border-surface-200"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
          </div>

          <Input label="Montant payé" type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} icon={<DollarSign className="w-4 h-4" />} />
          <Input label="Notes" value={note} onChange={(e) => setNote(e.target.value)} icon={<FileText className="w-4 h-4" />} />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={items.length === 0}>{editing ? 'Mettre à jour' : 'Créer l\'achat'}</Button>
        </div>
      </Modal>
    </div>
  )
}
