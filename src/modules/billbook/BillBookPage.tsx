import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { FileText, Plus, Copy, Trash2, Search, Save, ChevronDown, ChevronUp } from 'lucide-react'
import type { Invoice, SaleItem } from '@/types'

interface InvoiceTemplate {
  id: string
  name: string
  type: Invoice['type']
  items: SaleItem[]
  subtotal: number
  taxTotal: number
  total: number
  dueDate?: string
  createdAt: string
}

const STORAGE_KEY = 'neox_invoice_templates'

function loadTemplates(): InvoiceTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveTemplates(templates: InvoiceTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

export default function BillBookPage() {
  const invoices = useLiveQuery(() => db.invoices.orderBy('createdAt').reverse().toArray(), [])
  const settings = useLiveQuery(() => db.settings.get('default'), [])
  const [search, setSearch] = useState('')
  const [templates, setTemplates] = useState<InvoiceTemplate[]>(loadTemplates)
  const [showTemplates, setShowTemplates] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [templateModal, setTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [newFromTemplate, setNewFromTemplate] = useState<InvoiceTemplate | null>(null)

  const filtered = useMemo(() => {
    if (!search) return invoices || []
    const q = search.toLowerCase()
    return (invoices || []).filter(inv =>
      (inv.number || '').toLowerCase().includes(q) ||
      (inv.partyName || '').toLowerCase().includes(q)
    )
  }, [invoices, search])

  const { paginatedItems, ...pag } = usePagination(filtered, 10)

  const filteredTemplates = useMemo(() => {
    if (!search) return templates
    return templates.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
  }, [templates, search])

  function openSaveTemplate(invoice: Invoice) {
    setSelectedInvoice(invoice)
    setTemplateName(`Modèle ${invoice.number}`)
    setTemplateModal(true)
  }

  function handleSaveTemplate() {
    if (!selectedInvoice || !templateName.trim()) return
    const template: InvoiceTemplate = {
      id: generateId(),
      name: templateName.trim(),
      type: selectedInvoice.type,
      items: selectedInvoice.items.map(i => ({ ...i })),
      subtotal: selectedInvoice.subtotal,
      taxTotal: selectedInvoice.taxTotal,
      total: selectedInvoice.total,
      dueDate: selectedInvoice.dueDate,
      createdAt: new Date().toISOString(),
    }
    const updated = [...templates, template]
    setTemplates(updated)
    saveTemplates(updated)
    toast('Modèle enregistré avec succès', 'success')
    setTemplateModal(false)
    setSelectedInvoice(null)
    setTemplateName('')
  }

  function handleDeleteTemplate(id: string) {
    if (!confirm('Supprimer ce modèle ?')) return
    const updated = templates.filter(t => t.id !== id)
    setTemplates(updated)
    saveTemplates(updated)
    toast('Modèle supprimé', 'success')
  }

  function handleNewFromTemplate(template: InvoiceTemplate) {
    setNewFromTemplate(template)
  }

  async function handleCreateFromTemplate() {
    if (!newFromTemplate || !settings) return
    const now = new Date().toISOString()
    const nextNum = settings.invoiceNextNumber || 1
    const prefix = settings.invoicePrefix || 'INV-'
    const invoice: Invoice = {
      id: generateId(),
      businessId: 'biz-default',
      type: newFromTemplate.type,
      number: `${prefix}${String(nextNum).padStart(5, '0')}`,
      items: newFromTemplate.items.map(i => ({ ...i })),
      subtotal: newFromTemplate.subtotal,
      taxTotal: newFromTemplate.taxTotal,
      total: newFromTemplate.total,
      paid: 0,
      dueDate: newFromTemplate.dueDate,
      status: 'draft',
      createdAt: now,
      userId: 'admin',
    }
    try {
      await db.invoices.add(invoice)
      await db.settings.update('default', { invoiceNextNumber: nextNum + 1 })
      toast(`Facture ${invoice.number} créée depuis le modèle`, 'success')
      setNewFromTemplate(null)
    } catch {
      toast('Erreur lors de la création de la facture', 'error')
    }
  }

  const statusColors = {
    draft: 'default' as const,
    sent: 'info' as const,
    paid: 'success' as const,
    overdue: 'danger' as const,
    cancelled: 'warning' as const,
  }

  const typeLabels = {
    sale: 'Vente',
    purchase: 'Achat',
    credit_note: 'Avoir',
    debit_note: 'Débit',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Registre des factures</h1>
          <p className="text-surface-500 text-sm mt-1">{invoices?.length || 0} factures · {templates.length} modèles</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowTemplates(!showTemplates)}>
            <Save className="w-4 h-4" /> {showTemplates ? 'Factures' : 'Modèles'}
          </Button>
        </div>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" placeholder="Rechercher par n° ou client..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {showTemplates ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-surface-900">Modèles enregistrés</h2>
          {filteredTemplates.length === 0 && (
            <div className="text-center py-16">
              <Save className="w-12 h-12 text-surface-300 mx-auto mb-3" />
              <p className="text-surface-400">Aucun modèle enregistré</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                        <Copy className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-surface-900">{template.name}</p>
                        <p className="text-xs text-surface-400">{typeLabels[template.type]} · {template.items.length} article(s)</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-surface-100">
                    <span className="text-sm font-semibold text-surface-900">{formatCurrency(template.total)}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleNewFromTemplate(template)}
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-surface-400 hover:text-primary-600"
                        title="Créer une facture depuis ce modèle"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger"
                        title="Supprimer le modèle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedItems.map((inv) => (
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
                    <Badge variant={statusColors[inv.status]}>{inv.status === 'draft' ? 'Brouillon' : inv.status === 'sent' ? 'Envoyée' : inv.status === 'paid' ? 'Payée' : inv.status === 'overdue' ? 'En retard' : 'Annulée'}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openSaveTemplate(inv)}
                      className="p-1.5 rounded-lg hover:bg-amber-50 text-surface-400 hover:text-amber-600"
                      title="Enregistrer comme modèle"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                      className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400"
                    >
                      {expandedId === inv.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
      )}

      <Modal open={templateModal} onClose={() => setTemplateModal(false)} title="Enregistrer comme modèle">
        <div className="p-6 space-y-4">
          <Input
            label="Nom du modèle"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Ex: Facture mensuelle"
          />
          {selectedInvoice && (
            <div className="bg-surface-50 rounded-xl p-4 text-sm space-y-1">
              <div className="flex justify-between text-surface-500">
                <span>Facture source</span>
                <span className="font-medium text-surface-900">{selectedInvoice.number}</span>
              </div>
              <div className="flex justify-between text-surface-500">
                <span>Montant</span>
                <span className="font-medium text-surface-900">{formatCurrency(selectedInvoice.total)}</span>
              </div>
              <div className="flex justify-between text-surface-500">
                <span>Articles</span>
                <span className="font-medium text-surface-900">{selectedInvoice.items.length}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setTemplateModal(false)}>Annuler</Button>
          <Button onClick={handleSaveTemplate} disabled={!templateName.trim()}>Enregistrer</Button>
        </div>
      </Modal>

      <Modal open={!!newFromTemplate} onClose={() => setNewFromTemplate(null)} title="Créer une facture depuis le modèle" size="lg">
        <div className="p-6 space-y-4">
          {newFromTemplate && (
            <>
              <div className="bg-amber-50 rounded-xl p-4 text-sm flex items-center gap-3">
                <Copy className="w-5 h-5 text-amber-600" />
                <span>Nouvelle facture basée sur <strong>{newFromTemplate.name}</strong></span>
              </div>
              <div className="bg-surface-50 rounded-xl p-4 space-y-1 text-sm">
                <div className="flex justify-between text-surface-500">
                  <span>Type</span>
                  <span className="font-medium text-surface-900">{typeLabels[newFromTemplate.type]}</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Articles</span>
                  <span className="font-medium text-surface-900">{newFromTemplate.items.length}</span>
                </div>
                <div className="flex justify-between text-surface-500">
                  <span>Sous-total</span>
                  <span className="font-medium text-surface-900">{formatCurrency(newFromTemplate.subtotal)}</span>
                </div>
                {newFromTemplate.taxTotal > 0 && (
                  <div className="flex justify-between text-surface-500">
                    <span>TVA</span>
                    <span className="font-medium text-surface-900">{formatCurrency(newFromTemplate.taxTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-surface-900 pt-1 border-t border-surface-200">
                  <span>Total</span>
                  <span>{formatCurrency(newFromTemplate.total)}</span>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setNewFromTemplate(null)}>Annuler</Button>
          <Button onClick={handleCreateFromTemplate}>Créer la facture</Button>
        </div>
      </Modal>
    </div>
  )
}
