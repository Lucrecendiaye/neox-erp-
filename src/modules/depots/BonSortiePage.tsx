import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Button, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePermission } from '@/hooks/usePermission'
import { useAppStore } from '@/stores/appStore'
import db from '@/db'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { confirmTransferReception, validateBonSortie, cancelBonSortie, duplicateBonSortie, signBonSortie } from '@/engine/operations'
import { printBonSortieDocument, downloadBonSortiePDF } from '@/lib/pdf'
import {
  ArrowLeft, Plus, Search, Eye, Printer, FileDown, Copy, CheckCircle2, XCircle,
  Clock, Truck, PenLine, FileText, AlertTriangle
} from 'lucide-react'
import type { BonSortie } from '@/engine/types'
import type { CompanySettings } from '@/types'

const statusMeta: Record<string, { label: string; badge: 'warning' | 'info' | 'success' | 'danger' }> = {
  en_attente: { label: 'En attente', badge: 'warning' },
  valide: { label: 'Validé', badge: 'info' },
  recu: { label: 'Reçu', badge: 'success' },
  annule: { label: 'Annulé', badge: 'danger' },
}

function inPeriod(iso: string, period: string) {
  const d = new Date(iso)
  const now = new Date()
  if (period === 'jour') return d.toDateString() === now.toDateString()
  if (period === 'semaine') return (now.getTime() - d.getTime()) <= 7 * 86400000
  if (period === 'mois') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  if (period === 'annee') return d.getFullYear() === now.getFullYear()
  return true
}

