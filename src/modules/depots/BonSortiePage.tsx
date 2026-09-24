import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGoBack } from '@/hooks/useGoBack'
import { Card, Button, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useIsMobile } from '@/hooks/useIsMobile'
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
  Clock, Truck, PenLine, FileText, AlertTriangle, ArrowRightLeft, User, FilterX
} from 'lucide-react'
import type { BonSortie } from '@/engine/types'
import type { CompanySettings } from '@/types'

const statusMeta: Record<string, { label: string; badge: 'warning' | 'info' | 'success' | 'danger' }> = {
  en_attente: { label: 'En attente', badge: 'warning' },
  valide: { label: 'ValidÃ©', badge: 'info' },
  recu: { label: 'ReÃ§u', badge: 'success' },
  annule: { label: 'AnnulÃ©', badge: 'danger' },
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
          {s.logo ? <img src={s.logo} alt="logo" className="w-10 h-10 rounded-lg object-contain bg-surface-100 p-0.5" /> : <div className="w-10 h-10 rounded-lg bg-surface-100/20 flex items-center justify-center shrink-0"><FileText className="w-5 h-5" /></div>}
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{s.name || 'Entreprise'}</p>
            {s.slogan && <p className="text-[10px] text-white/80 truncate">{s.slogan}</p>}
            {s.address && <p className="text-[10px] text-white/80 truncate">{s.address}</p>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-sm">BON DE SORTIE</p>
          <p className="text-xs text-white/90">NÂ° {bon.number}</p>
          <Badge variant={statusMeta[bon.status]?.badge || 'default'} className="mt-1 text-[10px]">{statusMeta[bon.status]?.label || bon.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-surface-200 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-[#1e40af] uppercase tracking-wider mb-1">Provenance</p>
          <p className="text-sm font-semibold text-surface-900">{bon.fromLocationName}{bon.fromLocationCode ? ` (${bon.fromLocationCode})` : ''}</p>
          <p className="text-xs text-surface-500">{bon.fromAddress || 'Adresse non renseignÃ©e'}</p>
        </div>
        <div className="border border-surface-200 rounded-xl p-3">
          <p className="text-[10px] font-semibold text-[#1e40af] uppercase tracking-wider mb-1">Destination</p>
          <p className="text-sm font-semibold text-surface-900">{bon.toLocationName}{bon.toLocationCode ? ` (${bon.toLocationCode})` : ''}</p>
          <p className="text-xs text-surface-500">{bon.toAddress || 'Adresse non renseignÃ©e'}</p>
        </div>
      </div>

      <div className="text-xs text-surface-600 space-y-1">
        <p><strong>CrÃ©ation :</strong> {formatDate(bon.createdAt)} â€” {bon.createdTime} &nbsp; <strong>ExpÃ©dition :</strong> {bon.shippedAt ? `${formatDate(bon.shippedAt)} â€” ${bon.shippedTime || ''}` : 'â€”'}</p>
        <p><strong>Destinateur :</strong> {bon.destinateurName}{bon.destinateurRole ? ` (${bon.destinateurRole})` : ''} &nbsp; <strong>Destinataire :</strong> {bon.destinataireName || 'â€”'}{bon.destinataireRole ? ` (${bon.destinataireRole})` : ''}</p>
        <p><strong>RÃ©fÃ©rence :</strong> {bon.reference || 'â€”'} &nbsp; <strong>Motif :</strong> {bon.motif || 'â€”'}</p>
        {bon.comments && <p><strong>Observations :</strong> {bon.comments}</p>}
        {bon.validatedAt && <p className="text-emerald-300"><strong>ValidÃ© le :</strong> {formatDateTime(bon.validatedAt)} par {bon.validatedByName || 'â€”'}</p>}
      </div>

      <div className="overflow-x-auto responsive-table rounded-xl border border-surface-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1e40af] text-white text-left text-[10px] uppercase">
              <th className="px-3 py-2">RÃ©f.</th>
              <th className="px-3 py-2">Produit</th>
              <th className="px-3 py-2">QtÃ©</th>
              <th className="px-3 py-2">P.U.</th>
              <th className="px-3 py-2 text-right">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {bon.items.map((it, i) => (
              <tr key={i} className="border-b border-surface-100">
                <td data-label="RÃ©f." className="px-3 py-2 text-xs text-surface-500">{it.reference || 'â€”'}</td>
                <td data-label="Produit" className="px-3 py-2 font-medium text-surface-900">{it.productName}</td>
                <td data-label="QtÃ©" className="px-3 py-2">{it.quantity} {it.unit || ''}</td>
                <td data-label="P.U." className="px-3 py-2">{it.unitPrice ? formatCurrency(it.unitPrice) : 'â€”'}</td>
                <td data-label="Valeur" className="px-3 py-2 text-right font-semibold">{it.total ? formatCurrency(it.total) : 'â€”'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-sm font-semibold text-surface-900">
        <span>Articles : {bon.totalArticles}</span>
        <span>QuantitÃ© : {bon.totalQuantity}</span>
        {bon.totalValue ? <span>Valeur : {formatCurrency(bon.totalValue)}</span> : null}
      </div>

      <div className="text-xs text-surface-600">
        {bon.receivedAt ? (
          <p className="text-emerald-300"><strong>ReÃ§u le :</strong> {formatDateTime(bon.receivedAt)} par {bon.receivedBy || 'â€”'}</p>
        ) : (
          <p className="text-amber-400"><strong>RÃ©ception non confirmÃ©e</strong></p>
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
  const goBack = useGoBack()
  const isMobile = useIsMobile()
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
      toast('RÃ©ception confirmÃ©e, stock ajoutÃ©', 'success')
      setReceptModal(null); setReceptName('')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleValidate(bon: BonSortie) {
    try {
      await validateBonSortie(bon.id)
      toast('Bon validÃ©', 'success')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleCancel() {
    if (!cancelTarget) return
    try {
      await cancelBonSortie(cancelTarget.id)
      toast('Bon annulÃ©, stock restituÃ©', 'success')
      setCancelTarget(null)
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleDuplicate(bon: BonSortie) {
    try {
      const copy = await duplicateBonSortie(bon.id)
      toast(`Bon dupliquÃ© : ${copy.number}`, 'success')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  async function handleSign() {
    if (!signModal) return
    try {
      await signBonSortie(signModal.id, { destinateur: signDest || undefined, responsable: signResp || undefined })
      toast('Signatures enregistrÃ©es', 'success')
      setSignModal(null); setSignDest(''); setSignResp('')
    } catch (e: any) { toast(e.message || 'Erreur', 'error') }
  }

  function openPrint(bon: BonSortie, fmt: 'a4' | 'a5' | 'thermal') {
    printBonSortieDocument(bon, settings || undefined, fmt)
  }

  return (
    <div className="w-full h-full flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={goBack} className="p-2 rounded-xl hover:bg-surface-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-surface-900">Bon de sortie</h1>
          <p className="text-surface-500 text-sm">Documents de sortie de stock gÃ©nÃ©rÃ©s automatiquement</p>
        </div>
        <Button onClick={() => navigate('/depots')}><Plus className="w-4 h-4" /> Nouveau bon</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-400"><FileText className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Total</p><p className="text-lg font-bold text-surface-900">{stats.total}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400"><Clock className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">En attente</p><p className="text-lg font-bold text-surface-900">{stats.enAttente}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center text-green-400"><CheckCircle2 className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">ReÃ§us</p><p className="text-lg font-bold text-surface-900">{stats.recus}</p></div></div></div></Card>
        <Card><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center text-red-400"><XCircle className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">AnnulÃ©s</p><p className="text-lg font-bold text-surface-900">{stats.annules}</p></div></div></div></Card>
        <Card className="hidden sm:block"><div className="p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400"><Truck className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Valeur sortie</p><p className="text-lg font-bold text-surface-900">{formatCurrency(stats.totalValue)}</p></div></div></div></Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="NÂ°, produit, dÃ©pÃ´t, utilisateur..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-surface-100">
          <option value="all">Tous les statuts</option>
          <option value="en_attente">En attente</option>
          <option value="valide">ValidÃ©s</option>
          <option value="recu">ReÃ§us</option>
          <option value="annule">AnnulÃ©s</option>
        </select>
        <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-surface-100">
          <option value="all">Toutes pÃ©riodes</option>
          <option value="jour">Aujourd'hui</option>
          <option value="semaine">7 derniers jours</option>
          <option value="mois">Ce mois-ci</option>
          <option value="annee">Cette annÃ©e</option>
        </select>
        <select value={fromFilter} onChange={e => setFromFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-surface-300 text-sm bg-surface-100">
          <option value="all">Tous les dÃ©pÃ´ts</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {(search || statusFilter !== 'all' || periodFilter !== 'all' || fromFilter !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-500/10 border border-primary-500/30 text-xs font-medium text-primary-700">
            <FilterX className="w-3 h-3" />
            Filtres actifs
          </span>
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setPeriodFilter('all'); setFromFilter('all') }}
            className="px-3 py-1 rounded-lg bg-surface-100 border border-surface-300 text-xs font-medium text-surface-600 hover:bg-surface-50"
          >
            RÃ©initialiser
          </button>
        </div>
      )}

      {isMobile ? (
        <div className="flex flex-col gap-3 w-full">
          {paginatedItems.map(b => {
            const st = statusMeta[b.status] || { label: b.status, badge: 'default' }
            return (
              <div key={b.id} className="bg-surface-100 rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
                <button className="w-full text-left p-4" onClick={() => setSelected(b)}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-bold text-[#1e40af]">{b.number}</span>
                    <Badge variant={st.badge}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-surface-700 mb-1">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-surface-400 shrink-0" />
                    <span className="truncate"><span className="font-medium">{b.fromLocationName}</span> â†’ <span className="font-medium">{b.toLocationName}</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-surface-500 mb-1.5">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>{formatDateTime(b.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-surface-500 mb-2">
                    <User className="w-3 h-3 shrink-0" />
                    <span>{b.createdByName || 'â€”'}</span>
                    <span className="ml-auto text-xs text-surface-400">{b.totalArticles} art. Â· {b.totalQuantity} qtÃ©</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-surface-900">{b.totalValue ? formatCurrency(b.totalValue) : 'â€”'}</span>
                  </div>
                </button>
                <div className="flex items-center gap-2 px-4 pb-4 border-t border-surface-100 pt-3">
                  <button onClick={() => setSelected(b)} className="flex-1 min-h-[40px] rounded-xl bg-surface-50 border border-surface-200 text-xs font-semibold text-surface-600 flex items-center justify-center gap-1.5 active:scale-[0.98]"><Eye className="w-4 h-4" /> Voir</button>
                  <button onClick={() => setPrintFormat(b)} className="flex-1 min-h-[40px] rounded-xl bg-surface-50 border border-surface-200 text-xs font-semibold text-surface-600 flex items-center justify-center gap-1.5 active:scale-[0.98]"><Printer className="w-4 h-4" /> Imprimer</button>
                  <button onClick={() => handleDuplicate(b)} className="flex-1 min-h-[40px] rounded-xl bg-surface-50 border border-surface-200 text-xs font-semibold text-surface-600 flex items-center justify-center gap-1.5 active:scale-[0.98]"><Copy className="w-4 h-4" /> Dupliquer</button>
                </div>
              </div>
            )
          })}
          {paginatedItems.length === 0 && (
            <div className="bg-surface-100 rounded-2xl border border-surface-200 py-12 text-center text-surface-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">Aucun bon de sortie trouvÃ©</p>
              {(search || statusFilter !== 'all' || periodFilter !== 'all' || fromFilter !== 'all') && (
                <button onClick={() => { setSearch(''); setStatusFilter('all'); setPeriodFilter('all'); setFromFilter('all') }}
                  className="mt-3 px-4 py-2 rounded-xl bg-surface-50 border border-surface-300 text-xs font-medium text-surface-600">
                  RÃ©initialiser les filtres
                </button>
              )}
            </div>
          )}
          <Pagination {...pag} onPageChange={pag.setPage} />
        </div>
      ) : (
        <Card className="overflow-hidden p-0 lg:flex-1">
          <div className="overflow-x-auto responsive-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">NÂ°</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Statut</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Date</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase px-6 py-4">Origine â†’ Destination</th>
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
                      <td data-label="NÂ°" className="px-6 py-4 text-sm font-semibold text-[#1e40af]">{b.number}</td>
                      <td data-label="Statut" className="px-6 py-4"><Badge variant={st.badge}>{st.label}</Badge></td>
                      <td data-label="Date" className="px-6 py-4 text-xs text-surface-500 whitespace-nowrap">{formatDateTime(b.createdAt)}</td>
                      <td data-label="Parcours" className="px-6 py-4 text-sm text-surface-700">
                        <span className="font-medium">{b.fromLocationName}</span> â†’ <span className="font-medium">{b.toLocationName}</span>
                        <span className="hidden sm:inline text-xs text-surface-400"> Â· {b.createdByName}</span>
                      </td>
                      <td data-label="Articles" className="px-6 py-4 text-right text-sm">{b.totalArticles} ({b.totalQuantity})</td>
                      <td data-label="Valeur" className="px-6 py-4 text-right text-sm font-semibold">{b.totalValue ? formatCurrency(b.totalValue) : 'â€”'}</td>
                      <td data-label="Actions" className="px-6 py-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex gap-1">
                          <button title="Voir" onClick={() => setSelected(b)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Eye className="w-4 h-4" /></button>
                          <button title="Imprimer" onClick={() => setPrintFormat(b)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Printer className="w-4 h-4" /></button>
                          <button title="PDF" onClick={() => { downloadBonSortiePDF(b, settings || undefined, 'a4'); toast('PDF tÃ©lÃ©chargÃ©', 'success') }} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><FileDown className="w-4 h-4" /></button>
                          <button title="Dupliquer" onClick={() => handleDuplicate(b)} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-500"><Copy className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {paginatedItems.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-surface-400">Aucun bon de sortie trouvÃ©</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-surface-100">
            <Pagination {...pag} onPageChange={pag.setPage} />
          </div>
        </Card>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Bon de sortie ${selected?.number || ''}`} className="md:max-w-[720px]">
        {selected && (
          <div>
            <BonView bon={selected} settings={settings || undefined} />
            <div className="px-6 pb-6 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setPrintFormat(selected)}><Printer className="w-4 h-4" /> Imprimer</Button>
              <Button variant="outline" onClick={() => { downloadBonSortiePDF(selected, settings || undefined, 'a4'); toast('PDF tÃ©lÃ©chargÃ©', 'success') }}><FileDown className="w-4 h-4" /> PDF</Button>
              <Button variant="outline" onClick={() => handleDuplicate(selected)}><Copy className="w-4 h-4" /> Dupliquer</Button>
              {canManage && (selected.status === 'en_attente' || selected.status === 'valide') && (
                <Button onClick={() => { setReceptName(currentUser?.name || ''); setReceptModal(selected) }}><CheckCircle2 className="w-4 h-4" /> Confirmer la rÃ©ception</Button>
              )}
              {canManage && selected.status === 'en_attente' && (
                <Button variant="outline" onClick={() => handleValidate(selected)}><CheckCircle2 className="w-4 h-4" /> Valider</Button>
              )}
              <Button variant="outline" onClick={() => { setSignDest(selected.destinateurName); setSignResp(''); setSignModal(selected) }}><PenLine className="w-4 h-4" /> Signer</Button>
              {canManage && selected.status !== 'recu' && selected.status !== 'annule' && (
                <Button variant="ghost" className="text-red-400" onClick={() => setCancelTarget(selected)}><XCircle className="w-4 h-4" /> Annuler</Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!receptModal} onClose={() => setReceptModal(null)} title="Confirmer la rÃ©ception">
        <div className="p-6 space-y-4">
          <p className="text-sm text-surface-600">
            Le stock de destination <strong>{receptModal?.toLocationName}</strong> sera ajoutÃ© et le bon {receptModal?.number} passera au statut <strong>ReÃ§u</strong>.
          </p>
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Nom du destinataire</label>
            <input value={receptName} onChange={e => setReceptName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-surface-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleRecept}>Confirmer la rÃ©ception</Button>
            <Button variant="ghost" onClick={() => setReceptModal(null)}>Annuler</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!signModal} onClose={() => setSignModal(null)} title={`Signatures â€” ${signModal?.number || ''}`}>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Signature du destinateur (expÃ©diteur)</label>
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
            Le bon {cancelTarget?.number} sera annulÃ© et le stock de <strong>{cancelTarget?.fromLocationName}</strong> sera restituÃ©. Cette action est irrÃ©versible.
          </p>
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Retour</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleCancel}>Confirmer l'annulation</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!printFormat} onClose={() => setPrintFormat(null)} title={`Imprimer ${printFormat?.number || ''}`}>
        <div className="p-6">
          <p className="text-xs text-surface-500 mb-4">Choisissez un format d'impression. Le document s'ouvrira dans une nouvelle fenÃªtre.</p>
          <div className="grid gap-2">
            <Button onClick={() => { if (printFormat) openPrint(printFormat, 'a4'); setPrintFormat(null) }}><Printer className="w-4 h-4" /> A4 â€” Document officiel</Button>
            <Button variant="outline" onClick={() => { if (printFormat) openPrint(printFormat, 'a5'); setPrintFormat(null) }}><Printer className="w-4 h-4" /> A5 â€” Format rÃ©duit</Button>
            <Button variant="outline" onClick={() => { if (printFormat) openPrint(printFormat, 'thermal'); setPrintFormat(null) }}><Printer className="w-4 h-4" /> 80 mm â€” Imprimante thermique</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
