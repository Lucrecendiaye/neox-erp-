import { useState } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, Plus, Edit2, Trash2, Kanban, LayoutList, Phone, Mail, Building2, DollarSign, Users } from 'lucide-react'
import type { Lead } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const statusConfig: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info'; badgeClass?: string }> = {
  new: { label: 'Nouveau', variant: 'info' },
  contacted: { label: 'Contacté', variant: 'warning' },
  qualified: { label: 'Qualifié', variant: 'default' },
  proposal: { label: 'Proposition', variant: 'info', badgeClass: 'bg-purple-100 text-purple-700' },
  won: { label: 'Gagné', variant: 'success' },
  lost: { label: 'Perdu', variant: 'danger' },
}

const statusColors: Record<string, string> = {
  new: '#3b82f6',
  contacted: '#f59e0b',
  qualified: '#64748b',
  proposal: '#8b5cf6',
  won: '#10b981',
  lost: '#ef4444',
}

const statuses: Lead['status'][] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']

const sourceOptions = [
  { value: 'Website', label: 'Website' },
  { value: 'Référence', label: 'Référence' },
  { value: 'Réseaux sociaux', label: 'Réseaux sociaux' },
  { value: 'Appel entrant', label: 'Appel entrant' },
  { value: 'Autre', label: 'Autre' },
]

