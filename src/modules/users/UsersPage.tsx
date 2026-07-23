import { useState } from 'react'
import { Card, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Users, Shield } from 'lucide-react'
import type { User } from '@/types'

const roles: { value: User['role']; label: string }[] = [
  { value: 'admin', label: 'Administrateur' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Personnel' },
  { value: 'viewer', label: 'Observateur' },
]

const roleBadge: Record<User['role'], 'danger' | 'warning' | 'info' | 'default'> = {
  admin: 'danger',
  manager: 'warning',
  staff: 'info',
  viewer: 'default',
}

export default function UsersPage() {
  const users = useLiveQuery(() => db.users.toArray(), [])
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', role: 'staff' as User['role'], isActive: true,
  })

  const filtered = users?.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  function openCreate() {
    setEditing(null)
    setForm({ name: '', email: '', phone: '', role: 'staff', isActive: true })
    setModalOpen(true)
  }

  function openEdit(user: User) {
    setEditing(user)
    setForm({ name: user.name, email: user.email, phone: user.phone || '', role: user.role, isActive: user.isActive })
    setModalOpen(true)
  }

  async function handleSave() {
    try {
      if (editing) {
        await db.users.update(editing.id, form)
        toast('Utilisateur mis à jour', 'success')
      } else {
        const hash = await (await import('@/lib/auth')).hashPassword('default123')
        await db.users.add({
          id: generateId(),
          businessId: 'biz-default',
          ...form,
          passwordHash: hash,
          permissions: [],
          createdAt: new Date().toISOString(),
        })
        toast('Utilisateur créé', 'success')
      }
      setModalOpen(false)
    } catch {
      toast("Erreur lors de l'enregistrement", 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cet utilisateur ?')) return
    await db.users.delete(id)
    toast('Utilisateur supprimé', 'success')
  }

  async function toggleActive(user: User) {
    await db.users.update(user.id, { isActive: !user.isActive })
    toast(user.isActive ? 'Utilisateur désactivé' : 'Utilisateur activé', 'success')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Utilisateurs</h1>
          <p className="text-surface-500 text-sm mt-1">{users?.length || 0} utilisateurs</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouvel utilisateur</Button>
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text" placeholder="Rechercher un utilisateur..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Nom</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Email</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Rôle</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Statut</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Dernière connexion</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems?.map((u) => (
                <tr key={u.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 font-bold text-sm">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-900">{u.name}</p>
                        {u.phone && <p className="text-xs text-surface-400">{u.phone}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-surface-600">{u.email}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <Badge variant={roleBadge[u.role]}>
                        <Shield className="w-3 h-3 mr-1" />
                        {roles.find(r => r.value === u.role)?.label}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center">
                      <Badge variant={u.isActive ? 'success' : 'default'}>
                        {u.isActive ? 'Actif' : 'Inactif'}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-surface-500">
                    {u.lastLogin ? formatDate(u.lastLogin) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => toggleActive(u)}
                        className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors"
                        title={u.isActive ? 'Désactiver' : 'Activer'}
                      >
                        {u.isActive ? <ToggleRight className="w-4 h-4 text-success" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => openEdit(u)} className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(u.id)} className="p-2 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-surface-400 text-sm">
                    <Users className="w-12 h-12 mx-auto mb-3" />
                    Aucun utilisateur trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'} size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Select
              label="Rôle"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}
              options={roles}
              placeholder="Sélectionner un rôle..."
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-5 h-5 rounded-lg border-surface-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-surface-700">Compte actif</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>{editing ? 'Mettre à jour' : 'Créer'}</Button>
        </div>
      </Modal>
    </div>
  )
}
