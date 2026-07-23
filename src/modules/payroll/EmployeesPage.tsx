import { useState } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate } from '@/lib/utils'
import type { Employee, PaymentMethod } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Users, Plus, Edit2, Trash2, Search } from 'lucide-react'
import { toast } from '@/lib/toast'

const statusVariant: Record<string, 'success' | 'warning' | 'danger'> = {
  active: 'success',
  inactive: 'warning',
  terminated: 'danger',
}

const salaryTypeLabels: Record<string, string> = {
  monthly: 'Mensuel',
  daily: 'Journalier',
  hourly: 'Horaire',
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mobile: 'Mobile Money',
  credit: 'Crédit',
  bank: 'Banque',
}

export default function EmployeesPage() {
  const isCloud = isSupabaseConfigured()
  const dexieEmployees = useLiveQuery(() => db.employees.toArray(), [])
  const { data: supabaseEmployees } = useSupabaseQuery<Employee>('employees', undefined, [])
  const employees = isCloud ? supabaseEmployees : dexieEmployees
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState({
    name: '', phone: '', email: '', position: '', department: '',
    salary: 0, salaryType: 'monthly', paymentMethod: 'cash' as PaymentMethod,
    bankAccount: '', address: '', hireDate: new Date().toISOString().split('T')[0],
  })

  const filtered = employees?.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.position.toLowerCase().includes(search.toLowerCase()) ||
    e.department.toLowerCase().includes(search.toLowerCase()) ||
    e.phone.includes(search)
  )

  const { paginatedItems, ...pag } = usePagination(filtered)

  function openCreate() {
    setEditing(null)
    setForm({
      name: '', phone: '', email: '', position: '', department: '',
      salary: 0, salaryType: 'monthly', paymentMethod: 'cash',
      bankAccount: '', address: '', hireDate: new Date().toISOString().split('T')[0],
    })
    setModalOpen(true)
  }

  function openEdit(employee: Employee) {
    setEditing(employee)
    setForm({
      name: employee.name,
      phone: employee.phone,
      email: employee.email || '',
      position: employee.position,
      department: employee.department,
      salary: employee.salary,
      salaryType: employee.salaryType,
      paymentMethod: employee.paymentMethod,
      bankAccount: employee.bankAccount || '',
      address: employee.address || '',
      hireDate: employee.hireDate.split('T')[0],
    })
    setModalOpen(true)
  }

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      if (editing) {
        if (isCloud) { await sb.update('employees', editing.id, { ...form, businessId: 'biz-default', salaryType: form.salaryType as 'monthly' | 'daily' | 'hourly', email: form.email || undefined, bankAccount: form.bankAccount || undefined, address: form.address || undefined, updatedAt: now }) } else { await db.employees.update(editing.id, { ...form, businessId: 'biz-default', salaryType: form.salaryType as 'monthly' | 'daily' | 'hourly', email: form.email || undefined, bankAccount: form.bankAccount || undefined, address: form.address || undefined, updatedAt: now }) }
        toast('Employé mis à jour', 'success')
      } else {
        if (isCloud) { await sb.insert('employees', { id: generateId(), businessId: 'biz-default', ...form, salaryType: form.salaryType as 'monthly' | 'daily' | 'hourly', email: form.email || undefined, bankAccount: form.bankAccount || undefined, address: form.address || undefined, photo: undefined, documents: [], status: 'active', createdAt: now, updatedAt: now }) } else { await db.employees.add({ id: generateId(), businessId: 'biz-default', ...form, salaryType: form.salaryType as 'monthly' | 'daily' | 'hourly', email: form.email || undefined, bankAccount: form.bankAccount || undefined, address: form.address || undefined, photo: undefined, documents: [], status: 'active', createdAt: now, updatedAt: now }) }
        toast('Employé créé', 'success')
      }
      setModalOpen(false)
    } catch { toast("Erreur lors de l'enregistrement", 'error') }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cet employé ?')) return
    if (isCloud) { await sb.remove('employees', id) } else { await db.employees.delete(id) }
    toast('Employé supprimé', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Employés</h1>
        <p className="text-surface-500 text-sm mt-1">Gérez votre personnel</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text" placeholder="Rechercher un employé..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Nouvel employé
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Employé</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Poste</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Département</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Salaire</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Statut</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems?.map((e) => (
                <tr key={e.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 overflow-hidden">
                        {e.photo ? <img src={e.photo} alt="" className="w-full h-full object-cover" /> : <Users className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-900">{e.name}</p>
                        <p className="text-xs text-surface-400">{e.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-surface-600">{e.position}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-surface-600">{e.department}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-medium text-surface-900">{formatCurrency(e.salary)}</p>
                    <p className="text-xs text-surface-400">{salaryTypeLabels[e.salaryType]}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant={statusVariant[e.status] || 'default'}>
                      {e.status === 'active' ? 'Actif' : e.status === 'inactive' ? 'Inactif' : 'Terminé'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(e)} className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="p-2 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-surface-400 text-sm">
                    Aucun employé trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Modifier l'employé" : 'Nouvel employé'} size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Poste" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            <Input label="Département" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <Input label="Date d'embauche" type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
            <Select
              label="Type de salaire"
              value={form.salaryType}
              onChange={(e) => setForm({ ...form, salaryType: e.target.value as 'monthly' | 'daily' | 'hourly' })}
              options={[
                { value: 'monthly', label: 'Mensuel' },
                { value: 'daily', label: 'Journalier' },
                { value: 'hourly', label: 'Horaire' },
              ]}
            />
            <Input label="Salaire" type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: +e.target.value })} />
            <Select
              label="Méthode de paiement"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
              options={Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }))}
            />
            <Input label="Compte bancaire" value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
          </div>
          <Input label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>{editing ? 'Mettre à jour' : 'Créer'}</Button>
        </div>
      </Modal>
    </div>
  )
}
