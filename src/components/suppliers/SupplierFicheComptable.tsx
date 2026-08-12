import { useMemo, useRef, useState } from 'react'
import { Search, FileText, CalendarPlus, MessageCircle, Send, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'

export interface FicheRow {
  date: string
  label: string
  reference: string
  debit: number
  credit: number
  balance: number
}

export interface FicheTotals {
  debit: number
  credit: number
  balance: number
}

interface Props {
  rows: FicheRow[]
  totals: FicheTotals
  title?: string
  emptyText?: string
  contactName?: string
  partyLabel?: string
  onRapport?: () => void
  onRappel?: () => void
  onSms?: () => void
  onGive?: () => void
  onReceive?: () => void
}

function formatLongDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const dayName = d.toLocaleDateString('fr-FR', { weekday: 'long' })
  const datePart = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  const hours = d.getHours()
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 || 12
  const time = `${String(h12).padStart(2, '0')}:${minutes} ${ampm}`
  return `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)} ${datePart} à ${time}`
}

function entryKind(label: string): 'argent' | 'produits' {
  const l = label.toLowerCase()
  if (l.includes('paiement')) return 'argent'
  return 'produits'
}

export default function SupplierFicheComptable({
  rows, totals, title, emptyText,
  contactName = 'Fournisseur',
  partyLabel = 'Fournisseur',
  onRapport, onRappel, onSms, onGive, onReceive,
}: Props) {
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const dateInputRef = useRef<HTMLInputElement>(null)

  const givenTotal = totals.debit
  const receivedTotal = totals.credit
  const net = givenTotal - receivedTotal

  const enriched = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    let running = 0
    const withNet = sorted.map(r => {
      running += r.debit - r.credit
      return { ...r, running }
    })
    return withNet.reverse()
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return enriched.filter(r => {
      if (fromDate && r.date.slice(0, 10) < fromDate) return false
      if (!q) return true
      return (
        r.label.toLowerCase().includes(q) ||
        (r.reference || '').toLowerCase().includes(q) ||
        formatLongDateTime(r.date).toLowerCase().includes(q)
      )
    })
  }, [enriched, query, fromDate])

  const showActions = onGive || onReceive

  return (
    <div>
      {title && (
        <div className="px-4 pt-4">
          <p className="text-sm font-bold text-surface-900">{title}</p>
        </div>
      )}

      {/* En-tête */}
      <div className="m-4 rounded-2xl bg-surface-950 overflow-hidden border border-surface-300/30 shadow-xl">
        <div className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-base font-extrabold text-surface-900">
              {contactName}{' '}
              <span className="text-danger">{partyLabel}</span>
            </p>
          </div>
          <p className="text-[11px] text-surface-500 mt-0.5">Cliquez ici pour voir les paramètres</p>

          <div className="mt-4 text-center">
            <p className="text-3xl sm:text-4xl font-black text-danger tracking-tight">
              {formatCurrency(net)}
            </p>
            <p className="text-xs text-surface-500 mt-1">
              {net >= 0 ? 'Vous me devez' : 'Vous obtiendrez'}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
            <button
              onClick={onRapport}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-surface-50/60 border border-surface-300/30 hover:bg-surface-50 active:scale-[0.97] transition-all"
            >
              <FileText className="w-5 h-5 text-warning" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-surface-500">Rapport</span>
            </button>
            <button
              onClick={() => { dateInputRef.current?.showPicker?.() || dateInputRef.current?.click() }}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-surface-50/60 border border-surface-300/30 hover:bg-surface-50 active:scale-[0.97] transition-all"
            >
              <CalendarPlus className="w-5 h-5 text-warning" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-surface-500">Définir la date</span>
            </button>
            <button
              onClick={onRappel}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-surface-50/60 border border-surface-300/30 hover:bg-surface-50 active:scale-[0.97] transition-all"
            >
              <MessageCircle className="w-5 h-5 text-warning" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-surface-500">Rappel</span>
            </button>
            <button
              onClick={onSms}
              className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-surface-50/60 border border-surface-300/30 hover:bg-surface-50 active:scale-[0.97] transition-all"
            >
              <Send className="w-5 h-5 text-warning" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-surface-500">SMS</span>
            </button>
          </div>
        </div>
        <input
          ref={dateInputRef}
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {/* Recherche */}
      <div className="px-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Recherche à partir de..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-surface-300 bg-surface-50 text-sm text-surface-900 placeholder-surface-400 outline-none focus:border-primary-500 transition-colors"
          />
        </div>
        {fromDate && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-500/10 border border-primary-500/30 text-xs font-medium text-primary-600">
            <CalendarPlus className="w-3 h-3" />
            À partir du {new Date(fromDate + 'T00:00:00').toLocaleDateString('fr-FR')}
            <button onClick={() => setFromDate('')} className="ml-1 hover:text-danger transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* En-têtes de colonnes */}
      <div className="mt-3 mx-4 grid grid-cols-[1fr_90px_90px] sm:grid-cols-[1fr_130px_130px] gap-2 px-3 py-2 rounded-xl bg-surface-50 border border-surface-200">
        <span className="text-[10px] font-bold uppercase tracking-wider text-surface-500 self-center">Entrées</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-danger text-center bg-danger/10 rounded-lg px-1 py-1.5">Vous avez donné</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-success text-right">Vous avez reçu</span>
      </div>

      {/* Historique */}
      {filtered.length === 0 ? (
        <p className="text-sm text-surface-400 text-center py-10">
          {emptyText || 'Aucune opération'}
        </p>
      ) : (
        <div className="px-4 pb-2">
          {filtered.map((r, idx) => {
            const isGiven = r.debit > 0
            const kind = entryKind(r.label)
            return (
              <div
                key={idx}
                className={cn(
                  'grid grid-cols-[1fr_90px_90px] sm:grid-cols-[1fr_130px_130px] gap-2 px-3 py-3 border-b border-surface-200/70',
                  idx % 2 === 0 ? 'bg-surface-50/40' : 'bg-surface-100/40'
                )}
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-surface-900">{formatLongDateTime(r.date)}</p>
                  <p className="text-[11px] text-surface-500 truncate mt-0.5">
                    {r.label}
                    {r.reference && <span className="text-surface-400"> · {r.reference}</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide',
                      isGiven ? 'bg-danger/15 text-danger' : 'bg-success/15 text-success'
                    )}>
                      {isGiven ? 'Décaisser' : 'Encaisser'}
                    </span>
                    <span className="text-[10px] text-surface-400">
                      Bal. {formatCurrency(r.running)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col justify-center items-center">
                  {isGiven ? (
                    <>
                      <p className="text-sm font-extrabold text-danger">{formatCurrency(r.debit)}</p>
                      <p className="text-[9px] text-danger/70 mt-0.5">{kind === 'argent' ? 'argent donné' : 'produits donnés'}</p>
                    </>
                  ) : (
                    <span className="text-surface-300">—</span>
                  )}
                </div>
                <div className="flex flex-col justify-center items-end">
                  {!isGiven && r.credit > 0 ? (
                    <>
                      <p className="text-sm font-extrabold text-success">{formatCurrency(r.credit)}</p>
                      <p className="text-[9px] text-success/70 mt-0.5">{kind === 'argent' ? 'argent reçu' : 'produits reçus'}</p>
                    </>
                  ) : (
                    <span className="text-surface-300">—</span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Totaux */}
          <div className="mt-3 grid grid-cols-[1fr_90px_90px] sm:grid-cols-[1fr_130px_130px] gap-2 px-3 py-3 rounded-2xl bg-surface-50 border border-surface-200">
            <span className="text-xs font-bold text-surface-900 self-center">TOTAL</span>
            <span className="text-sm font-extrabold text-danger text-center">{formatCurrency(givenTotal)}</span>
            <span className="text-sm font-extrabold text-success text-right">{formatCurrency(receivedTotal)}</span>
          </div>
        </div>
      )}

      {/* Boutons d'action */}
      {showActions && (
        <div className="p-4 grid grid-cols-2 gap-3">
          {onGive && (
            <button
              onClick={onGive}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-danger text-white text-xs font-extrabold uppercase tracking-wider active:scale-[0.98] transition-all shadow-lg shadow-danger/20"
            >
              <ArrowDownLeft className="w-4 h-4" /> Vous avez donné
            </button>
          )}
          {onReceive && (
            <button
              onClick={onReceive}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-success text-white text-xs font-extrabold uppercase tracking-wider active:scale-[0.98] transition-all shadow-lg shadow-success/20"
            >
              <ArrowUpRight className="w-4 h-4" /> Vous avez reçu
            </button>
          )}
        </div>
      )}
    </div>
  )
}