function BonView({ bon, settings, onClose }: { bon: BonSortie; settings?: CompanySettings; onClose?: () => void }) {
  const s = settings || {} as CompanySettings
  return (
    <div className="p-6 space-y-4">
      <div className="rounded-xl overflow-hidden bg-[#1e40af] text-white p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {s.logo ? <img src={s.logo} alt="logo" className="w-10 h-10 rounded-lg object-contain bg-white p-0.5" /> : <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></div>}
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{s.name || 'Entreprise'}</p>
            {s.slogan && <p className="text-[10px] text-white/80 truncate">{s.slogan}</p>}
            {s.address && <p className="text-[10px] text-white/80 truncate">{s.address}</p>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-sm">BON DE SORTIE</p>
          <p className="text-xs text-white/90">N° {bon.number}</p>
          <Badge variant={statusMeta[bon.status]?.badge || 'default'} className="mt-1 text-[10px]">{statusMeta[bon.status]?.label || bon.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-surface-200 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-[#1e40af] uppercase tracking-wider mb-1">Provenance</p>
          <p className="text-sm font-semibold text-surface-900">{bon.fromLocationName}{bon.fromLocationCode ? ` (${bon.fromLocationCode})` : ''}</p>
          <p className="text-xs text-surface-500">{bon.fromAddress || 'Adresse non renseignée'}</p>
        </div>
        <div className="border border-surface-200 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-[#1e40af] uppercase tracking-wider mb-1">Destination</p>
          <p className="text-sm font-semibold text-surface-900">{bon.toLocationName}{bon.toLocationCode ? ` (${bon.toLocationCode})` : ''}</p>
          <p className="text-xs text-surface-500">{bon.toAddress || 'Adresse non renseignée'}</p>
        </div>
      </div>

      <div className="text-xs text-surface-600 space-y-1">
        <p><strong>Création :</strong> {formatDate(bon.createdAt)} — {bon.createdTime} &nbsp; <strong>Expédition :</strong> {bon.shippedAt ? `${formatDate(bon.shippedAt)} — ${bon.shippedTime || ''}` : '—'}</p>
        <p><strong>Destinateur :</strong> {bon.destinateurName}{bon.destinateurRole ? ` (${bon.destinateurRole})` : ''} &nbsp; <strong>Destinataire :</strong> {bon.destinataireName || '—'}{bon.destinataireRole ? ` (${bon.destinataireRole})` : ''}</p>
        <p><strong>Référence :</strong> {bon.reference || '—'} &nbsp; <strong>Motif :</strong> {bon.motif || '—'}</p>
        {bon.comments && <p><strong>Observations :</strong> {bon.comments}</p>}
        {bon.validatedAt && <p className="text-emerald-700"><strong>Validé le :</strong> {formatDateTime(bon.validatedAt)} par {bon.validatedByName || '—'}</p>}
      </div>

      <div className="overflow-x-auto responsive-table rounded-xl border border-surface-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1e40af] text-white text-left text-[10px] uppercase">
              <th className="px-3 py-2">Réf.</th>
              <th className="px-3 py-2">Produit</th>
              <th className="px-3 py-2">Qté</th>
              <th className="px-3 py-2">P.U.</th>
              <th className="px-3 py-2 text-right">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {bon.items.map((it, i) => (
              <tr key={i} className="border-b border-surface-100">
                <td className="px-3 py-2 text-xs text-surface-500">{it.reference || it.barcode || '—'}</td>
                <td className="px-3 py-2 font-medium text-surface-900">{it.productName}</td>
                <td className="px-3 py-2">{it.quantity} {it.unit || ''}</td>
                <td className="px-3 py-2">{it.unitPrice ? formatCurrency(it.unitPrice) : '—'}</td>
                <td className="px-3 py-2 text-right font-semibold">{it.total ? formatCurrency(it.total) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-sm font-semibold text-surface-900">
        <span>Articles : {bon.totalArticles}</span>
        <span>Quantité : {bon.totalQuantity}</span>
        {bon.totalValue ? <span>Valeur : {formatCurrency(bon.totalValue)}</span> : null}
      </div>

      <div className="text-xs text-surface-600">
        {bon.receivedAt ? (
          <p className="text-emerald-700"><strong>Reçu le :</strong> {formatDateTime(bon.receivedAt)} par {bon.receivedBy || '—'}</p>
        ) : (
          <p className="text-amber-600"><strong>Réception non confirmée</strong></p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4">
        {['destinateur', 'destinataire', 'responsable'].map(role => (
          <div key={role}>
            <p className="text-xs font-semibold text-[#1e40af] min-h-[16px]">
              {bon.signatures?.[role as keyof typeof bon.signatures] ? String(bon.signatures[role as keyof typeof bon.signatures]) : (role === 'destinateur' ? bon.destinateurName : role === 'destinataire' ? bon.receivedBy : '')}
            </p>
            <div className="mt-8 border-t border-dashed border-surface-400 text-[10px] text-surface-400">
              Signature du {role === 'destinataire' ? 'destinataire' : role}
            </div>
          </div>
        ))}
      </div>
      {onClose && (
        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      )}
    </div>
  )
}

export default function BonSortiePage() {
  const businessId = useBusinessId()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currentUser = useAppStore(s => s.user)
  const settings = useAppStore(s => s.settings)
  const { permissions } = usePermission()
  const canManage = permissions.includes('depots:transfer') || permissions.includes('depots:edit') || permissions.includes('*')

  const bons = useLiveQuery(
    () => db.bonSorties.where('businessId').equals(businessId).reverse().sortBy('createdAt'),
    [businessId]
  ) || []
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId]) || []

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [fromFilter, setFromFilter] = useState<string>(searchParams.get('from') || 'all')
  const [selected, setSelected] = useState<BonSortie | null>(null)
  const [receptModal, setReceptModal] = useState<BonSortie | null>(null)
  const [receptName, setReceptName] = useState('')
  const [signModal, setSignModal] = useState<BonSortie | null>(null)
  const [signDest, setSignDest] = useState('')
  const [signResp, setSignResp] = useState('')
  const [cancelTarget, setCancelTarget] = useState<BonSortie | null>(null)
  const [printFormat, setPrintFormat] = useState<BonSortie | null>(null)

  const stats = useMemo(() => {
    const enAttente = bons.filter(b => b.status === 'en_attente').length
    const recus = bons.filter(b => b.status === 'recu').length
    const annules = bons.filter(b => b.status === 'annule').length
    const totalValue = bons.filter(b => b.status !== 'annule').reduce((s, b) => s + (b.totalValue || 0), 0)
    return { total: bons.length, enAttente, recus, annules, totalValue }
  }, [bons])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return bons.filter(b => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false
      if (periodFilter !== 'all' && !inPeriod(b.createdAt, periodFilter)) return false
      if (fromFilter !== 'all' && b.fromLocationId !== fromFilter && b.toLocationId !== fromFilter) return false
      if (q) {
        const hay = `${b.number} ${b.fromLocationName} ${b.toLocationName} ${b.destinateurName} ${b.createdByName} ${b.items.map(i => i.productName).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [bons, search, statusFilter, periodFilter, fromFilter])

  const { paginatedItems, ...pag } = usePagination(filtered, 12)

  async function handleRecept() {
    if (!receptModal) return
    try {
      await confirmTransferReception(receptModal.transferId || '', receptName || currentUser?.name || '')
      toast('Réception confirmée, stock ajouté', 'success')
      setReceptModal(null); setReceptName('')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleValidate(bon: BonSortie) {
    try {
      await validateBonSortie(bon.id)
      toast('Bon validé', 'success')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleCancel() {
    if (!cancelTarget) return
    try {
      await cancelBonSortie(cancelTarget.id)
      toast('Bon annulé, stock restitué', 'success')
      setCancelTarget(null)
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleDuplicate(bon: BonSortie) {
    try {
      const copy = await duplicateBonSortie(bon.id)
      toast(`Bon dupliqué : ${copy.number}`, 'success')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleSign() {
    if (!signModal) return
    try {
      await signBonSortie(signModal.id, { destinateur: signDest || undefined, responsable: signResp || undefined })
      toast('Signatures enregistrées', 'success')
      setSignModal(null); setSignDest(''); setSignResp('')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  function openPrint(bon: BonSortie, fmt: 'a4' | 'a5' | 'thermal') {
    printBonSortieDocument(bon, settings || undefined, fmt)
  }

  return (
    <div className="w-full h-full flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/depots')} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-surface-900">Bon de sortie</h1>
          <p className="text-surface-500 text-sm">Documents de sortie de stock générés automatiquement</p>
        </div>
        <Button onClick={() => navigate('/depots')}><Plus className="w-4 h-4" /> Nouveau bon</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600"><FileText className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Total</p><p className="text-lg font-bold text-surface-900">{stats.total}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600"><Clock className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">En attente</p><p className="text-lg font-bold text-surface-900">{stats.enAttente}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600"><CheckCircle2 className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Reçus</p><p className="text-lg font-bold text-surface-900">{stats.recus}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600"><XCircle className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Annulés</p><p className="text-lg font-bold text-surface-900">{stats.annules}</p></div></div></div></Card>
        <Card className="hidden sm:block"><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600"><Truck className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Valeur sortie</p><p className="text-lg font-bold text-surface-900">{formatCurrency(stats.totalValue)}</p></div></div></div></Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="N°, produit, dépôt, utilisateur..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-white">
          <option value="all">Tous les statuts</option>
          <option value="en_attente">En attente</option>
          <option value="valide">Validés</option>
          <option value="recu">Reçus</option>
          <option value="annule">Annulés</option>
        </select>
        <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-white">
          <option value="all">Toutes périodes</option>
          <option value="jour">Aujourd'hui</option>
          <option value="semaine">7 derniers jours</option>
          <option value="mois">Ce mois-ci</option>
          <option value="annee">Cette année</option>
        </select>
        <select value={fromFilter} onChange={e => setFromFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-white">
          <option value="all">Tous les dépôts</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <Card className="overflow-hidden p-0 flex-1">
        <div className="overflow-x-auto responsive-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">N°</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Statut</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Date</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Origine → Destination</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Articles</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Valeur</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems.map(b => {
                const st = statusMeta[b.status] || { label: b.status, badge: 'default' }
                return (
                  <tr key={b.id} className="hover:bg-surface-50 cursor-pointer" onClick={() => setSelected(b)}>
                    <td data-label="N°" className="px-6 py-4 text-sm font-semibold text-[#1e40af]">{b.number}</td>
                    <td data-label="Statut" className="px-6 py-4"><Badge variant={st.badge}>{st.label}</Badge></td>
                    <td data-label="Date" className="px-6 py-4 text-xs text-surface-500 whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
                    <td data-label="Parcours" className="px-6 py-4 text-sm text-surface-700">
                      <span className="font-medium">{b.fromLocationName}</span> → <span className="font-medium">{b.toLocationName}</span>
                      <span className="hidden sm:inline text-xs text-surface-400"> · {b.createdByName}</span>
                    </td>
                    <td data-label="Articles" className="px-6 py-4 text-right text-sm">{b.totalArticles} ({b.totalQuantity})</td>
                    <td data-label="Valeur" className="px-6 py-4 text-right text-sm font-semibold">{b.totalValue ? formatCurrency(b.totalValue) : '—'}</td>
                    <td data-label="Actions" className="px-6 py-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        <button title="Voir" onClick={() => setSelected(b)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Eye className="w-4 h-4" /></button>
                        <button title="Imprimer" onClick={() => setPrintFormat(b)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Printer className="w-4 h-4" /></button>
                        <button title="PDF" onClick={() => { downloadBonSortiePDF(b, settings || undefined, 'a4'); toast('PDF téléchargé', 'success') }} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><FileDown className="w-4 h-4" /></button>
                        <button title="Dupliquer" onClick={() => handleDuplicate(b)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Copy className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {paginatedItems.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-surface-400">Aucun bon de sortie trouvé</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-surface-100">
          <Pagination {...pag} onPageChange={pag.setPage} />
        </div>
      </Card>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Bon de sortie ${selected?.number || ''}`} className="md:max-w-[720px]">
        {selected && (
          <div>
            <BonView bon={selected} settings={settings || undefined} />
            <div className="px-6 pb-6 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setPrintFormat(selected)}><Printer className="w-4 h-4" /> Imprimer</Button>
              <Button variant="outline" onClick={() => { downloadBonSortiePDF(selected, settings || undefined, 'a4'); toast('PDF téléchargé', 'success') }}><FileDown className="w-4 h-4" /> PDF</Button>
              <Button variant="outline" onClick={() => handleDuplicate(selected)}><Copy className="w-4 h-4" /> Dupliquer</Button>
              {canManage && (selected.status === 'en_attente' || selected.status === 'valide') && (
                <Button onClick={() => { setReceptName(currentUser?.name || ''); setReceptModal(selected) }}><CheckCircle2 className="w-4 h-4" /> Confirmer la réception</Button>
              )}
              {canManage && selected.status === 'en_attente' && (
                <Button variant="outline" onClick={() => handleValidate(selected)}><CheckCircle2 className="w-4 h-4" /> Valider</Button>
              )}
              <Button variant="outline" onClick={() => { setSignDest(selected.destinateurName); setSignResp(''); setSignModal(selected) }}><PenLine className="w-4 h-4" /> Signer</Button>
              {canManage && selected.status !== 'recu' && (
                <Button variant="ghost" className="text-red-600" onClick={() => setCancelTarget(selected)}><XCircle className="w-4 h-4" /> Annuler</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!receptModal} onClose={() => setReceptModal(null)} title="Confirmer la réception">
        <div className="p-6 space-y-4">
          <p className="text-sm text-surface-600">
            Le stock de destination <strong>{receptModal?.toLocationName}</strong> sera ajouté et le bon {receptModal?.number} passera au statut <strong>Reçu</strong>.
          </p>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Nom du destinataire</label>
            <input value={receptName} onChange={e => setReceptName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleRecept}>Confirmer la réception</Button>
            <Button variant="ghost" onClick={() => setReceptModal(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!signModal} onClose={() => setSignModal(null)} title={`Signatures — ${signModal?.number || ''}`}>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Signature du destinateur (expéditeur)</label>
            <input value={signDest} onChange={e => setSignDest(e.target.value)} placeholder="Nom du signataire"
              className="w-full px-3 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Signature du responsable (optionnel)</label>
            <input value={signResp} onChange={e => setSignResp(e.target.value)} placeholder="Nom du responsable"
              className="w-full px-3 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleSign}>Enregistrer les signatures</Button>
            <Button variant="ghost" onClick={() => setSignModal(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!cancelTarget} onClose={() => setCancelTarget(null)} title="Annuler le bon de sortie">
        <div className="p-6 space-y-4">
          <p className="text-sm text-surface-600 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            Le bon {cancelTarget?.number} sera annulé et le stock de <strong>{cancelTarget?.fromLocationName}</strong> sera restitué. Cette action est irréversible.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Retour</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleCancel}>Confirmer l'annulation</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!printFormat} onClose={() => setPrintFormat(null)} title={`Imprimer ${printFormat?.number || ''}`}>
        <div className="p-6">
          <p className="text-xs text-surface-500 mb-4">Choisissez un format d'impression. Le document s'ouvrira dans une nouvelle fenêtre.</p>
          <div className="grid gap-2">
            <Button onClick={() => { if (printFormat) openPrint(printFormat, 'a4'); setPrintFormat(null) }}><Printer className="w-4 h-4" /> A4 — Document officiel</Button>
            <Button variant="outline" onClick={() => { if (printFormat) openPrint(printFormat, 'a5'); setPrintFormat(null) }}><Printer className="w-4 h-4" /> A5 — Format réduit</Button>
            <Button variant="outline" onClick={() => { if (printFormat) openPrint(printFormat, 'thermal'); setPrintFormat(null) }}><Printer className="w-4 h-4" /> 80 mm — Imprimante thermique</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
