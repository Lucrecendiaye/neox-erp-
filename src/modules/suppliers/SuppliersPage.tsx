import { useState } from 'react'
import { Card, Button, Input, Modal, Pagination } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'

import { usePagination } from '@/hooks/usePagination'

import db from '@/db'
import { generateId, openWhatsApp, pickContact } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { shareViaWeChat } from '@/lib/share'
import PinConfirmModal from '@/components/ui/PinConfirmModal'
import { softDelete } from '@/lib/softDelete'
import { Search, Plus, Edit2, Trash2, Truck, Phone, Mail, MapPin, MessageSquare, MessageCircle, Scale } from 'lucide-react'
import type { Supplier } from '@/types'
import SupplierTabs from './SupplierTabs'

export default function SuppliersPage() {
  const navigate = useNavigate()
  const businessId = useBusinessId()
  const suppliers = useLiveQuery(() => db.suppliers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

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
        await db.suppliers.update(editing.id, { ...form, updatedAt: now })
        toast('Fournisseur mis à jour avec succès', 'success')
      } else {
        const record = { id: generateId(), businessId, ...form, createdAt: now, updatedAt: now }
        await db.suppliers.add(record)
        toast('Fournisseur créé avec succès', 'success')
      }
      setModalOpen(false)
    } catch {
      toast('Erreur lors de la sauvegarde du fournisseur', 'error')
    }
  }

  async function handleDelete(id: string) {
    setDeleteTargetId(id)
    setPinModalOpen(true)
  }

  async function confirmDeleteSupplier() {
    if (!deleteTargetId) return
    try {
      const supplier = suppliers?.find(s => s.id === deleteTargetId)
      if (supplier) await softDelete('suppliers', deleteTargetId, supplier as any, supplier.name)
      await db.suppliers.delete(deleteTargetId)
      toast('Fournisseur supprimé avec succès', 'success')
    } catch {
      toast('Erreur lors de la suppression du fournisseur', 'error')
    }
    setDeleteTargetId(null)
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <SupplierTabs />
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
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedItems?.map((s) => (
          <Card key={s.id} className="relative group cursor-pointer" onClick={() => navigate(`/suppliers/${s.id}`)}>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-amber-500/15 rounded-xl flex items-center justify-center text-amber-400">
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
              <button onClick={(e) => { e.stopPropagation(); navigate(`/suppliers/${s.id}?comp=1`) }} className="p-1.5 rounded-lg hover:bg-primary-50 text-surface-400 hover:text-primary-400" title="Compensation">
                <Scale className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); openWhatsApp(s.phone) }} className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-surface-400 hover:text-emerald-400">
                <MessageSquare className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); shareViaWeChat(`Contact: ${s.name}${s.phone ? ` — ${s.phone}` : ''}`, `Contact ${s.name}`) }} className="p-1.5 rounded-lg hover:bg-emerald-500/15 text-surface-400 hover:text-emerald-400" title="Partager par WeChat">
                <MessageCircle className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); openEdit(s) }} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }} className="p-1.5 rounded-lg hover:bg-red-500/15 text-surface-400 hover:text-danger">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} icon={<Phone className="w-4 h-4" />} />
            <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button variant="outline" className="w-full" onClick={async () => {
            const contact = await pickContact()
            if (contact) { setForm(f => ({ ...f, name: contact.name, phone: contact.tel })); toast('Contact importé', 'success') }
          }}>
            <Plus className="w-4 h-4" /> Importer depuis les contacts
          </Button>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>{editing ? 'Mettre à jour' : 'Créer'}</Button>
        </div>
      </Modal>

      <PinConfirmModal
        open={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setDeleteTargetId(null) }}
        onConfirm={confirmDeleteSupplier}
        title="Suppression fournisseur"
        description="Cette action est protégée. Entrez votre code PIN de sécurité pour continuer."
        actionLabel="Supprimer"
      />
    </div>
  )
}
