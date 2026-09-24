import { useMemo, useState } from 'react'
import { Card, Button, Input, Select, Modal, Badge, EmptyState } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { useAppStore } from '@/stores/appStore'
import { formatCurrency, formatDate, formatDateTime, openWhatsApp } from '@/lib/utils'
import { toast } from '@/lib/toast'
import db from '@/db'
import {
  Truck, MapPin, Phone, PhoneCall, CheckCircle2, UserX, Play, Package, Banknote, Navigation,
  HandCoins, Clock, History, XCircle, FileText, Send,
} from 'lucide-react'
import { startDelivery, markDelivered, failDelivery } from '@/engine/deliveries'
import { exportSalePDF, shareSalePDF, buildProductPhotos } from '@/lib/pdf'
import type { Delivery, DeliveryStatus, DeliveryPaymentStatus, PaymentMethod } from '@/types'

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

const FAIL_REASONS = [
  'Client absent',
  'Client introuvable (adresse erronée)',
  'Client refuse la commande',
  'Client refuse de payer',
  'Adresse inexistante',
]

export default function MyDeliveriesPage() {
  const businessId = useBusinessId()
  const user = useAppStore(s => s.user)
  const settings = useLiveQuery(() => db.settings.get('default'), [])
  const currency = settings?.currency || 'XOF'
  const fmt = (n: number) => formatCurrency(n, currency)
  const userId = user?.id || ''

  const allMine = useLiveQuery(
    () => db.deliveries.where('businessId').equals(businessId).toArray()
      .then(all => all
        .filter(d => d.courierId === userId)
        .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))),
    [businessId, userId]
  ) ?? []

  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const productsById = useMemo(() => new Map(products.map(p => [p.id, p])), [products])

  const pending = useMemo(
    () => allMine.filter(d => d.status === 'validated' || d.status === 'prepared' || d.status === 'in_transit'),
    [allMine]
  )
  const done = useMemo(() => allMine.filter(d => d.status === 'delivered'), [allMine])
  const failed = useMemo(() => allMine.filter(d => d.status === 'failed' || d.status === 'cancelled'), [allMine])

  const toCollect = useMemo(() => pending.reduce((s, d) => s + Math.max(0, d.total - d.paid), 0), [pending])

  const earnings = useMemo(() => {
    let client = 0
    let shopFee = 0
    for (const d of done) {
      client += d.deliveryFeeClient || 0
      shopFee += d.deliveryFeeShop || 0
    }
    const paid = allMine.reduce(
      (s, d) => s + (d.courierPayDecision?.payCourier ? d.courierPayDecision.amount || 0 : 0),
      0
    )
    return { client, shopFee, total: client + shopFee, paid }
  }, [done, allMine])

  const [tab, setTab] = useState<'pending' | 'done' | 'failed'>('pending')
  const [payTarget, setPayTarget] = useState<Delivery | null>(null)
  const [failTarget, setFailTarget] = useState<Delivery | null>(null)
  const [failReason, setFailReason] = useState(FAIL_REASONS[0])

  async function handleStart(d: Delivery) {
    try { await startDelivery(d.id); toast(`Livraison ${d.number} démarrée`, 'success') }
    catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }

  async function handleInvoice(d: Delivery, share: boolean) {
    if (!d.saleId) { toast('Facture indisponible pour cette livraison', 'error'); return }
    try {
      const sale = await db.sales.get(d.saleId)
      if (!sale) { toast('Facture introuvable', 'error'); return }
      const photos = await buildProductPhotos(products as any)
      if (share) shareSalePDF(sale, settings as any, photos)
      else exportSalePDF(sale, settings as any, photos)
      toast('Facture ouverte', 'success')
    } catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }
  async function handleFail() {
    if (!failTarget) return
    try {
      await failDelivery(failTarget.id, failReason)
      toast(`Livraison ${failTarget.number} en échec`, 'success')
      setFailTarget(null)
    } catch (e) { toast(e instanceof Error ? e.message : 'Erreur', 'error') }
  }

  const tabs = [
    { id: 'pending' as const, label: 'À effectuer', count: pending.length, icon: <Clock className="w-4 h-4" /> },
    { id: 'done' as const, label: 'Effectuées', count: done.length, icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'failed' as const, label: 'Échouées', count: failed.length, icon: <XCircle className="w-4 h-4" /> },
  ]

  const active = tab === 'pending' ? pending : tab === 'done' ? done : failed

  return (
    <div className="min-h-screen bg-surface-50 pb-24 max-w-xl mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary-500/15 text-primary-500 flex items-center justify-center">
          <Truck className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-surface-900">Mes livraisons</h1>
          <p className="text-xs text-surface-500">
            {pending.length} en attente · À collecter : <span className="font-semibold text-danger">{fmt(toCollect)}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold transition-colors active:scale-[0.98] ${
              tab === t.id
                ? 'bg-primary-500 text-on-accent border-primary-500'
                : 'bg-surface-100 border-surface-200 text-surface-600'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
            <span className={`text-xs ${tab === t.id ? 'text-on-accent/80' : 'text-surface-400'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="bg-surface-100 rounded-2xl border border-surface-200 p-4">
        <div className="flex items-center gap-2">
          <HandCoins className="w-4 h-4 text-primary-500" />
          <p className="text-sm font-semibold text-surface-900">Mon gain (livraisons effectuées)</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
          <div className="rounded-xl bg-success-500/10 p-3">
            <p className="text-xs text-surface-500">Frais client</p>
            <p className="text-lg font-bold text-success">{fmt(earnings.client)}</p>
          </div>
          <div className="rounded-xl bg-primary-500/10 p-3">
            <p className="text-xs text-surface-500">Frais boutique</p>
            <p className="text-lg font-bold text-primary-500">{fmt(earnings.shopFee)}</p>
          </div>
          <div className="col-span-2 flex items-center justify-between border-t border-surface-200 pt-2">
            <span className="text-surface-500">Total gagné</span>
            <b className="text-surface-900">{fmt(earnings.total)}</b>
          </div>
          <div className="col-span-2 flex items-center justify-between -mt-1">
            <span className="text-surface-500">Déjà payé par la boutique</span>
            <b className="text-surface-900">{fmt(earnings.paid)}</b>
          </div>
        </div>
      </div>

      {active.length === 0 && (
        <EmptyState
          icon={<History className="w-8 h-8" />}
          title={tab === 'pending' ? 'Aucune livraison assignée' : tab === 'done' ? 'Aucune livraison effectuée' : 'Aucune livraison échouée'}
          description={tab === 'pending' ? 'Les commandes à livrer apparaîtront ici dès qu’un livreur vous est assigné.' : 'Votre historique s’affichera ici.'}
        />
      )}

      {tab === 'pending' && pending.map(d => {
        const remaining = Math.max(0, d.total - d.paid)
        return (
          <Card key={d.id} className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-primary-500">{d.number}</p>
                <p className="text-xs text-surface-400">{formatDateTime(d.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={STATUS_META[d.status].variant}>{STATUS_META[d.status].label}</Badge>
                <Badge variant={PAYMENT_META[d.paymentStatus].variant}>{PAYMENT_META[d.paymentStatus].label}</Badge>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-surface-900">{d.customerName}</p>
                <p className="text-xs text-surface-500">{d.customerPhone || '—'}</p>
              </div>
              <div className="flex items-center gap-1">
                {d.customerPhone && (
                  <a
                    href={`tel:${d.customerPhone}`}
                    className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 transition-colors"
                    aria-label="Appeler le client"
                  >
                    <Phone className="w-5 h-5" />
                  </a>
                )}
                {d.customerPhone && (
                  <button
                    onClick={() => openWhatsApp(d.customerPhone || '')}
                    className="p-2.5 rounded-xl bg-emerald-600/15 text-emerald-600 hover:bg-emerald-600/25 transition-colors"
                    aria-label="WhatsApp"
                  >
                    <PhoneCall className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {d.customerAddress && (
              <div className="flex items-start gap-2 text-sm text-surface-600 bg-surface-50 rounded-xl p-3">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{d.customerAddress}{d.quarter ? `, ${d.quarter}` : ''}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Articles à livrer</p>
              {d.items.map(it => {
                const prod = productsById.get(it.productId)
                return (
                  <div key={it.id} className="flex items-center gap-3 rounded-xl bg-surface-50 border border-surface-100 p-2">
                    <div className="w-11 h-11 rounded-lg bg-surface-100 flex items-center justify-center overflow-hidden shrink-0 border border-surface-200">
                      {prod?.photos?.[0] ? (
                        <img src={prod.photos[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-5 h-5 text-surface-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-900 truncate">{it.productName}</p>
                      <p className="text-xs text-surface-500">
                        {it.unitName || 'pièce'} · {fmt(it.unitPrice)}
                        {it.quantity > 1 ? ` · × ${it.quantity}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-surface-900">{fmt(it.total)}</p>
                      <p className="text-xs text-primary-500 font-medium">qty {it.quantity}</p>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2 flex-wrap text-xs text-surface-500">
              <span className="inline-flex items-center gap-1"><Package className="w-3.5 h-3.5" />{d.items.reduce((s, i) => s + i.quantity, 0)} articles · {d.items.length} ligne(s)</span>
              {d.plannedDate && <span>· Prévu le <b>{formatDate(d.plannedDate)}</b></span>}
            </div>
            {d.deliveryNote && <p className="text-xs text-surface-500 italic">« {d.deliveryNote} »</p>}

            <div className="rounded-xl bg-primary-500/10 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-surface-500">À encaisser</p>
                <p className="text-2xl font-bold gradient-text">{fmt(remaining)}</p>
              </div>
              <div className="text-right text-xs text-surface-500">
                <p>Total <b>{fmt(d.total)}</b></p>
                <p>Payé <b>{fmt(d.paid)}</b></p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {d.status === 'validated' || d.status === 'prepared' ? (
                <Button size="md" className="flex-1" onClick={() => handleStart(d)}>
                  <Play className="w-4 h-4" /> Démarrer la livraison
                </Button>
              ) : (
                <Button size="md" variant="secondary" className="flex-1" disabled>
                  <Navigation className="w-4 h-4" /> En route
                </Button>
              )}
              <Button size="md" className="flex-1" onClick={() => setPayTarget(d)}>
                <Banknote className="w-4 h-4" /> Livrée + paiement
              </Button>
              <Button size="md" variant="danger" className="flex-1" onClick={() => { setFailReason(FAIL_REASONS[0]); setFailTarget(d) }}>
                <UserX className="w-4 h-4" /> Client absent / refuse
              </Button>
            </div>
          </Card>
        )
      })}

      {tab === 'done' && done.map(d => (
        <Card key={d.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-primary-500">{d.number}</p>
              <p className="text-xs text-surface-400">{d.customerName}{d.customerPhone ? ` · ${d.customerPhone}` : ''}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="success"><CheckCircle2 className="w-3 h-3 mr-1" /> Livrée</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs rounded-xl bg-success-500/10 border border-success-500/20 px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-success shrink-0" />
            <span className="text-surface-600">Livrée le</span>
            <b className="text-surface-900">{formatDateTime(d.deliveredAt || d.createdAt)}</b>
          </div>
          <p className="text-xs text-surface-500">
            {d.items.length} ligne(s) · {d.items.reduce((s, i) => s + i.quantity, 0)} article(s) · Total {fmt(d.total)}
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-success-500/10 p-3">
              <p className="text-xs text-surface-500">Frais client (gagné)</p>
              <p className="font-bold text-success">{fmt(d.deliveryFeeClient || 0)}</p>
            </div>
            <div className="rounded-xl bg-primary-500/10 p-3">
              <p className="text-xs text-surface-500">Frais boutique (gagné)</p>
              <p className="font-bold text-primary-500">{fmt(d.deliveryFeeShop || 0)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="md" variant="outline" className="flex-1" disabled={!d.saleId} onClick={() => handleInvoice(d, false)}>
              <FileText className="w-4 h-4" /> Voir la facture
            </Button>
            <Button size="md" variant="outline" className="flex-1" disabled={!d.saleId} onClick={() => handleInvoice(d, true)}>
              <Send className="w-4 h-4" /> WhatsApp
            </Button>
          </div>
        </Card>
      ))}

      {tab === 'failed' && failed.map(d => (
        <Card key={d.id} className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-primary-500">{d.number}</p>
              <p className="text-xs text-surface-400">{d.customerName}{d.customerPhone ? ` · ${d.customerPhone}` : ''}</p>
            </div>
            <Badge variant={STATUS_META[d.status].variant}>{STATUS_META[d.status].label}</Badge>
          </div>
          {d.cancelReason && <p className="text-xs text-danger italic">« {d.cancelReason} »</p>}
          <div className="flex items-center gap-2 text-xs rounded-xl bg-danger/10 border border-danger/20 px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-danger shrink-0" />
            <span className="text-surface-600">{d.status === 'cancelled' ? 'Annulée le' : 'Retour / échec le'}</span>
            <b className="text-surface-900">{formatDateTime(d.returnedAt || d.cancelledAt || d.createdAt)}</b>
          </div>
          <p className="text-xs text-surface-500">
            {d.items.length} ligne(s) · {d.items.reduce((s, i) => s + i.quantity, 0)} article(s) · Total {fmt(d.total)}
          </p>
          <div className="flex gap-2">
            <Button size="md" variant="outline" className="flex-1" disabled={!d.saleId} onClick={() => handleInvoice(d, false)}>
              <FileText className="w-4 h-4" /> Voir la facture
            </Button>
            <Button size="md" variant="outline" className="flex-1" disabled={!d.saleId} onClick={() => handleInvoice(d, true)}>
              <Send className="w-4 h-4" /> WhatsApp
            </Button>
          </div>
        </Card>
      ))}

      {payTarget && (
        <CourierPaymentModal
          delivery={payTarget}
          fmt={fmt}
          onClose={() => setPayTarget(null)}
          onDone={() => setPayTarget(null)}
        />
      )}

      {failTarget && (
        <Modal open onClose={() => setFailTarget(null)} title={`Échec — ${failTarget.number}`}>
          <div className="p-5 space-y-4">
            <Select
              label="Raison"
              value={failReason}
              onChange={e => setFailReason(e.target.value)}
              options={FAIL_REASONS.map(r => ({ value: r, label: r }))}
            />
            <p className="text-xs text-surface-500">Les articles seront retournés au stock de la boutique.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setFailTarget(null)}>Annuler</Button>
              <Button variant="danger" onClick={handleFail}><UserX className="w-4 h-4" /> Confirmer l’échec</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function CourierPaymentModal({ delivery, fmt, onClose, onDone }: {
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
      toast(`Livrée — ${fmt(amt)} encaissés (${method})`, 'success')
      onDone()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erreur', 'error')
    } finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Livrer ${delivery.number}`}>
      <div className="p-5 space-y-4">
        <div className="rounded-xl bg-primary-500/10 p-4 text-center">
          <p className="text-xs text-surface-500 uppercase tracking-wide">À encaisser</p>
          <p className="text-3xl font-bold gradient-text mt-1">{fmt(remaining)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-left text-xs text-surface-500">
          <span>Total <b className="text-surface-800">{fmt(delivery.total)}</b></span>
          <span>Déjà payé <b className="text-surface-800">{fmt(delivery.paid)}</b></span>
        </div>
        <Input label={`Montant encaissé (max ${fmt(remaining)})`} type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
        <Select label="Moyen de paiement" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} options={PAY_METHODS.map(m => ({ value: m.value, label: m.label }))} />
        <Button size="lg" className="w-full" onClick={submit} loading={saving}>
          <CheckCircle2 className="w-5 h-5" /> Livrée + paiement reçu
        </Button>
      </div>
    </Modal>
  )
}