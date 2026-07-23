import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate, openWhatsApp } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, Plus, Edit2, Trash2, FileText, Download, Send, ChevronDown, ChevronUp, X, Plus as PlusIcon, Printer } from 'lucide-react'
import { exportInvoicePDF } from '@/lib/pdf'
import type { Invoice, SaleItem, Customer, Supplier, Product } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const statusColors = {
  draft: 'default',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  cancelled: 'warning',
} as const

const typeColors = {
  sale: 'success',
  purchase: 'info',
  credit_note: 'warning',
  debit_note: 'danger',
} as const

const typeLabels = {
  sale: 'Vente',
  purchase: 'Achat',
  credit_note: 'Avoir',
  debit_note: 'Débit',
} as const

export default function InvoicesPage() {
  const isCloud = isSupabaseConfigured()
  const dexieInvoices = useLiveQuery(() => db.invoices.orderBy('createdAt').reverse().toArray(), [])
  const { data: supabaseInvoices } = useSupabaseQuery<Invoice>('invoices', undefined, [])
  const invoices = isCloud ? (supabaseInvoices || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : dexieInvoices
  const dexieSettings = useLiveQuery(() => db.settings.get('default'), [])
  const { data: supabaseSettingsRaw } = useSupabaseQuery<any>('settings', undefined, [])
  const settings = isCloud ? (supabaseSettingsRaw || []).find((s: any) => s.id === 'default') : dexieSettings
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [type, setType] = useState<'sale' | 'purchase' | 'credit_note' | 'debit_note'>('sale')
  const [partyName, setPartyName] = useState('')
  const [partyId, setPartyId] = useState('')
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: number; discount: number; taxRate: number; total: number }[]>([])
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'>('draft')
  const [paid, setPaid] = useState(0)

  const dexieCustomers = useLiveQuery(() => db.customers.toArray(), [])
  const { data: supabaseCustomers } = useSupabaseQuery<Customer>('customers', undefined, [])
  const customers = isCloud ? supabaseCustomers : dexieCustomers
  const dexieSuppliers = useLiveQuery(() => db.suppliers.toArray(), [])
  const { data: supabaseSuppliers } = useSupabaseQuery<Supplier>('suppliers', undefined, [])
  const suppliers = isCloud ? supabaseSuppliers : dexieSuppliers
  const dexieProducts = useLiveQuery(() => db.products.toArray(), [])
  const { data: supabaseProducts } = useSupabaseQuery<Product>('products', undefined, [])
  const products = isCloud ? supabaseProducts : dexieProducts

  const parties = type === 'purchase' ? suppliers || [] : customers || []

  const filtered = invoices?.filter(inv =>
    (inv.number || '').toLowerCase().includes(search.toLowerCase()) ||
    (inv.partyName || '').toLowerCase().includes(search.toLowerCase())
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
    setType('sale')
    setPartyName('')
    setPartyId('')
    setItems([])
    setDueDate('')
    setStatus('draft')
    setPaid(0)
    setModalOpen(true)
  }

  function openEdit(invoice: Invoice) {
    setEditing(invoice)
    setType(invoice.type)
    setPartyName(invoice.partyName || '')
    setPartyId(invoice.partyId || '')
    setItems(invoice.items.map(i => ({ ...i })))
    setDueDate(invoice.dueDate || '')
    setStatus(invoice.status)
    setPaid(invoice.paid)
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
      unitPrice: product.sellingPrice,
      discount: 0,
      taxRate: product.taxRate,
      total: product.sellingPrice * (1 + product.taxRate / 100),
    }])
  }

  function removeItem(productId: string) {
    setItems(items.filter(i => i.productId !== productId))
  }

  function updateItem(productId: string, field: string, value: number) {
    setItems(items.map(i => {
      if (i.productId !== productId) return i
      const updated = { ...i, [field]: value }
      updated.total = updated.unitPrice * updated.quantity * (1 + updated.taxRate / 100) - updated.discount
      return updated
    }))
  }

  async function handleSave() {
    const now = new Date().toISOString()
    const nextNum = (settings?.invoiceNextNumber || 1)
    const prefix = settings?.invoicePrefix || 'INV-'
    const invoice: Invoice = {
      id: editing ? editing.id : generateId(),
      businessId: 'biz-default',
      type,
      number: editing ? editing.number : `${prefix}${String(nextNum).padStart(5, '0')}`,
      partyId: partyId || undefined,
      partyName: partyName || 'Client',
      items: items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        taxRate: i.taxRate,
        total: i.total,
      })),
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      paid,
      dueDate: dueDate || undefined,
      status,
      createdAt: editing ? editing.createdAt : now,
      userId: 'admin',
    }

    try {
      if (editing) {
        if (isCloud) { await sb.update('invoices', editing.id, { ...invoice }) } else { await db.invoices.update(editing.id, { ...invoice }) }
        toast('Facture mise à jour avec succès', 'success')
      } else {
        if (isCloud) { await sb.insert('invoices', invoice) } else { await db.invoices.add(invoice) }
        if (settings) {
          if (isCloud) { await sb.update('settings', 'default', { invoiceNextNumber: nextNum + 1 }) } else { await db.settings.update('default', { invoiceNextNumber: nextNum + 1 }) }
        }
        toast('Facture créée avec succès', 'success')
      }
      setModalOpen(false)
    } catch (error) {
      toast('Erreur lors de la sauvegarde de la facture', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer cette facture ?')) return
    try {
      if (isCloud) { await sb.remove('invoices', id) } else { await db.invoices.delete(id) }
      toast('Facture supprimée avec succès', 'success')
    } catch (error) {
      toast('Erreur lors de la suppression de la facture', 'error')
    }
  }

  async function handleMarkPaid(id: string) {
    try {
      if (isCloud) { await sb.update('invoices', id, { status: 'paid', paid: invoices?.find(i => i.id === id)?.total || 0 }) } else { await db.invoices.update(id, { status: 'paid', paid: invoices?.find(i => i.id === id)?.total || 0 }) }
      toast('Facture marquée comme payée', 'success')
    } catch (error) {
      toast('Erreur lors du marquage de la facture', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Factures</h1>
          <p className="text-surface-500 text-sm mt-1">{invoices?.length || 0} factures</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouvelle facture</Button>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" placeholder="Rechercher par n° ou client..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="space-y-3">
        {paginatedItems?.map((inv) => (
          <Card key={inv.id} padding="sm" className="hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-surface-900">{inv.number}</p>
                  <p className="text-xs text-surface-400">{inv.partyName} · {formatDate(inv.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="font-semibold text-surface-900">{formatCurrency(inv.total)}</p>
                  <div className="flex gap-1 mt-0.5">
                    <Badge variant={statusColors[inv.status]}>{inv.status}</Badge>
                    <Badge variant={typeColors[inv.type] as 'success' | 'info' | 'warning' | 'danger'}>{typeLabels[inv.type]}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { if (inv.partyId) { const p = [...(customers || []), ...(suppliers || [])].find(x => x.id === inv.partyId); if (p) openWhatsApp(p.phone, `Bonjour, veuillez trouver ci-joint la facture ${inv.number} d'un montant de ${formatCurrency(inv.total)}.`) } }} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Envoyer via WhatsApp">
                    <Send className="w-4 h-4" />
                  </button>
                  <button onClick={() => exportInvoicePDF(inv)} className="p-1.5 rounded-lg hover:bg-violet-50 text-surface-400 hover:text-violet-600" title="Télécharger PDF">
                    <Download className="w-4 h-4" />
                  </button>
                  {inv.status !== 'paid' && (
                    <button onClick={() => handleMarkPaid(inv.id)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Marquer payée">
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                    {expandedId === inv.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(inv)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(inv.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            {expandedId === inv.id && (
              <div className="px-4 pb-4 border-t border-surface-100 pt-3 animate-fade-in">
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
                    {inv.items.map((item, idx) => (
                      <tr key={idx} className="border-t border-surface-50">
                        <td className="py-2 text-surface-900">{item.productName}</td>
                        <td className="py-2 text-right text-surface-600">{item.quantity}</td>
                        <td className="py-2 text-right text-surface-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(item.unitPrice * item.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-surface-200">
                      <td colSpan={3} className="pt-2 text-right text-surface-500">Sous-total</td>
                      <td className="pt-2 text-right text-surface-900">{formatCurrency(inv.subtotal)}</td>
                    </tr>
                    {inv.taxTotal > 0 && (
                      <tr>
                        <td colSpan={3} className="text-right text-surface-500">TVA</td>
                        <td className="text-right text-surface-900">{formatCurrency(inv.taxTotal)}</td>
                      </tr>
                    )}
                    <tr>
                      <td colSpan={3} className="text-right font-semibold text-surface-900">Total</td>
                      <td className="text-right font-bold text-surface-900">{formatCurrency(inv.total)}</td>
                    </tr>
                    {inv.dueDate && (
                      <tr>
                        <td colSpan={4} className="pt-1 text-xs text-surface-400">Échéance : {formatDate(inv.dueDate)}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        ))}
        {(!filtered || filtered.length === 0) && (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-400">Aucune facture trouvée</p>
          </div>
        )}
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier facture' : 'Nouvelle facture'} size="xl">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              value={type}
              onChange={(e) => { setType(e.target.value as typeof type); setPartyId(''); setPartyName('') }}
              options={[
                { value: 'sale', label: 'Facture de vente' },
                { value: 'purchase', label: "Facture d'achat" },
                { value: 'credit_note', label: 'Avoir' },
                { value: 'debit_note', label: 'Note de débit' },
              ]}
            />
            <Select
              label="Statut"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              options={[
                { value: 'draft', label: 'Brouillon' },
                { value: 'sent', label: 'Envoyée' },
                { value: 'paid', label: 'Payée' },
                { value: 'overdue', label: 'En retard' },
                { value: 'cancelled', label: 'Annulée' },
              ]}
            />
          </div>

          <Select
            label={type === 'purchase' ? 'Fournisseur' : 'Client'}
            value={partyId}
            onChange={(e) => {
              const p = parties.find(pa => pa.id === e.target.value)
              setPartyId(e.target.value)
              setPartyName(p?.name || '')
            }}
            options={parties.map(p => ({ value: p.id, label: p.name }))}
            placeholder="Sélectionner..."
          />

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Articles</label>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.productId} className="flex items-center gap-2 p-2 bg-surface-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{item.productName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateItem(item.productId, 'quantity', Math.max(1, item.quantity - 1))} className="p-1 rounded-md hover:bg-surface-200 text-surface-500"><ChevronDown className="w-3 h-3" /></button>
                    <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateItem(item.productId, 'quantity', item.quantity + 1)} className="p-1 rounded-md hover:bg-surface-200 text-surface-500"><ChevronUp className="w-3 h-3" /></button>
                  </div>
                  <input type="number" value={item.unitPrice} onChange={(e) => updateItem(item.productId, 'unitPrice', Number(e.target.value))} className="w-20 text-sm px-2 py-1 rounded-lg border border-surface-200 text-right" />
                  <p className="text-sm font-semibold text-surface-900 w-20 text-right">{formatCurrency(item.unitPrice * item.quantity)}</p>
                  <button onClick={() => removeItem(item.productId)} className="p-1 rounded-md hover:bg-red-50 text-surface-400 hover:text-danger"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <Select
              value=""
              onChange={(e) => { if (e.target.value) { addItem(e.target.value); e.target.value = '' } }}
              options={(products || []).filter(p => !items.find(i => i.productId === p.id)).map(p => ({ value: p.id, label: `${p.name} - ${formatCurrency(p.sellingPrice)}` }))}
              placeholder="+ Ajouter un article"
            />
          </div>

          <div className="bg-surface-50 rounded-xl p-4 space-y-1 text-sm">
            <div className="flex justify-between text-surface-500"><span>Sous-total</span><span>{formatCurrency(totals.subtotal)}</span></div>
            {totals.taxTotal > 0 && <div className="flex justify-between text-surface-500"><span>TVA</span><span>{formatCurrency(totals.taxTotal)}</span></div>}
            <div className="flex justify-between font-bold text-surface-900 pt-1 border-t border-surface-200"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Montant payé" type="number" value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
            <Input label="Date d'échéance" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={items.length === 0}>{editing ? 'Mettre à jour' : 'Créer la facture'}</Button>
        </div>
      </Modal>
    </div>
  )
}
