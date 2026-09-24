import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { formatCurrency, formatDate } from '@/lib/utils'
import { treasury } from '@/engine/dashboardStats'
import { cashOutNatureLabel } from '@/engine/cash'
import {
  DATE_RANGE_OPTIONS, getDateRangePeriod, inDateRange,
} from '@/lib/dateRange'
import {
  CashBox, cashBoxLabel, cashBoxOfCashBookEntry, cashBoxOfCashOp,
} from '@/engine/cashboxes'
import { Wallet, ArrowUpRight, ArrowDownRight, Scale, Filter, Landmark, Plus } from 'lucide-react'
import type { RecentTx } from '@/engine/dashboardStats'
import type { CashBookEntry, CashOperation } from '@/types'

const ORIGIN_LABELS: Record<string, string> = {
  'Encaissement vente': 'Vente',
  'Acompte crédit': 'Acompte sur vente',
  'Paiement mixte': 'Paiement partiel',
  'Encaissement crédit': 'Règlement crédit',
  'Encaissement livraison': 'Encaissement livraison',
}

function originOf(e: CashBookEntry | CashOperation): string {
  if ('category' in e) {
    if (e.linkedId) return ORIGIN_LABELS[e.category] || 'Caisse'
    return e.type === 'in' ? 'Entrée caisse' : 'Sortie caisse'
  }
  return e.type === 'in' ? 'Entrée cash' : 'Sortie cash'
}

const ALL_BOXES: (CashBox | 'all')[] = ['all', 'boutique', 'livraison', 'cash']

