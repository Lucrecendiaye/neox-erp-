import { useState } from 'react'
import { Card, Button, Input, Modal, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { usePagination } from '@/hooks/usePagination'
import { isSupabaseConfigured } from '@/lib/supabase'
import db from '@/db'
import { generateId, openWhatsApp } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, Plus, Edit2, Trash2, Truck, Phone, Mail, MapPin, MessageSquare } from 'lucide-react'
import type { Supplier } from '@/types'

export default function SuppliersPage() {
  const isCloud = isSupabaseConfigured()
  const dexieSuppliers = useLiveQuery(() => db.suppliers.toArray(), [])
  const { data: supabaseSuppliers } = useSupabaseQuery<Supplier>('suppliers', undefined, [])

  const suppliers = isCloud ? supabaseSuppliers : dexieSuppliers

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })

  const filtered = suppliers?.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) || s.phone.includes(search)
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  function openCreate() {
    setEditing(null)
    setForm({ name: '', phone: '', email: '', address: '', notes: '' })
    setModalOpen(true)
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier)
    setForm({
      name: supplier.name, phone: supplier.phone, email: supplier.email || '',
      address: supplier.address || '', notes: supplier.notes || '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      if (editing) {
        if (isCloud) {
          await sb.update('suppliers', editing.id, { ...form, updatedAt: now })
        } else {
          await db.suppliers.update(editing.id, { ...form, updatedAt: now })
        }
        toast('Fournisseur mis à jour avec succès', 'success')
      } else {
        const record = { id: generateId(), businessId: 'biz-default', ...form, createdAt: now, updatedAt: now }
        if (isCloud) {
          await sb.insert('suppliers', record)
        } else {
          await db.suppliers.add(record)
        }
        toast('Fournisseur créé avec succès', 'success')
      }
      setModalOpen(false)
    } catch {
      toast('Erreur lors de la sauvegarde du fournisseur', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer ce fournisseur ?')) return
    try {
      if (isCloud) {
        await sb.remove('suppliers', id)
      } else {
        await db.suppliers.delete(id)
      }
      toast('Fournisseur supprimé avec succès', 'success')
    } catch {
      toast('Erreur lors de la suppression du fournisseur', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Fournisseurs</h1>
          <p className="text-surface-500 text-sm mt-1">{suppliers?.length || 0} fournisseurs</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouveau fournisseur</Button>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" placeholder="Rechercher..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedItems?.map((s) => (
          <Card key={s.id} className="relative group">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                <Truck className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-surface-900">{s.name}</p>
                <div className="mt-2 space-y-1 text-xs text-surface-500">
                  <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.phone}</div>
                  {s.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {s.email}</div>}
                  {s.address && <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.address}</div>}
                </div>
              </div>
            </div>
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => openWhatsApp(s.phone)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600">
                <MessageSquare className="w-4 h-4" />
              </button>
              <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {filtered && filtered.length > 0 && (
        <div className="flex justify-center pt-4">
          <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier' : 'Nouveau fournisseur'}>
        <div className="p-6 space-y-4">
          <Input label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} icon={<Phone className="w-4 h-4" />} />
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button variant="outline" className="w-full" onClick={() => alert('Import depuis contacts (Capacitor)')}>
            <Plus className="w-4 h-4" /> Importer depuis les contacts
          </Button>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>{editing ? 'Mettre à jour' : 'Créer'}</Button>
        </div>
      </Modal>
    </div>
  )
}
