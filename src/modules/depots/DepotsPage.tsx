import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { generateId } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Warehouse, Plus, Building2, Package, TrendingUp, ArrowRightLeft } from 'lucide-react'

export default function DepotsPage() {
  const navigate = useNavigate()
  const locations = useLiveQuery(() => db.locations.toArray(), [])
  const warehouses = locations?.filter(l => l.type === 'warehouse') || []
  const shop = locations?.find(l => l.type === 'shop')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', phone: '' })

  async function handleCreate() {
    if (!form.name) return toast('Nom requis', 'warning')
    const now = new Date().toISOString()
    await db.locations.add({
      id: generateId(),
      businessId: 'biz-default',
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Dépôts</h1>
          <p className="text-surface-500 text-sm mt-1">Gestion des dépôts et stocks</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="w-4 h-4" />
          Nouveau dépôt
        </Button>
      </div>

      {shop && (
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary-500" />
                {shop.name}
              </div>
            </CardTitle>
          </CardHeader>
          <div className="p-4 flex gap-4">
            <button onClick={() => navigate('/depots/stock/' + shop.id)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-100 hover:bg-primary-50 text-sm font-medium">
              <Package className="w-4 h-4" /> Voir le stock
            </button>
            <button onClick={() => navigate('/depots/pos/' + shop.id)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-100 hover:bg-primary-50 text-sm font-medium">
              <TrendingUp className="w-4 h-4" /> Ventes
            </button>
            <button onClick={() => navigate('/depots/stats/' + shop.id)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-100 hover:bg-primary-50 text-sm font-medium">
              <TrendingUp className="w-4 h-4" /> Statistiques
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map(w => (
          <Card key={w.id}>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Warehouse className="w-5 h-5 text-warning-500" />
                  {w.name}
                </div>
              </CardTitle>
            </CardHeader>
            <div className="p-4 space-y-2">
              {w.address && <p className="text-xs text-surface-400">{w.address}</p>}
              {w.phone && <p className="text-xs text-surface-400">{w.phone}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => navigate('/depots/stock/' + w.id)} className="px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-primary-50 text-xs font-medium flex items-center gap-1">
                  <Package className="w-3 h-3" /> Stock
                </button>
                <button onClick={() => navigate('/depots/pos/' + w.id)} className="px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-primary-50 text-xs font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Ventes
                </button>
                <button onClick={() => navigate('/depots/transfer/' + w.id)} className="px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-primary-50 text-xs font-medium flex items-center gap-1">
                  <ArrowRightLeft className="w-3 h-3" /> Transférer
                </button>
                <button onClick={() => navigate('/depots/stats/' + w.id)} className="px-3 py-1.5 rounded-lg bg-surface-100 hover:bg-primary-50 text-xs font-medium flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Stats
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {warehouses.length === 0 && (
        <div className="text-center py-12 text-surface-400">
          <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Aucun dépôt pour le moment</p>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau dépôt">
        <div className="space-y-4">
          <input placeholder="Nom du dépôt" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          <input placeholder="Adresse" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          <input placeholder="Téléphone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-surface-300 text-sm" />
          <Button onClick={handleCreate} className="w-full">Créer le dépôt</Button>
        </div>
      </Modal>
    </div>
  )
}
