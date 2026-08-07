import { useState } from 'react'
import { Card, Button, Input, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'

import { usePagination } from '@/hooks/usePagination'

import db from '@/db'
import { generateId, formatCurrency, openWhatsApp, pickContact } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { shareViaWeChat } from '@/lib/share'
import PinConfirmModal from '@/components/ui/PinConfirmModal'
import { softDelete } from '@/lib/softDelete'
import { Search, Plus, Edit2, Trash2, Users, Phone, Mail, MapPin, CreditCard, MessageSquare, MessageCircle } from 'lucide-react'
import type { Customer } from '@/types'

export default function CustomersPage() {
  const businessId = useBusinessId()
  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const credits = useLiveQuery(() => db.credits.where('businessId').equals(businessId).toArray(), [businessId]) ?? []

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', creditLimit: 0, notes: '' })
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const filtered = customers?.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  function openCreate() {
    setEditing(null)
    setForm({ name: '', phone: '', email: '', address: '', creditLimit: 0, notes: '' })
    setModalOpen(true)
  }

  function openEdit(customer: Customer) {
    setEditing(customer)
    setForm({
      name: customer.name, phone: customer.phone, email: customer.email || '',
      address: customer.address || '', creditLimit: customer.creditLimit, notes: customer.notes || '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      if (editing) {
        await db.customers.update(editing.id, { ...form, updatedAt: now })
        toast('Client mis à jour avec succès', 'success')
      } else {
        const record = {
          id: generateId(),
          businessId,
          ...form,
          currentBalance: 0,
          createdAt: now, updatedAt: now,
        }
        await db.customers.add(record)
        toast('Client créé avec succès', 'success')
      }
      setModalOpen(false)
    } catch {
      toast('Erreur lors de la sauvegarde du client', 'error')
    }
  }

  async function handleDelete(id: string) {
    setDeleteTargetId(id)
    setPinModalOpen(true)
  }

  async function confirmDeleteCustomer() {
    if (!deleteTargetId) return
    try {
      const customer = customers?.find(c => c.id === deleteTargetId)
      if (customer) await softDelete('customers', deleteTargetId, customer as any, customer.name)
      await db.customers.delete(deleteTargetId)
      toast('Client supprimé avec succès', 'success')
    } catch {
      toast('Erreur lors de la suppression du client', 'error')
    }
    setDeleteTargetId(null)
  }

  function handleWhatsApp(phone: string) {
    openWhatsApp(phone)
  }

  function getCustomerBalance(customerId: string): number {
    return credits?.filter((c: any) => c.customerId === customerId).reduce((s: number, x: any) => s + x.balance, 0) || 0
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Clients</h1>
          <p className="text-surface-500 text-sm mt-1">{customers?.length || 0} clients enregistrés</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouveau client</Button>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" placeholder="Rechercher un client..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedItems?.map((c) => (
          <Card key={c.id} className="relative group">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 font-bold text-lg">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-surface-900">{c.name}</p>
                <div className="mt-2 space-y-1 text-xs text-surface-500">
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {c.phone}
                  </div>
                  {c.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {c.email}
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {c.address}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant={getCustomerBalance(c.id) > 0 ? 'warning' : 'success'}>
                    <CreditCard className="w-3 h-3 mr-1" />
                    {formatCurrency(getCustomerBalance(c.id))}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleWhatsApp(c.phone)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600">
                <MessageSquare className="w-4 h-4" />
              </button>
              <button onClick={() => shareViaWeChat(`Contact: ${c.name}${c.phone ? ` — ${c.phone}` : ''}`, `Contact ${c.name}`)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-emerald-600" title="Partager par WeChat">
                <MessageCircle className="w-4 h-4" />
              </button>
              <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
        {filtered && filtered.length > 0 && (
          <div className="col-span-full flex justify-center pt-4">
            <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
          </div>
        )}
        {(!filtered || filtered.length === 0) && (
          <div className="col-span-full text-center py-12 text-surface-400">
            <Users className="w-12 h-12 mx-auto mb-3" />
            <p className="text-sm">Aucun client trouvé</p>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le client' : 'Nouveau client'} size="md">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom du client" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} icon={<Phone className="w-4 h-4" />} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Limite de crédit" type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: +e.target.value })} />
          </div>
          <Input label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
<Button variant="outline" className="w-full" onClick={async () => {
                      const contact = await pickContact()
                      if (contact) { setForm(f => ({ ...f, name: contact.name, phone: contact.tel })); toast('Contact importé', 'success') }
                    }}>
                      <Users className="w-4 h-4" /> Importer depuis les contacts
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
        onConfirm={confirmDeleteCustomer}
        title="Suppression client"
        description="Cette action est protégée. Entrez votre code PIN de sécurité pour continuer."
        actionLabel="Supprimer"
      />
    </div>
  )
}
