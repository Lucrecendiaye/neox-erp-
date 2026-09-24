import { useEffect, useMemo, useState } from 'react'
import { Card, StatCard, Button, Input, Select, Modal, Badge, EmptyState } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePermission } from '@/hooks/usePermission'
import { formatCurrency, formatDate, formatDateTime, cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import db from '@/db'
import {
  Truck, Package, Plus, Search, Phone, MapPin, CheckCircle2, XCircle,
  ClipboardList, DollarSign, UserRound, Trash2, Eye, Pencil, Play, PackageCheck,
  UserX, Banknote, HandCoins, Send,
} from 'lucide-react'
import {
  validateDelivery, prepareDelivery, startDelivery,
  markDelivered, failDelivery, cancelDelivery, deleteDelivery, assignCourier, decideCourierPay,
} from '@/engine/deliveries'
import { compileCourierStats, summarizeCourierStats } from '@/engine/courierStats'
import { DATE_RANGE_OPTIONS, getDateRangeBounds, inDateRange, type DateRangeKey } from '@/lib/dateRange'
import { shareSalePDF, buildProductPhotos } from '@/lib/pdf'
import { resolveUser } from '@/engine/userStats'
import { StockAllocationRequiredError } from '@/engine/stockAllocation'
import DeliveryComposePage from './DeliveryComposePage'
import type { Delivery, DeliveryStatus, DeliveryPaymentStatus, PaymentMethod, Customer, Product } from '@/types'


const PAY_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'wave', label: 'Wave' },
  { value: 'orange', label: 'Orange Money' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'bank', label: 'Banque' },
  { value: 'card', label: 'Carte' },
]

const STATUS_META: Record<DeliveryStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  draft: { label: 'Brouillon', variant: 'default' },
  validated: { label: 'Validée', variant: 'info' },
  prepared: { label: 'Préparée', variant: 'warning' },
  in_transit: { label: 'En livraison', variant: 'warning' },
  delivered: { label: 'Livrée', variant: 'success' },
  cancelled: { label: 'Annulée', variant: 'danger' },
  failed: { label: 'Retour / Échec', variant: 'danger' },
}

const PAYMENT_META: Record<DeliveryPaymentStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }> = {
  pending: { label: 'À payer à la livraison', variant: 'warning' },
  prepaid: { label: 'Payée d’avance', variant: 'success' },
  partial: { label: 'Paiement partiel', variant: 'info' },
  full: { label: 'Payée', variant: 'success' },
}

interface FormItem {
  key: string
  productId: string
  productName: string
  quantity: string
  unitPrice: string
}

