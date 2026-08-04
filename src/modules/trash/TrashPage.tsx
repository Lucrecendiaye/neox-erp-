import { useState } from 'react'
import { Card, Button, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePermission } from '@/hooks/usePermission'
import db from '@/db'
import { formatDateTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { getDeletedRecords, restore, permanentDelete, emptyTrash, emptyTrashByEntity, type DeletableEntity } from '@/lib/softDelete'
import { Trash2, RotateCcw, AlertTriangle, Search, Archive, X } from 'lucide-react'

const ENTITY_LABELS: Record<string, string> = {
  products: 'Produits',
  categories: 'Catégories',
  customers: 'Clients',
  suppliers: 'Fournisseurs',
  sales: 'Ventes',
  purchases: 'Achats',
  invoices: 'Factures',
  credits: 'Crédits',
  employees: 'Employés',
  attendance: 'Présences',
  payrolls: 'Paies',
  leads: 'Leads',
  locations: 'Emplacements',
  cashBook: 'Caisse',
  notifications: 'Notifications',
  businesses: 'Boutiques',
  users: 'Utilisateurs',
}

export default function TrashPage() {
  const businessId = useBusinessId()
  const { isAdmin } = usePermission()
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<string>('all')
  const [confirmModal, setConfirmModal] = useState<{ type: 'restore' | 'delete' | 'empty'; entity?: DeletableEntity; recordId?: string } | null>(null)

  const deletedRecords = useLiveQuery(
    () => businessId ? getDeletedRecords(businessId) : Promise.resolve([]),
    [businessId]
  )

  const filtered = deletedRecords?.filter(r => {
    if (entityFilter !== 'all' && r.entity !== entityFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.entityName.toLowerCase().includes(q) || r.entityLabel.toLowerCase().includes(q)
    }
    return true
  })

  const { paginatedItems, ...pag } = usePagination(filtered, 20)

  async function handleRestore(entity: DeletableEntity, entityId: string) {
    try {
      await restore(entity, entityId)
      toast('Élément restauré avec succès', 'success')
      setConfirmModal(null)
    } catch {
      toast('Erreur lors de la restauration', 'error')
      setConfirmModal(null)
    }
  }

  async function handlePermanentDelete(entity: DeletableEntity, entityId: string) {
    try {
      await permanentDelete(entity, entityId)
      toast('Élément supprimé définitivement', 'success')
      setConfirmModal(null)
    } catch {
      toast('Erreur lors de la suppression', 'error')
      setConfirmModal(null)
    }
  }

  async function handleEmptyTrash() {
    try {
      if (confirmModal?.entity) {
        await emptyTrashByEntity(businessId, confirmModal.entity)
        toast('Corbeille vidée pour ce type', 'success')
      } else {
        await emptyTrash(businessId)
        toast('Corbeille vidée avec succès', 'success')
      }
      setConfirmModal(null)
    } catch {
      toast('Erreur lors du vidage', 'error')
    }
  }

  const entityCounts: Record<string, number> = {}
  deletedRecords?.forEach(r => {
    entityCounts[r.entity] = (entityCounts[r.entity] || 0) + 1
  })

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Corbeille</h1>
          <p className="text-surface-500 text-sm mt-1">{deletedRecords?.length || 0} élément(s) supprimé(s)</p>
        </div>
        {(deletedRecords?.length || 0) > 0 && (
          <Button variant="danger" onClick={() => setConfirmModal({ type: 'empty' })}>
            <Trash2 className="w-4 h-4" /> Vider la corbeille
          </Button>
        )}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input type="text" placeholder="Rechercher dans la corbeille..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
          <option value="all">Tous les types</option>
          {Object.entries(ENTITY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label} ({entityCounts[key] || 0})</option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto responsive-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Élément</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Type</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Supprimé par</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Date de suppression</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems?.map((r) => (
                <tr key={`${r.entity}-${r.entityId}`} className="hover:bg-surface-50 transition-colors">
                  <td data-label="Élément" className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-danger">
                        <Archive className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-surface-900">{r.entityName}</p>
                        <p className="text-xs text-surface-400 font-mono">{r.entityId.slice(0, 12)}...</p>
                      </div>
                    </div>
                  </td>
                  <td data-label="Type" className="px-6 py-4">
                    <Badge variant="default">{r.entityLabel}</Badge>
                  </td>
                  <td data-label="Supprimé par" className="px-6 py-4 text-sm text-surface-600">
                    {r.userName || '—'}
                  </td>
                  <td data-label="Date suppression" className="px-6 py-4 text-sm text-surface-500 whitespace-nowrap">
                    {formatDateTime(r.deletedAt)}
                  </td>
                  <td data-label="Actions" className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setConfirmModal({ type: 'restore', entity: r.entity as DeletableEntity, recordId: r.entityId })}>
                        <RotateCcw className="w-3.5 h-3.5" /> Restaurer
                      </Button>
                      <button onClick={() => setConfirmModal({ type: 'delete', entity: r.entity as DeletableEntity, recordId: r.entityId })}
                        className="p-2 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger transition-colors" title="Supprimer définitivement">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!filtered || filtered.length === 0) && (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-surface-400">
                    <Trash2 className="w-14 h-14 mx-auto mb-4 text-surface-300" />
                    <p className="text-sm font-medium">Corbeille vide</p>
                    <p className="text-xs mt-1">Les éléments supprimés apparaîtront ici</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </Card>

      <Modal open={!!confirmModal} onClose={() => setConfirmModal(null)}
        title={confirmModal?.type === 'restore' ? 'Restaurer' : confirmModal?.type === 'empty' ? 'Vider la corbeille' : 'Supprimer définitivement'}
        size="sm">
        <div className="p-6 space-y-4 text-center">
          {confirmModal?.type === 'restore' ? (
            <>
              <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto">
                <RotateCcw className="w-7 h-7 text-amber-500" />
              </div>
              <p className="text-sm text-surface-600">Restaurer cet élément ? Il sera remis dans sa liste d'origine.</p>
            </>
          ) : confirmModal?.type === 'delete' ? (
            <>
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7 text-danger" />
              </div>
              <p className="text-sm text-surface-600">Supprimer définitivement ? Cette action est irréversible.</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
                <Trash2 className="w-7 h-7 text-danger" />
              </div>
              <p className="text-sm text-surface-600">
                {confirmModal?.entity
                  ? `Vider tous les éléments de type "${ENTITY_LABELS[confirmModal.entity]}" ?`
                  : 'Vider toute la corbeille ? Cette action est irréversible.'}
              </p>
            </>
          )}
          <div className="flex gap-3 justify-center">
            <Button variant="ghost" onClick={() => setConfirmModal(null)}>Annuler</Button>
            <Button variant={confirmModal?.type === 'restore' ? 'primary' : 'danger'}
              onClick={() => {
                if (confirmModal?.type === 'restore' && confirmModal.entity && confirmModal.recordId) {
                  handleRestore(confirmModal.entity, confirmModal.recordId)
                } else if (confirmModal?.type === 'delete' && confirmModal.entity && confirmModal.recordId) {
                  handlePermanentDelete(confirmModal.entity, confirmModal.recordId)
                } else if (confirmModal?.type === 'empty') {
                  handleEmptyTrash()
                }
              }}>
              {confirmModal?.type === 'restore' ? 'Restaurer' : confirmModal?.type === 'empty' ? 'Vider' : 'Supprimer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