export default function LeadsPage() {
  const isCloud = isSupabaseConfigured()
  const dexieLeads = useLiveQuery(() => db.leads.toArray(), [])
  const { data: supabaseLeads } = useSupabaseQuery<Lead>('leads', undefined, [])
  const leads = isCloud ? supabaseLeads : dexieLeads
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', company: '',
    source: 'Website', status: 'new' as Lead['status'],
    expectedValue: 0, notes: '',
  })

  const filtered = leads?.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.phone.includes(search) ||
    (l.company && l.company.toLowerCase().includes(search.toLowerCase()))
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  function openCreate() {
    setEditing(null)
    setForm({ name: '', phone: '', email: '', company: '', source: 'Website', status: 'new', expectedValue: 0, notes: '' })
    setModalOpen(true)
  }

  function openEdit(lead: Lead) {
    setEditing(lead)
    setForm({
      name: lead.name, phone: lead.phone, email: lead.email || '',
      company: lead.company || '', source: lead.source,
      status: lead.status, expectedValue: lead.expectedValue, notes: lead.notes || '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      if (editing) {
        if (isCloud) { await sb.update('leads', editing.id, { ...form, updatedAt: now }) } else { await db.leads.update(editing.id, { ...form, updatedAt: now }) }
        toast('Lead mis à jour avec succès', 'success')
      } else {
        if (isCloud) { await sb.insert('leads', { id: generateId(), businessId: 'biz-default', ...form, createdAt: now, updatedAt: now }) } else { await db.leads.add({ id: generateId(), businessId: 'biz-default', ...form, createdAt: now, updatedAt: now }) }
        toast('Lead créé avec succès', 'success')
      }
      setModalOpen(false)
    } catch {
      toast("Erreur lors de l'enregistrement", 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer ce lead ?')) return
    try {
      if (isCloud) { await sb.remove('leads', id) } else { await db.leads.delete(id) }
      toast('Lead supprimé avec succès', 'success')
    } catch {
      toast('Erreur lors de la suppression', 'error')
    }
  }

  async function changeStatus(lead: Lead, newStatus: Lead['status']) {
    try {
      if (isCloud) { await sb.update('leads', lead.id, { status: newStatus, updatedAt: new Date().toISOString() }) } else { await db.leads.update(lead.id, { status: newStatus, updatedAt: new Date().toISOString() }) }
      toast('Statut mis à jour', 'success')
    } catch {
      toast('Erreur lors du changement de statut', 'error')
    }
  }

  const columns = statuses.map(status => ({
    key: status,
    ...statusConfig[status],
    leads: filtered?.filter(l => l.status === status) || [],
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Leads</h1>
          <p className="text-surface-500 text-sm mt-1">{leads?.length || 0} leads</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-surface-200 overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`p-2 transition-colors ${view === 'kanban' ? 'bg-primary-600 text-white' : 'bg-white text-surface-500 hover:bg-surface-50'}`}
            >
              <Kanban className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('table')}
              className={`p-2 transition-colors ${view === 'table' ? 'bg-primary-600 text-white' : 'bg-white text-surface-500 hover:bg-surface-50'}`}
            >
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouveau lead</Button>
        </div>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" placeholder="Rechercher par nom, téléphone ou entreprise..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {view === 'kanban' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(col => (
            <div key={col.key} className="flex-shrink-0 w-72">
              <div className="flex items-center justify-between mb-3 px-1">
                <Badge variant={col.variant} className={col.badgeClass}>
                  {col.label}
                </Badge>
                <span className="text-xs text-surface-400">{col.leads.length}</span>
              </div>
              <div className="space-y-3">
                {col.leads.map(lead => (
                  <Card key={lead.id} padding="sm" className="group cursor-pointer" onClick={() => openEdit(lead)}>
                    <div className="space-y-2">
                      <p className="font-semibold text-surface-900 text-sm">{lead.name}</p>
                      <div className="space-y-1 text-xs text-surface-500">
                        <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {lead.phone}</div>
                        {lead.company && <div className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {lead.company}</div>}
                        <div className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {formatCurrency(lead.expectedValue)}</div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-surface-100">
                        <div className="flex gap-1">
                          {statuses.map(s => (
                            <button
                              key={s}
                              onClick={(e) => { e.stopPropagation(); changeStatus(lead, s) }}
                              className={`w-2.5 h-2.5 rounded-full transition-all ${s === lead.status ? 'ring-2 ring-offset-1 ring-surface-300' : 'opacity-30 hover:opacity-70'}`}
                              style={{ backgroundColor: statusColors[s] }}
                              title={statusConfig[s].label}
                            />
                          ))}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(lead.id) }}
                          className="p-1 rounded-md hover:bg-red-50 text-surface-400 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
                {col.leads.length === 0 && (
                  <div className="text-center py-8 text-surface-300 text-sm border-2 border-dashed border-surface-200 rounded-2xl">
                    Aucun lead
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500">Nom</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500">Téléphone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500">Entreprise</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500">Statut</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-surface-500">Valeur</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-surface-500">Créé le</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-surface-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems?.map(lead => (
                  <tr key={lead.id} className="border-b border-surface-100 hover:bg-surface-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-surface-900">{lead.name}</td>
                    <td className="px-4 py-3 text-surface-600">{lead.phone}</td>
                    <td className="px-4 py-3 text-surface-600">{lead.company || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600">
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusConfig[lead.status].variant} className={statusConfig[lead.status].badgeClass}>
                        {statusConfig[lead.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-surface-900">{formatCurrency(lead.expectedValue)}</td>
                    <td className="px-4 py-3 text-surface-500 text-xs">{formatDate(lead.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(lead)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(lead.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered && filtered.length > 0 && (
            <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
          )}
          {(!filtered || filtered.length === 0) && (
            <div className="text-center py-12 text-surface-400">
              <Users className="w-12 h-12 mx-auto mb-3" />
              <p className="text-sm">Aucun lead trouvé</p>
            </div>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le lead' : 'Nouveau lead'} size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} icon={<Phone className="w-4 h-4" />} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} icon={<Mail className="w-4 h-4" />} />
            <Input label="Entreprise" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} icon={<Building2 className="w-4 h-4" />} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              options={sourceOptions}
            />
            <Select
              label="Statut"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Lead['status'] })}
              options={statuses.map(s => ({ value: s, label: statusConfig[s].label }))}
            />
          </div>
          <Input label="Valeur attendue" type="number" value={form.expectedValue} onChange={(e) => setForm({ ...form, expectedValue: +e.target.value })} icon={<DollarSign className="w-4 h-4" />} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>{editing ? 'Mettre à jour' : 'Créer'}</Button>
        </div>
      </Modal>
    </div>
  )
}
