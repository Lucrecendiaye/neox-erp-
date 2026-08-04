import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Badge, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, formatDate, formatDateTime, generateId } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { processSupplierInvoice, processSupplierPayment, processCompensation } from '@/engine/operations'
import type { SupplierInvoice, SupplierInvoiceItem, CompensationItem, PaymentLine } from '@/engine/types'
import { ArrowLeft, Plus, FileText, CreditCard, Scale, Truck, Phone, Mail, MapPin, DollarSign } from 'lucide-react'
import { useBusinessId } from '@/hooks/useBusinessId'
import { useAppStore } from '@/stores/appStore'

export default function SupplierDetailPage() {
  const { supplierId } = useParams()
  const businessId = useBusinessId()
  const userId = useAppStore((s) => s.user?.id || '')
  const navigate = useNavigate()
  const supplier = useLiveQuery(() => db.suppliers.get(supplierId!), [supplierId])
  const invoices = useLiveQuery(() => db.supplierInvoices.where('supplierId').equals(supplierId!).reverse().sortBy('createdAt'), [supplierId])
  const compensations = useLiveQuery(() => db.compensations.where('partyId').equals(supplierId!).toArray(), [supplierId])
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const [invModal, setInvModal] = useState(false)
  const [payModal, setPayModal] = useState<SupplierInvoice | null>(null)
  const [compModal, setCompModal] = useState(false)
  const [invItems, setInvItems] = useState<{ productId: string; qty: number; price: number }[]>([])
  const [invNumber, setInvNumber] = useState('')
  const [compDirection, setCompDirection] = useState<'debt_to_goods' | 'goods_to_debt'>('debt_to_goods')
  const [compAmount, setCompAmount] = useState(0)
  const [compItems, setCompItems] = useState<{ productId: string; qty: number; price: number }[]>([])
  const [payAmount, setPayAmount] = useState(0)
  const [payType, setPayType] = useState<'cash' | 'bank' | 'mobile' | 'mixed'>('cash')
  const [payProductItems, setPayProductItems] = useState<{ productId: string; qty: number; price: number }[]>([])

  const totalDue = useMemo(() => {
    return invoices?.reduce((s, inv) => s + inv.balance, 0) || 0
  }, [invoices])

  const stats = useMemo(() => {
    const totalInvoiced = invoices?.reduce((s, i) => s + i.total, 0) || 0
    const totalPaid = invoices?.reduce((s, i) => s + i.paid, 0) || 0
    return { totalInvoiced, totalPaid, balance: totalInvoiced - totalPaid }
  }, [invoices])

  async function handleCreateInvoice() {
    if (!invNumber || invItems.length === 0) return toast('Complétez les champs', 'warning')
    const items: SupplierInvoiceItem[] = invItems.map(i => {
      const p = products?.find(pr => pr.id === i.productId)
      return {
        productId: i.productId,
        productName: p?.name || 'Produit inconnu',
        quantity: i.qty,
        unitPrice: i.price,
        total: i.qty * i.price,
      }
    })
    const total = items.reduce((s, i) => s + i.total, 0)
    await processSupplierInvoice({
      id: generateId(),
      businessId,
      supplierId: supplierId!,
      number: invNumber,
      items,
      subtotal: total,
      taxTotal: 0,
      total,
      paid: 0,
      balance: total,
      status: 'credit',
      payments: [],
      createdAt: new Date().toISOString(),
      userId,
    })
    toast(`Facture ${invNumber} créée`, 'success')
    setInvModal(false)
    setInvItems([])
    setInvNumber('')
  }

  async function handlePayInvoice() {
    if (!payModal || payAmount <= 0) return toast('Montant invalide', 'warning')
    if (payAmount > payModal.balance) return toast('Montant supérieur au solde', 'error')
    if (payType === 'mixed' && payProductItems.length === 0) return toast('Ajoutez des produits pour le paiement en nature', 'warning')

    const lines: PaymentLine[] = []
    if (payType === 'mixed') {
      lines.push({ id: generateId(), type: 'cash', amount: payAmount })
      for (const item of payProductItems) {
        lines.push({
          id: generateId(), type: 'product', amount: item.qty * item.price,
          productId: item.productId, productQty: item.qty,
        })
      }
    } else {
      lines.push({ id: generateId(), type: payType, amount: payAmount })
    }

    const totalPayAmount = lines.reduce((s, l) => s + l.amount, 0)
    await processSupplierPayment(payModal.id, {
      id: generateId(),
      invoiceId: payModal.id,
      lines,
      amount: totalPayAmount,
      date: new Date().toISOString(),
      userId,
      createdAt: new Date().toISOString(),
    })
    toast('Paiement enregistré', 'success')
    setPayModal(null)
    setPayAmount(0)
    setPayProductItems([])
  }

  async function handleCreateCompensation() {
    if (!compAmount || compItems.length === 0) return toast('Complétez les champs', 'warning')
    const items: CompensationItem[] = compItems.map(i => {
      const p = products?.find(pr => pr.id === i.productId)
      return {
        productId: i.productId,
        productName: p?.name || '',
        quantity: i.qty,
        unitPrice: i.price,
        total: i.qty * i.price,
      }
    })
    await processCompensation({
      id: generateId(),
      businessId,
      partyId: supplierId!,
      partyType: 'supplier',
      direction: compDirection,
      referenceInvoiceId: invoices?.[0]?.id || '',
      amount: compAmount,
      items,
      settledAmount: 0,
      balance: compAmount,
      status: 'completed',
      createdAt: new Date().toISOString(),
      userId,
    })
    toast('Compensation enregistrée', 'success')
    setCompModal(false)
    setCompItems([])
    setCompAmount(0)
  }

  function addInvoiceRow() {
    setInvItems([...invItems, { productId: products?.[0]?.id || '', qty: 1, price: 0 }])
  }

  function addCompRow() {
    setCompItems([...compItems, { productId: products?.[0]?.id || '', qty: 1, price: 0 }])
  }

  function addPayProductRow() {
    setPayProductItems([...payProductItems, { productId: products?.[0]?.id || '', qty: 1, price: 0 }])
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/suppliers')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-surface-900">{supplier?.name || 'Fournisseur'}</h1>
          <div className="flex flex-wrap gap-3 mt-1 text-xs text-surface-500">
            {supplier?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{supplier.phone}</span>}
            {supplier?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{supplier.email}</span>}
            {supplier?.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{supplier.address}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setInvModal(true)}><FileText className="w-4 h-4" /> Facture</Button>
          <Button onClick={() => setCompModal(true)}><Scale className="w-4 h-4" /> Compensation</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="p-4 text-center">
            <p className="text-sm text-surface-500">Total facturé</p>
            <p className="text-2xl font-bold text-surface-900">{formatCurrency(stats.totalInvoiced)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-sm text-surface-500">Payé</p>
            <p className="text-2xl font-bold text-success">{formatCurrency(stats.totalPaid)}</p>
          </div>
        </Card>
        <Card>
          <div className="p-4 text-center">
            <p className="text-sm text-surface-500">Solde dû</p>
            <p className="text-2xl font-bold text-danger">{formatCurrency(stats.balance)}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle><FileText className="w-5 h-5 inline mr-2" />Factures</CardTitle></CardHeader>
        <div className="overflow-x-auto responsive-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">N°</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Total</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Payé</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Solde</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Statut</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {invoices?.map(inv => (
                <tr key={inv.id} className="hover:bg-surface-50">
                  <td data-label="N°" className="px-4 py-3 text-sm font-medium">{inv.number}</td>
                  <td data-label="Date" className="px-4 py-3 text-sm text-surface-500">{formatDate(inv.createdAt)}</td>
                  <td data-label="Total" className="px-4 py-3 text-sm text-right font-semibold">{formatCurrency(inv.total)}</td>
                  <td data-label="Payé" className="px-4 py-3 text-sm text-right">{formatCurrency(inv.paid)}</td>
                  <td data-label="Solde" className="px-4 py-3 text-sm text-right font-semibold text-danger">{formatCurrency(inv.balance)}</td>
                  <td data-label="Statut" className="px-4 py-3 text-center">
                    <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'partial' ? 'warning' : inv.status === 'cancelled' ? 'danger' : 'info'}>
                      {inv.status === 'paid' ? 'Payée' : inv.status === 'partial' ? 'Partielle' : inv.status === 'cancelled' ? 'Annulée' : 'À crédit'}
                    </Badge>
                  </td>
                  <td data-label="Action" className="px-4 py-3 text-right">
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                      <Button size="sm" variant="outline" onClick={() => { setPayModal(inv); setPayAmount(inv.balance); setPayType('cash'); setPayProductItems([]) }}>
                        <DollarSign className="w-3 h-3" /> Payer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {(!invoices || invoices.length === 0) && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-surface-400">Aucune facture</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle><Scale className="w-5 h-5 inline mr-2" />Compensations</CardTitle></CardHeader>
        <div className="space-y-2 p-4">
          {compensations?.map(c => (
            <div key={c.id} className="flex justify-between items-center p-3 rounded-xl bg-surface-50">
              <div>
                <p className="text-sm font-medium">{c.direction === 'debt_to_goods' ? 'Dette → Marchandises' : 'Marchandises → Dette'}</p>
                <p className="text-xs text-surface-400">{formatDateTime(c.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatCurrency(c.settledAmount)}</p>
                <Badge variant={c.status === 'completed' ? 'success' : 'warning'}>{c.status}</Badge>
              </div>
            </div>
          ))}
          {(!compensations || compensations.length === 0) && (
            <p className="text-sm text-surface-400 text-center py-4">Aucune compensation</p>
          )}
        </div>
      </Card>

      <Modal open={invModal} onClose={() => setInvModal(false)} title="Nouvelle facture fournisseur" size="md">
        <div className="space-y-4 p-6">
          <input placeholder="N° de facture" value={invNumber} onChange={e => setInvNumber(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          {invItems.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <select value={item.productId} onChange={e => {
                const updated = [...invItems]; updated[idx].productId = e.target.value; setInvItems(updated)
              }} className="flex-1 px-3 py-2 rounded-xl border border-surface-300 text-sm">
                {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" placeholder="Qté" value={item.qty} onChange={e => {
                const updated = [...invItems]; updated[idx].qty = Number(e.target.value); setInvItems(updated)
              }} className="w-20 px-3 py-2 rounded-xl border border-surface-300 text-sm text-right" />
              <input type="number" placeholder="PU" value={item.price} onChange={e => {
                const updated = [...invItems]; updated[idx].price = Number(e.target.value); setInvItems(updated)
              }} className="w-24 px-3 py-2 rounded-xl border border-surface-300 text-sm text-right" />
            </div>
          ))}
          <Button variant="outline" onClick={addInvoiceRow} className="w-full"><Plus className="w-4 h-4" /> Ajouter un produit</Button>
          <Button onClick={handleCreateInvoice} className="w-full">Créer la facture</Button>
        </div>
      </Modal>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Paiement facture ${payModal?.number || ''}`} size="md">
        <div className="space-y-4 p-6">
          <div className="flex justify-between text-sm">
            <span className="text-surface-500">Solde restant</span>
            <span className="font-semibold text-danger">{payModal ? formatCurrency(payModal.balance) : ''}</span>
          </div>
          <select value={payType} onChange={e => setPayType(e.target.value as any)}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm">
            <option value="cash">Espèces</option>
            <option value="bank">Banque</option>
            <option value="mobile">Mobile Money</option>
            <option value="mixed">Mixte (espèces + produits)</option>
          </select>
          <input type="number" placeholder="Montant à payer" value={payAmount || ''} onChange={e => setPayAmount(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          {payType === 'mixed' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-surface-700">Produits pour paiement en nature</p>
              {payProductItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select value={item.productId} onChange={e => {
                    const updated = [...payProductItems]; updated[idx].productId = e.target.value; setPayProductItems(updated)
                  }} className="flex-1 px-3 py-2 rounded-xl border border-surface-300 text-sm">
                    {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" placeholder="Qté" value={item.qty} onChange={e => {
                    const updated = [...payProductItems]; updated[idx].qty = Number(e.target.value); setPayProductItems(updated)
                  }} className="w-20 px-3 py-2 rounded-xl border border-surface-300 text-sm text-right" />
                  <input type="number" placeholder="PU" value={item.price} onChange={e => {
                    const updated = [...payProductItems]; updated[idx].price = Number(e.target.value); setPayProductItems(updated)
                  }} className="w-24 px-3 py-2 rounded-xl border border-surface-300 text-sm text-right" />
                </div>
              ))}
              <Button variant="outline" onClick={addPayProductRow} className="w-full"><Plus className="w-4 h-4" /> Ajouter</Button>
            </div>
          )}
          <Button onClick={handlePayInvoice} className="w-full">Enregistrer le paiement</Button>
        </div>
      </Modal>

      <Modal open={compModal} onClose={() => setCompModal(false)} title="Compensation" size="md">
        <div className="space-y-4 p-6">
          <select value={compDirection} onChange={e => setCompDirection(e.target.value as any)}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm">
            <option value="debt_to_goods">Dette fournisseur → Marchandises (paiement en nature)</option>
            <option value="goods_to_debt">Marchandises → Dette fournisseur (remboursement en stock)</option>
          </select>
          <input type="number" placeholder="Montant de la dette" value={compAmount || ''} onChange={e => setCompAmount(Number(e.target.value))}
            className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          {compItems.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <select value={item.productId} onChange={e => {
                const updated = [...compItems]; updated[idx].productId = e.target.value; setCompItems(updated)
              }} className="flex-1 px-3 py-2 rounded-xl border border-surface-300 text-sm">
                {products?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" placeholder="Qté" value={item.qty} onChange={e => {
                const updated = [...compItems]; updated[idx].qty = Number(e.target.value); setCompItems(updated)
              }} className="w-20 px-3 py-2 rounded-xl border border-surface-300 text-sm text-right" />
              <input type="number" placeholder="PU" value={item.price} onChange={e => {
                const updated = [...compItems]; updated[idx].price = Number(e.target.value); setCompItems(updated)
              }} className="w-24 px-3 py-2 rounded-xl border border-surface-300 text-sm text-right" />
            </div>
          ))}
          <Button variant="outline" onClick={addCompRow} className="w-full"><Plus className="w-4 h-4" /> Ajouter un produit</Button>
          <Button onClick={handleCreateCompensation} className="w-full">Enregistrer la compensation</Button>
        </div>
      </Modal>
    </div>
  )
}