export default function TreasuryPage() {
  const navigate = useNavigate()
  const businessId = useBusinessId()
  const [period, setPeriod] = useState<string>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [box, setBox] = useState<CashBox | 'all'>('all')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [mobileMovementsOpen, setMobileMovementsOpen] = useState(false)

  const cashBookRaw = useLiveQuery(() => db.cashBook.where('businessId').equals(businessId).toArray(), [businessId])
  const cashOpsRaw = useLiveQuery(() => db.cashOps.where('businessId').equals(businessId).toArray(), [businessId])
  const usersRaw = useLiveQuery(() => db.users.where('businessId').equals(businessId).toArray(), [businessId])
  const salesRaw = useLiveQuery(() => db.sales.where('businessId').equals(businessId).toArray(), [businessId])
  const locationsRaw = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId])

  const userNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of usersRaw || []) {
      m.set(u.id, u.name || u.loginId || 'Utilisateur')
      if (u.authUserId) m.set(u.authUserId, u.name || u.loginId || 'Utilisateur')
    }
    return m
  }, [usersRaw])

  const locationsById = useMemo(() => new Map((locationsRaw || []).map(l => [l.id, l])), [locationsRaw])
  const salesById = useMemo(() => new Map((salesRaw || []).map(s => [s.id, s])), [salesRaw])

  const bounds = useMemo(() => {
    if (period === 'all') return { start: new Date(0), end: new Date() }
    const p = getDateRangePeriod(period as any, customStart, customEnd)
    return p || { start: new Date(0), end: new Date() }
  }, [period, customStart, customEnd])

  const periodLabel = useMemo(() => {
    if (period === 'all') return 'Toutes les dates'
    if (period === 'custom') {
      if (!customStart || !customEnd) return 'Période personnalisée'
      return `${formatDate(customStart)} → ${formatDate(customEnd)}`
    }
    const opt = DATE_RANGE_OPTIONS.find(o => o.value === period)
    return opt?.label || 'Période'
  }, [period, customStart, customEnd])

  const boxedCashBook = useMemo(() => {
    return (cashBookRaw || []).filter(e => box === 'all' || cashBoxOfCashBookEntry(e, salesById, locationsById) === box)
  }, [cashBookRaw, box, salesById, locationsById])

  const boxedCashOps = useMemo(() => {
    return (cashOpsRaw || []).filter(o => box === 'all' || cashBoxOfCashOp(o, locationsById) === box)
  }, [cashOpsRaw, box, locationsById])

  const summary = useMemo(() => treasury(boxedCashBook, boxedCashOps, bounds.start, bounds.end), [boxedCashBook, boxedCashOps, bounds])

  const movements: RecentTx[] = useMemo(() => {
    const txns: RecentTx[] = []
    for (const e of boxedCashBook) {
      txns.push({
        id: `cb-${e.id}`,
        kind: e.type === 'in' ? 'cashbook_in' : 'cashbook_out',
        label: originOf(e),
        ref: e.reference || '',
        amount: e.amount,
        date: e.date,
        party: e.partyName,
        userId: e.userId,
      })
    }
    for (const o of boxedCashOps) {
      if (o.status === 'cancelled') continue
      txns.push({
        id: `op-${o.id}`,
        kind: o.type === 'in' ? 'cash_in' : 'cash_out',
        label: `${originOf(o)}${o.type === 'out' ? ` · ${cashOutNatureLabel(o.nature)}` : ''}`,
        ref: o.reference || o.number || '',
        amount: o.amount,
        date: o.date,
        party: o.partyName,
        userId: o.userId,
      })
    }
    return txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [boxedCashBook, boxedCashOps])

  const filtered = useMemo(() => {
    let result = movements.filter(m => inDateRange(m.date, { start: boundsDateStr(bounds.start), end: boundsDateStr(bounds.end) }))
    if (filter !== 'all') result = result.filter(m => m.kind.endsWith(filter === 'in' ? '_in' : '_out'))
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(m =>
        m.label.toLowerCase().includes(q) ||
        m.ref.toLowerCase().includes(q) ||
        (m.party || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [movements, bounds, filter, search])

  return (
    <div className="w-full min-h-full flex flex-col gap-6 pb-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Trésorerie</h1>
          <p className="text-surface-500 text-sm mt-1">
            Tous les mouvements d'argent : ventes, règlements de crédits, entrées et sorties de caisse.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate('/cash')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-500 text-on-accent text-xs font-bold shadow-sm hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" /> Ajouter <span className="hidden sm:inline">une opération</span>
          </button>
          <div className="hidden lg:flex items-center gap-2">
            <Filter className="w-4 h-4 text-surface-400" />
            <div className="flex bg-surface-100 rounded-xl p-1 flex-wrap">
              {ALL_BOXES.map((b) => (
                <button
                  key={b}
                  onClick={() => setBox(b as any)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${box === b ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}
                >
                  {b === 'all' ? 'Toutes caisses' : cashBoxLabel(b)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-surface-500">Période : {periodLabel}</span>
        <button
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-100 border border-surface-200 text-xs font-semibold text-surface-700"
        >
          <Filter className="w-3.5 h-3.5" /> {mobileFiltersOpen ? 'Masquer les filtres' : 'Filtres'}
        </button>
      </div>

      <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between`}>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
          <div className="hidden lg:flex items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {DATE_RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {period === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date" value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-surface-400 text-xs">→</span>
              <input
                type="date" value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          )}
          <span className="text-xs text-surface-400 font-medium">Période : {periodLabel}</span>
          </div>
          <div className="lg:hidden flex items-center gap-2">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {DATE_RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Filter className="w-4 h-4 text-surface-400" />
            <div className="flex bg-surface-100 rounded-xl p-1 flex-wrap">
              {ALL_BOXES.map((b) => (
                <button
                  key={b}
                  onClick={() => setBox(b as any)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${box === b ? 'bg-white text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}
                >
                  {b === 'all' ? 'Toutes' : cashBoxLabel(b)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {box !== 'all' && (
          <span className="text-xs font-semibold text-primary-500 bg-primary-500/10 rounded-lg px-3 py-1.5 self-start">
            Caisse : {cashBoxLabel(box)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 lg:gap-3">
        <div className="p-3 lg:p-4 rounded-2xl bg-success/10 border border-success/20">
          <p className="text-xs text-surface-400 flex items-center gap-1"><ArrowUpRight className="w-3.5 h-3.5 text-success" /> Entrées <span className="hidden sm:inline">(période)</span></p>
          <p className="text-lg font-bold text-success">{formatCurrency(summary.inflows)}</p>
        </div>
        <div className="p-3 lg:p-4 rounded-2xl bg-danger/10 border border-danger/20">
          <p className="text-xs text-surface-400 flex items-center gap-1"><ArrowDownRight className="w-3.5 h-3.5 text-danger" /> Sorties <span className="hidden sm:inline">(période)</span></p>
          <p className="text-lg font-bold text-danger">{formatCurrency(summary.outflows)}</p>
        </div>
        <div className="hidden lg:block p-4 rounded-2xl bg-surface-100 border border-surface-200">
          <p className="text-xs text-surface-400 flex items-center gap-1"><Scale className="w-3.5 h-3.5" /> Net (période)</p>
          <p className={`text-lg font-bold ${summary.balance >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(summary.balance)}</p>
        </div>
        <div className="order-first lg:order-none p-3 lg:p-4 rounded-2xl bg-primary-500/10 border border-primary-200">
          <p className="text-xs text-primary-400 flex items-center gap-1"><Wallet className="w-3.5 h-3.5" /> Solde <span className="hidden sm:inline">{period === 'today' ? 'du jour' : 'de la période'}</span></p>
          <p className={`text-lg font-bold ${summary.runningBalance >= 0 ? 'text-primary-600' : 'text-danger'}`}>{formatCurrency(summary.runningBalance)}</p>
        </div>
      </div>

      {box === 'all' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['boutique', 'livraison', 'cash'] as CashBox[]).map(b => (
            <div key={b} className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
              <div className="flex items-center gap-2">
                <Landmark className={`w-4 h-4 ${b === 'boutique' ? 'text-primary-500' : b === 'livraison' ? 'text-emerald-500' : 'text-amber-500'}`} />
                <p className="text-sm font-semibold text-surface-900">{cashBoxLabel(b)}</p>
              </div>
              <p className="mt-2 text-[11px] text-surface-400">Solde {period === 'today' ? 'du jour' : 'de la période'}</p>
              <p className={`text-xl font-bold ${balanceOf(b) >= 0 ? 'text-surface-900' : 'text-danger'}`}>{formatCurrency(balanceOf(b))}</p>
            </div>
          ))}
        </div>
      )}

      <div className={`${mobileFiltersOpen ? 'flex' : 'hidden'} lg:flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between`}>
        <div className="flex items-center gap-2">
          {([['all', 'Toutes'], ['in', 'Entrées'], ['out', 'Sorties']] as const).map(tab => (
            <button
              key={tab[0]}
              onClick={() => setFilter(tab[0])}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === tab[0] ? 'bg-primary-500 text-on-accent shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
            >
              {tab[1]}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Rechercher par origine, référence, tiers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-72 px-4 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      <div className="lg:hidden flex items-center justify-between rounded-2xl border border-surface-200 bg-surface-100 px-4 py-3">
        <span className="text-sm font-semibold text-surface-900">Mouvements récents</span>
        <button
          onClick={() => setMobileMovementsOpen(!mobileMovementsOpen)}
          className="text-xs font-semibold text-primary-500"
        >
          {mobileMovementsOpen ? 'Masquer' : 'Voir les détails'}
        </button>
      </div>

      <div className={`${mobileMovementsOpen ? 'block' : 'hidden'} lg:block overflow-hidden rounded-2xl border border-surface-200 bg-surface-100`}>
        <div className="responsive-table overflow-x-auto">
          <table className="w-full text-sm min-w-0 sm:min-w-[640px]">
            <thead>
              <tr className="text-xs text-surface-400 border-b border-surface-200 bg-surface-50">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Origine / Référence</th>
                <th className="text-left px-4 py-3 font-medium">Tiers</th>
                <th className="text-left px-4 py-3 font-medium">Utilisateur</th>
                <th className="text-right px-4 py-3 font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map(m => (
                <tr key={m.id} className="border-b border-surface-100 hover:bg-surface-50 transition-colors">
                  <td data-label="Date" className="px-4 py-3 text-surface-500 whitespace-nowrap">{formatDate(m.date)}</td>
                  <td data-label="Type" className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg ${m.kind.includes('in') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                      {m.kind.includes('in') ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {m.label}
                    </span>
                  </td>
                  <td data-label="Référence" className="px-4 py-3 text-surface-900 font-medium">{m.ref || '—'}</td>
                  <td data-label="Tiers" className="px-4 py-3 text-surface-500">{m.party || '—'}</td>
                  <td data-label="Utilisateur" className="px-4 py-3 text-surface-500">{userNames.get(m.userId || '') || '—'}</td>
                  <td data-label="Montant" className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${m.kind.includes('in') ? 'text-success' : 'text-danger'}`}>
                    {m.kind.includes('in') ? '+' : '−'}{formatCurrency(m.amount)}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-surface-400 text-sm">Aucun mouvement sur cette période</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  function boundsDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function balanceOf(b: CashBox): number {
    const range = { start: boundsDateStr(bounds.start), end: boundsDateStr(bounds.end) }
    let bal = 0
    for (const e of cashBookRaw || []) {
      if (!inDateRange(e.date, range)) continue
      if (cashBoxOfCashBookEntry(e, salesById, locationsById) !== b) continue
      bal += e.type === 'in' ? e.amount : -e.amount
    }
    for (const o of cashOpsRaw || []) {
      if (o.status === 'cancelled' || !inDateRange(o.date, range)) continue
      if (cashBoxOfCashOp(o, locationsById) !== b) continue
      bal += o.type === 'in' ? o.amount : -o.amount
    }
    return bal
  }
}
