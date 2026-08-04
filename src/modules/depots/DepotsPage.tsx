import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Input, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import PinConfirmModal from '@/components/ui/PinConfirmModal'
import db from '@/db'
import { generateId } from '@/lib/utils'
import { isSupabaseConfigured } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { softDelete } from '@/lib/softDelete'
import { Warehouse, Plus, Building2, Package, TrendingUp, ArrowRightLeft, History, FileText, Trash2, Edit2 } from 'lucide-react'
import type { Location } from '@/engine/types'

export default function DepotsPage() {
  const navigate = useNavigate()
  const businessId = useBusinessId()
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])
  const warehouses = locations?.filter(l => l.type === 'warehouse') || []
  const allStocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId])
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', phone: '' })
  const [editingDepot, setEditingDepot] = useState<Location | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [pinModalOpen, setPinModalOpen] = useState(false)

  async function handleCreate() {
    if (!form.name) return toast('Nom requis', 'warning')
    const now = new Date().toISOString()
    await db.locations.add({
      id: generateId(),
      businessId,
      name: form.name,
      type: 'warehouse',
      address: form.address,
      phone: form.phone,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    toast('Dépôt créé', 'success')
    setModalOpen(false)
    setForm({ name: '', address: '', phone: '' })
  }

  function openEdit(depot: Location) {
    setEditingDepot(depot)
    setForm({ name: depot.name, address: depot.address || '', phone: depot.phone || '' })
    setModalOpen(true)
  }

  async function handleUpdate() {
    if (!editingDepot || !form.name) return toast('Nom requis', 'warning')
    const now = new Date().toISOString()
    await db.locations.update(editingDepot.id, {
      name: form.name,
      address: form.address,
      phone: form.phone,
      updatedAt: now,
    })
    toast('Dépôt mis à jour', 'success')
    setModalOpen(false)
    setEditingDepot(null)
    setForm({ name: '', address: '', phone: '' })
  }

  function confirmDelete(depotId: string) {
    setDeleteTarget(depotId)
    setPinModalOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const stocks = allStocks?.filter(s => s.locationId === deleteTarget) || []
    if (stocks.length > 0) {
      toast('Ce dépôt contient du stock. Transférez ou supprimez le stock d\'abord.', 'warning')
      setDeleteTarget(null)
      return
    }
    try {
      const location = locations?.find(l => l.id === deleteTarget)
      if (location) await softDelete('locations', deleteTarget, location as any, location.name)
      if (isSupabaseConfigured()) {
        const { sb } = await import('@/lib/supabase-db')
        await sb.remove('locations', deleteTarget)
      } else {
        await db.locations.delete(deleteTarget)
      }
      toast('Dépôt supprimé', 'success')
    } catch {
      toast('Erreur lors de la suppression', 'error')
    }
    setDeleteTarget(null)
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Dépôts</h1>
          <p className="text-surface-500 text-sm mt-1">Gestion des dépôts et stocks</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/depots/stock-global')} className="px-4 py-2 rounded-xl border border-surface-300 text-surface-700 text-sm font-medium hover:bg-surface-50 transition-all flex items-center gap-2">
            <Package className="w-4 h-4" /> Stock
          </button>
          <button onClick={() => navigate('/depots/vente')} className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-500 transition-all flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Vente
          </button>
          <button onClick={() => navigate('/bons-sortie')} className="px-4 py-2 rounded-xl border border-surface-300 text-surface-700 text-sm font-medium hover:bg-surface-50 transition-all flex items-center gap-2">
            <FileText className="w-4 h-4" /> Bon de sortie
          </button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Nouveau dépôt
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between w-full">
        <h2 className="text-lg font-semibold text-surface-900">
          Entrepôts & Dépôts
          <span className="ml-2 text-sm font-normal text-surface-400">({warehouses.length})</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 w-full">
        {warehouses.map(w => (
          <div key={w.id} className="bg-white rounded-2xl border border-surface-200 shadow-sm hover:shadow-md hover:border-primary-200 transition-all group">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-surface-900 truncate">{w.name}</h3>
                  {w.address && <p className="text-xs text-surface-400 truncate">{w.address}</p>}
                </div>
              </div>
              {w.phone && (
                <p className="text-xs text-surface-400 mb-3 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {w.phone}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => navigate('/depots/stock/' + w.id)} className="px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-primary-50 hover:text-primary-600 text-xs font-medium transition-colors flex items-center gap-1">
                  <Package className="w-3 h-3" /> Stock
                </button>
                <button onClick={() => navigate(`/depots/stock/${w.id}`)} className="px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-primary-50 hover:text-primary-600 text-xs font-medium transition-colors flex items-center gap-1">
                  <ArrowRightLeft className="w-3 h-3" /> Transférer
                </button>
                <button onClick={() => navigate('/depots/stats/' + w.id)} className="px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-primary-50 hover:text-primary-600 text-xs font-medium transition-colors flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Stats
                </button>
                <button onClick={() => navigate('/depots/history/' + w.id)} className="px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-primary-50 hover:text-primary-600 text-xs font-medium transition-colors flex items-center gap-1">
                  <History className="w-3 h-3" /> Mouvement
                </button>
                <button onClick={() => navigate(`/bons-sortie?from=${w.id}`)} className="px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-primary-50 hover:text-primary-600 text-xs font-medium transition-colors flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Bon de sortie
                </button>
                <button onClick={() => openEdit(w)} className="px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-primary-50 hover:text-primary-600 text-xs font-medium transition-colors flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Modifier
                </button>
                <button onClick={() => confirmDelete(w.id)} className="px-3 py-1.5 rounded-lg bg-surface-50 hover:bg-red-50 hover:text-red-600 text-xs font-medium transition-colors flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {warehouses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-surface-400 w-full">
          <div className="w-16 h-16 bg-surface-100 rounded-full flex items-center justify-center mb-4">
            <Warehouse className="w-8 h-8" />
          </div>
          <p className="font-medium text-surface-500">Aucun dépôt pour le moment</p>
          <p className="text-sm text-surface-400 mt-1">Créez votre premier dépôt pour commencer</p>
          <Button onClick={() => setModalOpen(true)} variant="outline" className="mt-4">
            <Plus className="w-4 h-4" /> Créer un dépôt
          </Button>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingDepot(null); setForm({ name: '', address: '', phone: '' }) }} title={editingDepot ? 'Modifier le dépôt' : 'Nouveau dépôt'}>
        <div className="p-6 space-y-4">
          <Input label="Nom du dépôt" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Téléphone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <Input label="Adresse" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => { setModalOpen(false); setEditingDepot(null); setForm({ name: '', address: '', phone: '' }) }}>Annuler</Button>
          <Button onClick={editingDepot ? handleUpdate : handleCreate}>{editingDepot ? 'Mettre à jour' : 'Créer le dépôt'}</Button>
        </div>
      </Modal>

      <PinConfirmModal
        open={pinModalOpen}
        onClose={() => { setPinModalOpen(false); setDeleteTarget(null) }}
        onConfirm={handleDelete}
        title="Supprimer le dépôt"
        description="Êtes-vous sûr de vouloir supprimer ce dépôt ? Cette action est irréversible."
        actionLabel="Supprimer"
      />
    </div>
  )
}