export default function DeliveriesPage() {
  const businessId = useBusinessId()
  const { can, isAdmin } = usePermission()

  const deliveries = useLiveQuery(() => db.deliveries.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const customers = useLiveQuery(() => db.customers.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const stocks = useLiveQuery(() => db.productStocks.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const users = useLiveQuery(() => db.users.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const settings = useLiveQuery(() => db.settings.get('default'), [])
  const currency = settings?.currency || 'XOF'
  const fmt = (n: number) => formatCurrency(n, currency)

  const [statusFilter, setStatusFilter] = useState('all')
  const [courierFilter, setCourierFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState<DateRangeKey>('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Delivery | null>(null)
  const [detail, setDetail] = useState<Delivery | null>(null)
  const [payTarget, setPayTarget] = useState<Delivery | null>(null)
  const [courierTarget, setCourierTarget] = useState<Delivery | null>(null)
  const [failTarget, setFailTarget] = useState<Delivery | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Delivery | null>(null)
  const [payDecisionTarget, setPayDecisionTarget] = useState<Delivery | null>(null)

  const shopLocation = locations.find(l => l.type === 'shop')
  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    const bounds = getDateRangeBounds(periodFilter, customStart, customEnd)
    return deliveries
      .filter(d => (statusFilter === 'all' || d.status === statusFilter))
      .filter(d => (courierFilter === 'all' || d.courierId === courierFilter))
      .filter(d => inDateRange(d.deliveredAt || d.returnedAt || d.cancelledAt || d.createdAt, bounds))
      .filter(d => !q || d.number.toLowerCase().includes(q) || d.customerName.toLowerCase().includes(q) || (d.customerPhone || '').includes(q))
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
  }, [deliveries, statusFilter, courierFilter, periodFilter, customStart, customEnd, search])

  const courierStats = useMemo(() => {
    const rows = compileCourierStats(deliveries, periodFilter, customStart, customEnd)
    return summarizeCourierStats(rows)
  }, [deliveries, periodFilter, customStart, customEnd])

  const couriers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const d of deliveries) {
      if (d.courierId) map.set(d.courierId, { id: d.courierId, name: d.courierName || d.courierId })
    }
    for (const u of users) if (u.isActive !== false) map.set(u.id, { id: u.id, name: u.name || u.email })
    return Array.from(map.values())
  }, [deliveries, users])

  const kpis = useMemo(() => {
    const active = deliveries.filter(d => d.status !== 'cancelled' && d.status !== 'failed' && d.status !== 'draft')
    const toCollect = active.reduce((s, d) => s + Math.max(0, d.total - d.paid), 0)
    const today = new Date().toISOString().slice(0, 10)
    const preparedCount = deliveries.filter(d => d.status === 'prepared' || d.status === 'in_transit').length
    const draftCount = deliveries.filter(d => d.status === 'draft').length
    const todayCount = deliveries.filter(d => (d.deliveredAt || '').slice(0, 10) === today).length
    const shopFees = deliveries.filter(d => d.status !== 'cancelled' && d.status !== 'draft').reduce((s, d) => s + d.deliveryFeeShop, 0)
    return { active: active.length, toCollect, preparedCount, draftCount, todayCount, shopFees }
  }, [deliveries])

  async function handleValidate(d: Delivery) {
    try { await validateDelivery(d.id); toast(`Livraison ${d.number} validée`, 'success') }
    catch (e) {
      if (e instanceof StockAllocationRequiredError) {
        setEditing(d)
        setFormOpen(true)
        toast(`Choisissez un dépôt pour compléter ${e.productName}`, 'warning')
      } else toast(e instanceof Error ? e.message : 'Erreur', 'error')
    }
  }
  async function handlePrepare(d: Delivery) {
    try { await prepareDelivery(d.id); toast(`Livraison ${d.number} préparée`, 'success') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }
  async function handleStart(d: Delivery) {
    try { await startDelivery(d.id); toast('Livraison démarrée', 'success') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }
  async function handleFail(reason?: string) {
    if (!failTarget) return
    try { await failDelivery(failTarget.id, reason); toast('Livraison en échec / retour', 'success'); setFailTarget(null) }
    catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }
  async function handleCancel(reason?: string) {
    if (!cancelTarget) return
    try { await cancelDelivery(cancelTarget.id, reason); toast('Livraison annulée', 'success'); setCancelTarget(null) }
    catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }
  async function handleDelete(d: Delivery) {
    try { await deleteDelivery(d.id); toast('Brouillon supprimé', 'success') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }
  async function handleAssign(courierId: string) {
    if (!courierTarget) return
    try {
      await assignCourier(courierTarget.id, courierId || undefined)
      toast(courierId ? 'Livreur assigné' : 'Livreur retiré', 'success')
      setCourierTarget(null)
    } catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }

  async function handleWhatsApp(d: Delivery) {
    if (!d.saleId) {
      toast("Validez d'abord cette livraison pour générer sa facture", 'error')
      return
    }
    try {
      const sale = await db.sales.get(d.saleId)
      if (!sale) throw new Error('Facture introuvable')
      shareSalePDF(sale, settings as any, await buildProductPhotos(products as any), resolveUser(users, sale.userId)?.name)
      toast(`Facture ${sale.invoiceNumber} partagée via WhatsApp`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur', 'error')
    }
  }

  return (
    <div className="min-h-screen bg-surface-50 pb-20">
      <div className="max-w-6xl mx-auto px-4 py-4 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary-500/15 text-primary-500 flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-surface-900">Ventes à livraison</h1>
              <p className="text-xs text-surface-500">Suivi des commandes en ligne avec livraison</p>
            </div>
          </div>
          {(can('deliveries', 'create') || isAdmin()) && (
            <Button onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="w-4 h-4" /> Nouvelle livraison
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Commandes actives" value={kpis.active} icon={<Package className="w-5 h-5" />} color="primary" />
          <StatCard title="À préparer / en cours" value={kpis.preparedCount} icon={<Play className="w-5 h-5" />} color="warning" />
          <StatCard title="À encaisser" value={fmt(kpis.toCollect)} icon={<DollarSign className="w-5 h-5" />} color="danger" />
          <StatCard title="Livrées aujourd’hui" value={kpis.todayCount} icon={<CheckCircle2 className="w-5 h-5" />} color="success" />
          <StatCard title="Brouillons" value={kpis.draftCount} icon={<ClipboardList className="w-5 h-5" />} color="info" />
          <StatCard title="CA produits (période)" value={fmt(courierStats.companyPortion)} icon={<PackageCheck className="w-5 h-5" />} color="primary" />
          <StatCard title="Revenu livreurs (frais)" value={fmt(courierStats.fees)} icon={<HandCoins className="w-5 h-5" />} color="warning" />
          <StatCard title="Restant dû aux livreurs" value={fmt(courierStats.pendingToCourier)} icon={<DollarSign className="w-5 h-5" />} color="danger" />
        </div>

        {courierStats.rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-primary-500" />
              <p className="font-semibold text-surface-900 text-sm">Statistiques livreurs</p>
              <span className="text-xs text-surface-400">({courierStats.totalDeliveries} livraison(s) · {courierStats.delivered} livrée(s))</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {courierStats.rows.map(r => (
                <Card key={r.courierId || 'none'} className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-500 flex items-center justify-center font-bold text-sm shrink-0">
                      {(r.courierName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-surface-900 truncate">{r.courierName}</p>
                      <p className="text-[11px] text-surface-400">{r.totalDeliveries} livraison(s) · {r.delivered} livrée(s) · {r.failed} échec(s) · {r.inProgress} en cours</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-surface-500">CA produits (entreprise)</span><span className="font-medium">{fmt(r.companyPortion)}</span></div>
                    <div className="flex justify-between"><span className="text-surface-500">Frais client (livreur)</span><span className="font-medium text-success">{fmt(r.feeClient)}</span></div>
                    <div className="flex justify-between"><span className="text-surface-500">Frais boutique (livreur)</span><span className="font-medium text-success">{fmt(r.feeShop)}</span></div>
                    <div className="flex justify-between"><span className="text-surface-500">Gain livreur</span><span className="font-medium">{fmt(r.fees)}</span></div>
                    <div className="flex justify-between"><span className="text-surface-500">Payé au livreur</span><span className="font-medium text-success">{fmt(r.courierPayments)}</span></div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-primary-500/10 border border-primary-200 px-3 py-2.5">
                    <span className="text-xs font-semibold text-primary-400">Montant à verser au livreur</span>
                    <span className="text-lg font-bold text-primary-500">{fmt(r.pendingToCourier)}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <Input
              className="pl-9"
              placeholder="Rechercher par n°, client ou téléphone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="w-[180px]"
            value={periodFilter}
            onChange={e => setPeriodFilter(e.target.value as DateRangeKey)}
            options={DATE_RANGE_OPTIONS}
          />
          {periodFilter === 'custom' && (
            <>
              <Input type="date" className="w-[150px]" value={customStart} onChange={e => setCustomStart(e.target.value)} title="Date début" />
              <Input type="date" className="w-[150px]" value={customEnd} onChange={e => setCustomEnd(e.target.value)} title="Date fin" />
            </>
          )}
          <Select
            className="w-[180px]"
            value={courierFilter}
            onChange={e => setCourierFilter(e.target.value)}
            options={[{ value: 'all', label: 'Tous les livreurs' }, ...couriers.map(c => ({ value: c.id, label: c.name }))]}
          />
          <Select
            className="w-[180px]"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'Tous les statuts' },
              { value: 'draft', label: 'Brouillons' },
              { value: 'validated', label: 'Validées' },
              { value: 'prepared', label: 'Préparées' },
              { value: 'in_transit', label: 'En livraison' },
              { value: 'delivered', label: 'Livrées' },
              { value: 'cancelled', label: 'Annulées' },
              { value: 'failed', label: 'Retour / Échec' },
            ]}
          />
        </div>

        <Card className="p-0 overflow-hidden">
          <div className="responsive-table">
            <table className="w-full text-sm">
              <thead className="bg-surface-50 text-surface-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Commande</th>
                  <th className="text-left font-medium px-4 py-3">Client</th>
                  <th className="text-left font-medium px-4 py-3">Articles</th>
                  <th className="text-left font-medium px-4 py-3">Total</th>
                  <th className="text-left font-medium px-4 py-3">Paiement</th>
                  <th className="text-left font-medium px-4 py-3">Statut</th>
                  <th className="text-left font-medium px-4 py-3">Livreur</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(d => (
                  <Row
                    key={d.id}
                    d={d}
                    fmt={fmt}
                    canEdit={can('deliveries', 'edit') || isAdmin()}
                    canValidate={can('deliveries', 'validate') || isAdmin()}
                    canDelete={can('deliveries', 'delete') || isAdmin()}
                    onValidate={() => handleValidate(d)}
                    onPrepare={() => handlePrepare(d)}
                    onStart={() => handleStart(d)}
                    onEdit={() => { setEditing(d); setFormOpen(true) }}
                    onDetail={() => setDetail(d)}
                    onPay={() => setPayTarget(d)}
                    onFail={() => setFailTarget(d)}
                    onCancel={() => setCancelTarget(d)}
                    onDelete={() => handleDelete(d)}
                    onAssign={() => setCourierTarget(d)}
                    onPayDecision={() => setPayDecisionTarget(d)}
                    onWhatsApp={() => handleWhatsApp(d)}
                  />
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <EmptyState
                        icon={<Truck className="w-8 h-8" />}
                        title="Aucune livraison"
                        description="Créez une commande à livrer (client, articles, adresse, livreur)."
                        action={can('deliveries', 'create') || isAdmin() ? (
                          <Button onClick={() => { setEditing(null); setFormOpen(true) }}>Nouvelle livraison</Button>
                        ) : undefined}
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {formOpen && (
        <DeliveryComposePage
          existing={editing}
          customers={customers as Customer[]}
          products={products as Product[]}
          stocks={stocks as any}
          locations={locations as any}
          users={users as any as { id: string; name: string; isActive?: boolean }[]}
          defaultLocationId={shopLocation?.id || ''}
          currency={currency}
          onClose={() => setFormOpen(false)}
        />
      )}

      {detail && <DeliveryDetail delivery={detail} onClose={() => setDetail(null)} fmt={fmt} products={products as Product[]} />}

      {payTarget && (
        <PaymentModal
          delivery={payTarget}
          fmt={fmt}
          onClose={() => setPayTarget(null)}
          onDone={() => setPayTarget(null)}
        />
      )}

      {courierTarget && (
        <Modal open onClose={() => setCourierTarget(null)} title={`Assigner un livreur - ${courierTarget.number}`}>
          <div className="p-5 space-y-3">
            <Select
              label="Livreur"
              value={courierTarget.courierId || ''}
              onChange={e => handleAssign(e.target.value)}
              placeholder="Aucun livreur"
              options={users.filter(u => u.isActive !== false).map(u => ({ value: u.id, label: u.name || u.email }))}
            />
          </div>
        </Modal>
      )}

      {failTarget && (
        <ReasonModal
          title={`Échec / retour - ${failTarget.number}`}
          placeholder="Raison (client absent, refus de payer...)"
          confirmLabel="Marquer en échec"
          onConfirm={handleFail}
          onClose={() => setFailTarget(null)}
        />
      )}

      {cancelTarget && (
        <ReasonModal
          title={`Annuler - ${cancelTarget.number}`}
          placeholder="Motif de l’annulation"
          confirmLabel="Annuler la livraison"
          onConfirm={handleCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {payDecisionTarget && (
        <CourierPayModal
          delivery={payDecisionTarget}
          fmt={fmt}
          onClose={() => setPayDecisionTarget(null)}
        />
      )}
    </div>
  )
}

function Row({ d, fmt, canEdit, canValidate, canDelete, onValidate, onPrepare, onStart, onEdit, onDetail, onPay, onFail, onCancel, onDelete, onAssign, onPayDecision, onWhatsApp }: {
  d: Delivery
  fmt: (n: number) => string
  canEdit: boolean
  canValidate: boolean
  canDelete: boolean
  onValidate: () => void
  onPrepare: () => void
  onStart: () => void
  onEdit: () => void
  onDetail: () => void
  onPay: () => void
  onFail: () => void
  onCancel: () => void
  onDelete: () => void
  onAssign: () => void
  onPayDecision: () => void
  onWhatsApp: () => void
}) {
  const sm = STATUS_META[d.status]
  const pm = PAYMENT_META[d.paymentStatus]
  const remaining = Math.max(0, d.total - d.paid)
  return (
    <tr className="border-t border-surface-100 hover:bg-surface-50/60 transition-colors">
      <td data-label="Commande" className="px-4 py-3">
        <button onClick={onDetail} className="text-left">
          <p className="font-semibold text-primary-500">{d.number}</p>
          <p className="text-xs text-surface-400">{formatDate(d.createdAt)}</p>
        </button>
      </td>
      <td data-label="Client" className="px-4 py-3">
        <p className="font-medium text-surface-800">{d.customerName}</p>
        <p className="text-xs text-surface-400 flex items-center gap-1"><Phone className="w-3 h-3" />{d.customerPhone || '—'}</p>
      </td>
      <td data-label="Articles" className="px-4 py-3">
        <p className="text-surface-700">{d.items.reduce((s, i) => s + i.quantity, 0)} article(s)</p>
        <p className="text-xs text-surface-400">{d.items.length} ligne(s)</p>
      </td>
      <td data-label="Total" className="px-4 py-3">
        <p className="font-semibold text-surface-900">{fmt(d.total)}</p>
        <p className={cn('text-xs font-medium', remaining > 0 ? 'text-danger' : 'text-success')}>
          {remaining > 0 ? `Reste ${fmt(remaining)}` : 'Payée'}
        </p>
      </td>
      <td data-label="Paiement" className="px-4 py-3">
        <Badge variant={pm.variant}>{pm.label}</Badge>
        <p className="text-xs text-surface-400 mt-1">Payé {fmt(d.paid)}</p>
      </td>
      <td data-label="Statut" className="px-4 py-3">
        <Badge variant={sm.variant}>{sm.label}</Badge>
      </td>
      <td data-label="Livreur" className="px-4 py-3">
        <button onClick={onAssign} disabled={!canEdit} className="text-left disabled:opacity-60">
          <p className="flex items-center gap-1 text-surface-700"><UserRound className="w-3.5 h-3.5" />{d.courierName || 'Non assigné'}</p>
          <p className="text-xs text-surface-400">{d.plannedDate ? `Prévu ${formatDate(d.plannedDate)}` : '—'}</p>
        </button>
      </td>
      <td data-label="Actions" className="px-4 py-3 text-right whitespace-nowrap">
        <div className="inline-flex gap-1 flex-wrap justify-end">
          <Button size="sm" variant="ghost" onClick={onDetail} className="!px-2"><Eye className="w-4 h-4" /></Button>
          {d.status !== 'draft' && (
            <Button size="sm" variant="ghost" onClick={onWhatsApp} className="!px-2" title="Envoyer la facture par WhatsApp"><Send className="w-4 h-4" /></Button>
          )}
          {d.status === 'draft' && canValidate && (
            <Button size="sm" variant="outline" onClick={onValidate} className="!px-2"><PackageCheck className="w-4 h-4" /></Button>
          )}
          {canEdit && d.status !== 'cancelled' && d.status !== 'failed' && d.status !== 'delivered' && (
            <Button size="sm" variant="ghost" onClick={onEdit} className="!px-2" title="Modifier"><Pencil className="w-4 h-4" /></Button>
          )}
          {d.status === 'validated' && canEdit && (
            <Button size="sm" variant="outline" onClick={onPrepare} className="!px-2"><ClipboardList className="w-4 h-4" /></Button>
          )}
          {d.status === 'prepared' && canEdit && (
            <Button size="sm" variant="outline" onClick={onStart} className="!px-2"><Play className="w-4 h-4" /></Button>
          )}
          {(d.status === 'validated' || d.status === 'prepared' || d.status === 'in_transit') && canEdit && (
            <>
              <Button size="sm" variant="primary" onClick={onPay} className="!px-2"><Banknote className="w-4 h-4" /></Button>
              <Button size="sm" variant="danger" onClick={onFail} className="!px-2"><UserX className="w-4 h-4" /></Button>
            </>
          )}
          {(d.status !== 'delivered' && d.status !== 'cancelled') && canValidate && (
            <Button size="sm" variant="ghost" onClick={onCancel} className="!px-2"><XCircle className="w-4 h-4" /></Button>
          )}
          {d.status === 'draft' && canDelete && (
            <Button size="sm" variant="ghost" onClick={onDelete} className="!px-2 text-danger"><Trash2 className="w-4 h-4" /></Button>
          )}
          {(d.status === 'cancelled' || d.status === 'failed') && !d.courierPayDecision?.decided && canValidate && (
            <Button size="sm" variant="outline" onClick={onPayDecision} className="!px-2" title="Décider le paiement du livreur">
              <HandCoins className="w-4 h-4" />
            </Button>
          )}
          {(d.status === 'cancelled' || d.status === 'failed') && d.courierPayDecision?.decided && (
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium', d.courierPayDecision.payCourier ? 'text-success' : 'text-danger')}>
              <UserRound className="w-3.5 h-3.5" />{d.courierPayDecision.payCourier ? `Payé ${fmt(d.courierPayDecision.amount)}` : 'Non payé'}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}

function DeliveryDetail({ delivery, onClose, fmt, products }: { delivery: Delivery; onClose: () => void; fmt: (n: number) => string; products: Product[] }) {
  const pm = PAYMENT_META[delivery.paymentStatus]
  return (
    <Modal open onClose={onClose} title={`Livraison ${delivery.number}`}>
      <div className="p-5 space-y-4 text-sm">
        <div className="flex items-center justify-between">
          <Badge variant={STATUS_META[delivery.status].variant}>{STATUS_META[delivery.status].label}</Badge>
          <Badge variant={pm.variant}>{pm.label}</Badge>
        </div>
        <div className="rounded-xl bg-surface-50 p-4 space-y-1">
          <p className="font-semibold text-surface-900">{delivery.customerName}</p>
          <p className="flex items-center gap-1 text-surface-500"><Phone className="w-3.5 h-3.5" />{delivery.customerPhone || '—'}</p>
          {delivery.customerAddress && (
            <p className="flex items-center gap-1 text-surface-500"><MapPin className="w-3.5 h-3.5" />{delivery.customerAddress}{delivery.quarter ? `, ${delivery.quarter}` : ''}</p>
          )}
          {delivery.courierName && <p className="flex items-center gap-1 text-surface-500"><UserRound className="w-3.5 h-3.5" />{delivery.courierName}</p>}
          <p className="text-surface-400">Créée le {formatDateTime(delivery.createdAt)} par {delivery.createdByName}</p>
          {delivery.plannedDate && <p className="text-surface-400">Prévue le {formatDate(delivery.plannedDate)}</p>}
          {delivery.deliveredAt && <p className="text-success">Livrée le {formatDateTime(delivery.deliveredAt)}</p>}
          {delivery.cancelReason && <p className="text-danger">{delivery.status === 'failed' ? 'Échec : ' : 'Motif : '}{delivery.cancelReason}</p>}
        </div>

        <div>
          <p className="text-xs font-medium text-surface-500 uppercase mb-2">Articles</p>
          <div className="space-y-1">
            {delivery.items.map(it => {
              const prod = products.find(p => p.id === it.productId)
              return (
                <div key={it.id} className="flex items-center gap-3 border-b border-surface-100 pb-1">
                  <div className="w-10 h-10 rounded-lg bg-surface-50 flex items-center justify-center overflow-hidden shrink-0 border border-surface-100">
                    {prod?.photos?.[0] ? (
                      <img src={prod.photos[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-5 h-5 text-surface-500" />
                    )}
                  </div>
                  <span className="flex-1 truncate text-surface-700">{it.productName}</span>
                  <span className="text-xs text-surface-400">× {it.quantity}</span>
                  <span className="font-medium text-surface-800">{fmt(it.total)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl bg-surface-50 p-4 space-y-1">
          <div className="flex justify-between text-surface-600"><span>Sous-total articles</span><span>{fmt(delivery.subtotal)}</span></div>
          <div className="flex justify-between text-surface-600"><span>Remise</span><span>- {fmt(delivery.discount)}</span></div>
          <div className="flex justify-between text-surface-600"><span>Frais livraison — part client</span><span>{fmt(delivery.deliveryFeeClient)}</span></div>
          <div className="flex justify-between text-surface-600"><span>Frais livraison — part boutique</span><span>{fmt(delivery.deliveryFeeShop)}</span></div>
          <div className="flex justify-between font-bold text-surface-900 border-t border-surface-200 pt-2">
            <span>Total client</span><span>{fmt(delivery.total)}</span>
          </div>
          <div className="flex justify-between text-success"><span>Payé</span><span>{fmt(delivery.paid)}</span></div>
          <div className="flex justify-between text-danger font-medium"><span>À encaisser</span><span>{fmt(Math.max(0, delivery.total - delivery.paid))}</span></div>
        </div>

        {(delivery.payments || []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-surface-500 uppercase mb-2">Paiements</p>
            <div className="space-y-1">
              {delivery.payments.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-surface-600">{p.kind === 'cod' ? 'Encaissée à la livraison' : 'Payée d’avance'} · {p.method}</span>
                  <span className="font-medium text-surface-800">{fmt(p.amount)} <span className="text-surface-400 text-xs">({formatDate(p.date)})</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function PaymentModal({ delivery, fmt, onClose, onDone }: {
  delivery: Delivery
  fmt: (n: number) => string
  onClose: () => void
  onDone: () => void
}) {
  const remaining = Math.max(0, delivery.total - delivery.paid)
  const [amount, setAmount] = useState(String(remaining))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [saving, setSaving] = useState(false)

  async function submit() {
    const amt = parseFloat(amount) || 0
    if (amt <= 0) { toast('Montant invalide', 'error'); return }
    if (amt > remaining) { toast(`Le montant dépasse le solde (reste ${fmt(remaining)})`, 'error'); return }
    setSaving(true)
    try {
      await markDelivered(delivery.id, { amount: amt, method })
      toast(`Livraison ${delivery.number} livrée — ${fmt(amt)} encaissés`, 'success')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Livrer ${delivery.number}`}>
      <div className="p-5 space-y-4">
        <div className="rounded-xl bg-surface-50 p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-surface-500">Total</span><span className="font-semibold">{fmt(delivery.total)}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Déjà payé</span><span>{fmt(delivery.paid)}</span></div>
          <div className="flex justify-between font-bold text-surface-900"><span>À encaisser</span><span className="text-xl">{fmt(remaining)}</span></div>
          <div className="flex justify-between text-primary-500 text-xs"><span>Client</span><span>{delivery.customerName}</span></div>
        </div>
        <Input label={`Montant encaissé (max ${fmt(remaining)})`} type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
        <Select label="Moyen de paiement" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} options={PAY_METHODS.map(m => ({ value: m.value, label: m.label }))} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} loading={saving}>
            <Banknote className="w-4 h-4" /> Livrée + encaissée
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ReasonModal({ title, placeholder, confirmLabel, onConfirm, onClose }: {
  title: string
  placeholder: string
  confirmLabel: string
  onConfirm: (reason?: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="p-5 space-y-4">
        <Input label="Raison / motif" value={reason} onChange={e => setReason(e.target.value)} placeholder={placeholder} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="danger" onClick={() => onConfirm(reason)}>{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  )
}

function CourierPayModal({ delivery, fmt, onClose }: {
  delivery: Delivery
  fmt: (n: number) => string
  onClose: () => void
}) {
  const fees = (delivery.deliveryFeeClient || 0) + (delivery.deliveryFeeShop || 0)
  const [pay, setPay] = useState(true)
  const [amount, setAmount] = useState(fees > 0 ? String(fees) : '0')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      await decideCourierPay(delivery.id, { payCourier: pay, amount: pay ? parseFloat(amount) || 0 : 0 })
      toast(pay ? `Paiement livreur approuvé (${fmt(parseFloat(amount) || 0)})` : 'Livreur non payé', 'success')
      onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Paiement livreur - ${delivery.number}`}>
      <div className="p-5 space-y-4">
        <div className="rounded-xl bg-surface-50 p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-surface-500">Livreur</span><span className="font-semibold">{delivery.courierName || '—'}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Montant récolté (frais client + boutique)</span><span className="font-semibold">{fmt(fees)}</span></div>
          <p className="text-xs text-surface-400">Cette décision est enregistrée dans l’historique. Aucun débit automatique de la caisse.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-surface-700">Le livreur doit-il être payé pour cette livraison retournée ?</p>
          <div className="flex gap-2">
            <Button size="sm" variant={pay ? 'primary' : 'outline'} onClick={() => setPay(true)}>Oui</Button>
            <Button size="sm" variant={!pay ? 'danger' : 'outline'} onClick={() => setPay(false)}>Non</Button>
          </div>
        </div>
        {pay && (
          <Input label="Montant à payer (FCFA)" type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} loading={saving}>
            <HandCoins className="w-4 h-4" /> Enregistrer la décision
          </Button>
        </div>
      </div>
    </Modal>
  )
}
