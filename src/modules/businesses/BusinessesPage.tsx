import { useState } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Modal, Badge } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { generateId, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useAppStore } from '@/stores/appStore'
import { Building2, Plus, Edit2, Trash2, Search, CheckCircle, Globe } from 'lucide-react'
import type { Business } from '@/types'

export default function BusinessesPage() {
  const businesses = useLiveQuery(() => db.businesses.toArray(), [])
  const setCurrentBusiness = useAppStore((s) => s.setCurrentBusiness)
  const currentBusiness = useAppStore((s) => s.currentBusiness)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Business | null>(null)
  const [form, setForm] = useState({
    name: '',
    currency: '',
    currencySymbol: '',
    phone: '',
    email: '',
    address: '',
    taxId: '',
  })

  const filtered = businesses?.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() {
    setEditing(null)
    setForm({ name: '', currency: '', currencySymbol: '', phone: '', email: '', address: '', taxId: '' })
    setModalOpen(true)
  }

  function openEdit(biz: Business) {
    setEditing(biz)
    setForm({
      name: biz.name,
      currency: biz.currency,
      currencySymbol: biz.currencySymbol,
      phone: biz.phone || '',
      email: biz.email || '',
      address: biz.address || '',
      taxId: biz.taxId || '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      if (editing) {
        await db.businesses.update(editing.id, { ...form })
        toast('Entreprise mise à jour avec succès', 'success')
      } else {
        await db.businesses.add({
          id: generateId(),
          ...form,
          isActive: false,
          createdAt: now,
        })
        toast('Entreprise créée avec succès', 'success')
      }
      setModalOpen(false)
    } catch {
      toast("Erreur lors de l'enregistrement de l'entreprise", 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer cette entreprise ?')) return
    try {
      await db.businesses.delete(id)
      if (currentBusiness?.id === id) {
        setCurrentBusiness(null)
      }
      toast('Entreprise supprimée avec succès', 'success')
    } catch {
      toast("Erreur lors de la suppression de l'entreprise", 'error')
    }
  }

  async function handleSwitchActive(biz: Business) {
    if (biz.isActive) return
    try {
      const all = await db.businesses.toArray()
      await Promise.all(
        all.map((b) =>
          db.businesses.update(b.id, { isActive: b.id === biz.id })
        )
      )
      setCurrentBusiness(biz)
      toast(`${biz.name} est maintenant l'entreprise active`, 'success')
    } catch {
      toast('Erreur lors du changement', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Entreprises</h1>
          <p className="text-surface-500 text-sm mt-1">
            {businesses?.length || 0} entreprise{(businesses?.length || 0) > 1 ? 's' : ''} enregistrée{(businesses?.length || 0) > 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Nouvelle entreprise
        </Button>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text"
          placeholder="Rechercher une entreprise..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered?.map((biz) => (
          <Card
            key={biz.id}
            className={`relative group ${biz.isActive ? 'ring-2 ring-primary-500' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 font-bold text-lg">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-surface-900 truncate">{biz.name}</p>
                  {biz.isActive && (
                    <Badge variant="success">
                      <CheckCircle className="w-3 h-3 mr-1" /> Active
                    </Badge>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-surface-500">
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3" /> {biz.currency} ({biz.currencySymbol})
                  </div>
                  {biz.phone && <div className="flex items-center gap-1">{biz.phone}</div>}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {!biz.isActive && (
                    <Button size="sm" variant="outline" onClick={() => handleSwitchActive(biz)}>
                      <CheckCircle className="w-3 h-3" /> Activer
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => openEdit(biz)}
                className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(biz.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
        {(!filtered || filtered.length === 0) && (
          <div className="col-span-full text-center py-12 text-surface-400">
            <Building2 className="w-12 h-12 mx-auto mb-3" />
            <p className="text-sm">Aucune entreprise trouvée</p>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Modifier l'entreprise" : 'Nouvelle entreprise'}
        size="lg"
      >
        <div className="p-6 space-y-4">
          <Input
            label="Nom de l'entreprise"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Devise"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
            <Input
              label="Symbole de la devise"
              value={form.currencySymbol}
              onChange={(e) => setForm({ ...form, currencySymbol: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Téléphone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <Input
            label="Adresse"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Input
            label="N° de contribuable (Tax ID)"
            value={form.taxId}
            onChange={(e) => setForm({ ...form, taxId: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave}>
            {editing ? 'Mettre à jour' : 'Créer'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
