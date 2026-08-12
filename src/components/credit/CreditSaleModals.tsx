import { useEffect, useState } from 'react'
import { Modal, Button, ProductSearch } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { recordCreditPayment, editSale } from '@/engine/operations'
import { Save, Plus, X, DollarSign, History, FileText } from 'lucide-react'
import type { Credit, CreditPayment, PaymentMethod, Sale, SaleItem } from '@/types'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'card', label: 'Carte' },
  { value: 'bank', label: 'Virement' },
]

const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', mobile: 'Mobile Money',
  credit: 'Crédit', bank: 'Virement', split: 'Mixte',
}

function getCreditForSale(saleId: string | undefined): Promise<Credit | undefined> {
  if (!saleId) return Promise.resolve<Credit | undefined>(undefined)
  return db.credits.filter(c => c.invoiceId === saleId).first()
}

export function CreditPaymentModal({ open, onClose, saleId, onPaid }: {
  open: boolean
  onClose: () => void
  saleId?: string
  onPaid?: () => void
}) {
  const businessId = useBusinessId()
  const credit = useLiveQuery<Credit | undefined>(() => getCreditForSale(saleId), [saleId])
  const payments = useLiveQuery<CreditPayment[]>(
    () => saleId
      ? db.creditPayments.where('businessId').equals(businessId).toArray()
      : Promise.resolve<CreditPayment[]>([]),
    [saleId, businessId]
  ) || []

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && credit) {
      setAmount(String(credit.balance))
      setMethod('cash')
      setNote('')
    }
  }, [open, credit])

  const history = credit ? payments.filter(p => p.creditId === credit.id).sort((a, b) => b.date.localeCompare(a.date)) : []

  async function submit() {
    if (!credit) return
    const value = parseFloat(amount)
    if (isNaN(value) || value <= 0) { toast('Montant invalide', 'error'); return }
    if (value > credit.balance) { toast('Le montant dépasse le solde restant', 'error'); return }
    setSaving(true)
    try {
      await recordCreditPayment(credit.id, value, method, note || undefined)
      toast('Paiement enregistré', 'success')
      onPaid?.()
      onClose()
    } catch (err: any) {
      toast(err?.message || 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  const paidPercent = credit && credit.amount > 0 ? Math.round((credit.paid / credit.amount) * 100) : 0

  return (
    <Modal open={open} onClose={onClose} title="Encaisser un paiement" size="sm">
      <div className="p-6 space-y-4">
        {credit && (
          <div className="space-y-3">
            <div>
              <p className="text-sm text-surface-500">Client: <span className="font-semibold text-surface-900">{credit.customerName}</span></p>
              <p className="text-xs text-surface-400 mt-0.5">
                Solde restant: <span className="font-semibold text-amber-400">{formatCurrency(credit.balance)}</span>
                {' · '}Payé: <span className="font-semibold text-emerald-400">{formatCurrency(credit.paid)}</span>
                {' · '}Total: <span className="font-semibold text-surface-900">{formatCurrency(credit.amount)}</span>
              </p>
            </div>
            <div>
              <div className="flex justify-between text-xs text-surface-500 mb-1">
                <span>Avancement</span><span className="font-semibold text-surface-700">{paidPercent}%</span>
              </div>
              <div className="h-2.5 bg-surface-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${paidPercent}%` }} />
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Montant</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-surface-300 bg-surface-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Mode de paiement</label>
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="w-full rounded-xl border border-surface-300 bg-surface-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1">Note (optionnelle)</label>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-surface-300 bg-surface-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        {history.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Historique des paiements</h4>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {history.map(p => (
                <div key={p.id} className="flex items-center justify-between text-sm bg-surface-50 rounded-lg px-3 py-2">
                  <span className="text-surface-600">{formatDateTime(p.date)} · {METHOD_LABEL[p.method] || p.method}</span>
                  <span className="font-semibold text-emerald-400">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}><DollarSign className="w-4 h-4" /> Enregistrer</Button>
        </div>
      </div>
    </Modal>
  )
}

export function CreditSaleEditModal({ open, onClose, saleId, onSaved }: {
  open: boolean
  onClose: () => void
  saleId?: string
  onSaved?: () => void
}) {
  const businessId = useBusinessId()
  const sale = useLiveQuery<Sale | undefined>(
    () => saleId ? db.sales.get(saleId) : Promise.resolve<Sale | undefined>(undefined),
    [saleId]
  )
  const products = useLiveQuery(
    () => db.products.where('businessId').equals(businessId).toArray(),
    [businessId]
  ) || []

  const [customerName, setCustomerName] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [items, setItems] = useState<SaleItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && sale) {
      setCustomerName(sale.customerName || '')
      setCustomerId(sale.customerId || '')
      setPaymentMethod(sale.paymentMethod)
      setItems(sale.items.map(i => ({ ...i })))
    }
  }, [open, sale])

  const total = items.reduce((s, i) => s + i.total + i.total * (i.taxRate || 0) / 100, 0)
  const restant = Math.max(0, (sale?.total || 0) - (sale?.paid || 0))

  function updateItem(index: number, field: keyof SaleItem, value: any) {
    const next = [...items]
    const item = { ...next[index], [field]: value }
    item.total = (item.unitPrice - item.discount) * item.quantity
    next[index] = item
    setItems(next)
  }

  function removeItem(index: number) {
    if (items.length <= 1) return
    setItems(items.filter((_, i) => i !== index))
  }

  function addItem() {
    setItems([...items, { productId: '', productName: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, total: 0 }])
  }

  function selectProduct(index: number, productId: string) {
    const next = [...items]
    if (!productId) {
      next[index] = { ...items[index], productId: '', productName: '', unitPrice: 0, total: 0 }
      setItems(next)
      return
    }
    const product = products.find((p: any) => p.id === productId)
    if (!product) return
    next[index] = {
      productId: product.id, productName: product.name,
      quantity: 1, unitPrice: product.sellingPrice, discount: 0,
      taxRate: product.taxRate || 0, total: product.sellingPrice,
    }
    setItems(next)
  }

  async function submit() {
    if (!sale) return
    if (items.some(i => !i.productId || !i.productName)) { toast('Veuillez compléter les produits', 'error'); return }
    const subtotal = items.reduce((s, i) => s + i.total, 0)
    const discountTotal = items.reduce((s, i) => s + i.discount, 0)
    const taxTotal = items.reduce((s, i) => s + i.total * (i.taxRate || 0) / 100, 0)
    setSaving(true)
    try {
      await editSale(sale.id, {
        customerName,
        customerId: customerId || undefined,
        paymentMethod,
        items,
        subtotal, discountTotal, taxTotal, total: subtotal + taxTotal,
      })
      toast('Vente modifiée avec succès', 'success')
      onSaved?.()
      onClose()
    } catch (err: any) {
      toast(err?.message || 'Erreur', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={sale ? `Modifier la vente ${sale.invoiceNumber}` : ''} size="lg">
      <div className="p-6 space-y-6">
        {sale && (
          <div className="flex flex-wrap items-center gap-4 p-4 bg-surface-50 rounded-2xl border border-surface-200">
            <div className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4 text-primary-400" /><span className="font-semibold text-surface-900">{sale.invoiceNumber}</span></div>
            <div className="flex items-center gap-2 text-sm text-surface-600"><span>Payé</span><span className="font-bold text-emerald-400">{formatCurrency(sale.paid)}</span></div>
            <div className="flex items-center gap-2 text-sm text-surface-600"><span>Restant</span><span className="font-bold text-amber-400">{formatCurrency(restant)}</span></div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Client</label>
            <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Mode de paiement</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="cash">Espèces</option>
              <option value="mobile">Mobile Money</option>
              <option value="card">Carte</option>
              <option value="bank">Virement</option>
              <option value="credit">Crédit</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-surface-900">Produits</h3>
            <Button size="sm" onClick={addItem}><Plus className="w-4 h-4" /> Ajouter</Button>
          </div>
          <div className="overflow-x-auto responsive-table"><table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-surface-500">Produit</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-surface-500 w-20">Qté</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 w-28">Prix unit.</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 w-28">Remise</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-surface-500 w-28">Total</th>
                <th className="px-3 py-2 text-center text-xs font-medium text-surface-500 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-surface-100">
                  <td className="px-3 py-2 min-w-[220px]">
                    <ProductSearch
                      products={products as any[]}
                      value={item.productId}
                      onSelect={(id) => selectProduct(idx, id)}
                    />
                  </td>
                  <td className="px-3 py-2"><input type="number" value={item.quantity} min={1} onChange={(e) => updateItem(idx, 'quantity', Math.max(1, +e.target.value))} className="w-20 rounded-lg border border-surface-300 px-2 py-1.5 text-sm text-center" /></td>
                  <td className="px-3 py-2"><input type="number" value={item.unitPrice} min={0} onChange={(e) => updateItem(idx, 'unitPrice', +e.target.value)} className="w-28 rounded-lg border border-surface-300 px-2 py-1.5 text-sm text-right" /></td>
                  <td className="px-3 py-2"><input type="number" value={item.discount} min={0} onChange={(e) => updateItem(idx, 'discount', +e.target.value)} className="w-28 rounded-lg border border-surface-300 px-2 py-1.5 text-sm text-right" /></td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.total)}</td>
                  <td className="px-3 py-2 text-center">
                    {items.length > 1 && <button onClick={() => removeItem(idx)} className="p-1 rounded-lg hover:bg-red-500/15 text-surface-400 hover:text-red-400"><X className="w-4 h-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-50/50 font-bold">
                <td colSpan={4} className="px-3 py-3 text-right">Total (TTC)</td>
                <td className="px-3 py-3 text-right">{formatCurrency(total)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-surface-200">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={submit} disabled={saving}><Save className="w-4 h-4" /> Enregistrer les modifications</Button>
        </div>
      </div>
    </Modal>
  )
}
