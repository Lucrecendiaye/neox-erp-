import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Modal, Badge, Select } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { formatCurrency, formatDateTime, openWhatsApp } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { createLoan, repayLoan, partyLoanSummary, listLoans } from '@/engine/loan'
import { addCustomerEntry, refundAdvance, buildCustomerStatement, buildStatementWhatsAppMessage, buildOverdueWhatsAppMessage, recordOverdueNotification } from '@/engine/customerAccount'
import { ensureReminder, markReminderDone, postponeReminder, computeReminderStatus } from '@/engine/reminders'
import { exportCustomerStatementPDF, exportSalePDF, shareSalePDF } from '@/lib/pdf'
import {
  Phone, Mail, MapPin, X, Wallet, ShoppingBag, CreditCard, HandCoins,
  BellRing, History as HistoryIcon, Banknote, Plus, ChevronRight, Check,
  FileText, ArrowDownCircle, ArrowUpCircle, MessageCircle, Send,
} from 'lucide-react'
import type { Customer } from '@/types'

type Tab = 'overview' | 'history' | 'sales' | 'credits' | 'payments' | 'loans' | 'reminders'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Vue d’ensemble' },
  { key: 'history', label: 'Historique' },
  { key: 'sales', label: 'Ventes' },
  { key: 'credits', label: 'Dettes & crédits' },
  { key: 'payments', label: 'Paiements' },
  { key: 'loans', label: 'Prêts' },
  { key: 'reminders', label: 'Rappels' },
]

export default function CustomerFiche({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const businessId = useBusinessId()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const settings = useLiveQuery(() => db.settings.get('default'), [])

  const sales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).filter(s => s.customerId === customer.id).toArray(), [businessId, customer.id]) ?? []
  const credits = useLiveQuery(() => db.credits.where('businessId').equals(businessId).filter(c => c.customerId === customer.id).toArray(), [businessId, customer.id]) ?? []
  const creditPayments = useLiveQuery(() => db.creditPayments.where('businessId').equals(businessId).filter(p => p.customerId === customer.id).toArray(), [businessId, customer.id]) ?? []
  const loans = useLiveQuery(() => db.loans.where('partyId').equals(customer.id).toArray(), [customer.id]) ?? []
  const loanPayments = useLiveQuery(() => db.loanPayments.where('partyId').equals(customer.id).toArray(), [customer.id]) ?? []
  const reminders = useLiveQuery(() => db.reminders.where('customerId').equals(customer.id).toArray(), [customer.id]) ?? []
  const customerEntries = useLiveQuery(() => db.customerEntries.where('customerId').equals(customer.id).toArray(), [customer.id]) ?? []
  const reports = useLiveQuery(() => db.auditLogs.where('businessId').equals(businessId).filter(l => l.action === 'edit' && l.entity === 'sale').toArray(), [businessId]) ?? []
  const users = useLiveQuery(() => db.users.toArray(), []) ?? []

  const soldSales = sales.filter(s => s.status !== 'cancelled')
  const totalSales = soldSales.reduce((s, x) => s + x.total, 0)
  const totalPaid = soldSales.reduce((s, x) => s + (x.paid || 0), 0)
  const creditBalance = credits.filter(c => c.status !== 'paid').reduce((s, c) => s + Math.max(0, c.balance), 0)
  const loanSummary = useMemo(() => ({ totalLoaned: loans.reduce((s, l) => s + (l.status === 'cancelled' ? 0 : l.amount), 0), totalPaid: loans.reduce((s, l) => s + l.paid, 0), balance: loans.reduce((s, l) => s + (l.status === 'cancelled' ? 0 : l.balance), 0) }), [loans])

  const advanceBalance = customerEntries.reduce((s, e) => {
    if (e.type === 'advance_received') return s + e.amount
    if (e.type === 'advance_used' || e.type === 'advance_refunded') return s - e.amount
    return s
  }, 0)
  const netBalance = Math.round(creditBalance + loanSummary.balance - Math.max(0, advanceBalance))

  const timeline = useMemo(() => {
    const events: { id: string; date: string; kind: string; label: string; ref: string; amount?: number; status?: string }[] = []
    for (const s of sales) {
      events.push({ id: `s-${s.id}`, date: s.createdAt, kind: s.status === 'cancelled' ? 'danger' : 'success', label: s.status === 'cancelled' ? 'Vente annulée' : 'Vente enregistrée', ref: s.invoiceNumber, amount: s.total, status: s.status })
    }
    for (const c of credits) {
      events.push({ id: `c-${c.id}`, date: c.createdAt, kind: 'warning', label: 'Dette créée', ref: `Crédit ${c.id.slice(0, 8)}`, amount: c.balance, status: c.status })
      if (c.status === 'paid') events.push({ id: `cp-${c.id}`, date: c.createdAt, kind: 'success', label: 'Dette soldée', ref: `Crédit ${c.id.slice(0, 8)}`, amount: c.paid })
    }
    for (const p of creditPayments) {
      events.push({ id: `pay-${p.id}`, date: p.date, kind: 'info', label: 'Paiement de crédit', ref: `${p.method}`, amount: p.amount })
    }
    for (const l of loans) {
      events.push({ id: `l-${l.id}`, date: l.createdAt, kind: l.status === 'cancelled' ? 'danger' : 'info', label: l.status === 'cancelled' ? 'Prêt annulé' : l.status === 'paid' ? 'Prêt soldé' : 'Prêt accordé', ref: l.number, amount: l.amount, status: l.status })
    }
    for (const p of loanPayments) {
      events.push({ id: `lp-${p.id}`, date: p.date, kind: 'success', label: 'Remboursement de prêt', ref: `${p.method}`, amount: p.amount })
    }
    for (const r of reminders) {
      events.push({ id: `r-${r.id}`, date: r.createdAt, kind: r.status === 'done' ? 'success' : 'warning', label: r.status === 'done' ? 'Rappel effectué' : 'Rappel de paiement', ref: r.id.slice(0, 8), amount: r.debtAmount, status: r.status })
    }
    for (const audit of reports) {
      if (sales.some(s => s.id === audit.entityId)) {
        events.push({ id: `a-${audit.id}`, date: audit.createdAt, kind: 'warning', label: 'Vente modifiée', ref: audit.entityId.slice(0, 8), amount: undefined })
      }
    }
    return events.sort((a, b) => (a.date > b.date ? -1 : 1)).slice(0, 80)
  }, [sales, credits, creditPayments, loans, loanPayments, reminders, reports])

  const userName = (id: string) => users.find(u => (u.id === id || u.authUserId === id))?.name || '—'

  // --- Actions prêt ---
  const [loanAmount, setLoanAmount] = useState('')
  const [loanDue, setLoanDue] = useState('')
  const [repayAmount, setRepayAmount] = useState('')
  const [repayMethod, setRepayMethod] = useState<'cash' | 'wave' | 'orange' | 'mobile' | 'card' | 'bank'>('cash')

  async function handleNewLoan() {
    try {
      await createLoan({ partyKind: 'customer', partyId: customer.id, amount: parseFloat(loanAmount) || 0, dueDate: loanDue || undefined })
      toast('Prêt enregistré sur le compte du client', 'success')
      setLoanAmount(''); setLoanDue('')
      void partyLoanSummary(customer.id)
    } catch (e: any) { toast(e?.message || 'Erreur', 'error') }
  }

  async function handleRepay() {
    try {
      await repayLoan({ partyKind: 'customer', partyId: customer.id, amount: parseFloat(repayAmount) || 0, method: repayMethod })
      toast(`Remboursement de ${formatCurrency(parseFloat(repayAmount) || 0)} enregistré`, 'success')
      setRepayAmount('')
      void listLoans(customer.id)
    } catch (e: any) { toast(e?.message || 'Erreur', 'error') }
  }

  // --- Actions rappels ---
  const [remDue, setRemDue] = useState('')
  const openReminders = reminders.filter(r => r.status !== 'done').map(r => ({ ...r, status: computeReminderStatus(r) }))

  // --- Actions avance ---
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false)

  async function handleAddAdvance() {
    const amount = parseFloat(advanceAmount) || 0
    if (amount <= 0) { toast('Montant invalide', 'warning'); return }
    try {
      await addCustomerEntry({
        customerId: customer.id,
        customerName: customer.name,
        type: 'advance_received',
        amount,
        note: 'Avance enregistrée manuellement',
        category: 'Avance déposée',
      })
      toast(`Avance de ${formatCurrency(amount)} enregistrée`, 'success')
      setAdvanceAmount(''); setAdvanceModalOpen(false)
    } catch (e: any) { toast(e?.message || 'Erreur', 'error') }
  }

  async function handleRefundAdvance() {
    const amount = parseFloat(advanceAmount) || 0
    if (amount <= 0) { toast('Montant invalide', 'warning'); return }
    try {
      await refundAdvance({ customerId: customer.id, customerName: customer.name, amount, method: 'cash' })
      toast(`Avance de ${formatCurrency(amount)} remboursée`, 'success')
      setAdvanceAmount(''); setAdvanceModalOpen(false)
    } catch (e: any) { toast(e?.message || 'Erreur', 'error') }
  }

  const [statementLoading, setStatementLoading] = useState(false)
  async function handleDownloadStatement() {
    setStatementLoading(true)
    try {
      const { lines, summary } = await buildCustomerStatement(customer.id)
      exportCustomerStatementPDF(
        customer.name,
        customer.phone,
        lines.map(l => ({ date: l.date, label: l.label, reference: l.reference, debit: l.debit, credit: l.credit, balance: l.running })),
        { debt: summary.debt, advance: summary.advance, loanBalance: summary.loanBalance, net: summary.net },
        settings || undefined,
        `releve_${customer.name.replace(/\s+/g, '_')}`,
      )
      toast('Relevé téléchargé', 'success')
    } catch (e: any) { toast(e?.message || 'Erreur', 'error') }
    finally { setStatementLoading(false) }
  }

  async function handleWhatsAppStatement() {
    if (!customer.phone) { toast('Aucun numéro de téléphone pour ce client', 'warning'); return }
    const msg = await buildStatementWhatsAppMessage(customer.id, settings?.name)
    openWhatsApp(customer.phone, msg)
    toast('Relevé envoyé sur WhatsApp', 'success')
  }

  async function handleWhatsAppOverdue() {
    if (!customer.phone) { toast('Aucun numéro de téléphone pour ce client', 'warning'); return }
    const msg = await buildOverdueWhatsAppMessage(customer.id, customer.name, settings?.name)
    openWhatsApp(customer.phone, msg)
    await recordOverdueNotification(customer.id, customer.name, msg.split('\n').filter(Boolean).slice(2).join(' ').slice(0, 160))
    toast('Relance de retard envoyée sur WhatsApp', 'success')
  }

  async function handleNewReminder() {
    const balance = creditBalance
    const firstCredit = credits.find(c => c.status !== 'paid')
    try {
      const created = await ensureReminder({
        creditId: firstCredit?.id,
        saleId: firstCredit?.invoiceId,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        debtAmount: balance,
        paidAmount: credits.reduce((s, c) => s + c.paid, 0),
        dueDate: firstCredit?.dueDate,
        remindDate: remDue || undefined,
      })
      if (created) toast('Rappel créé', 'success'); else toast('Un rappel existe déjà', 'warning')
      setRemDue('')
    } catch (e: any) { toast(e?.message || 'Erreur', 'error') }
  }

  return (
    <Modal open onClose={onClose} title={`Fiche client — ${customer.name}`} size="full">
      <div className="p-5 sm:p-6">
        {/* En-tête infos */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-surface-50 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-500 flex items-center justify-center text-xl font-bold">
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-bold text-surface-900">{customer.name}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-500 mt-1">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {customer.phone || '—'}</span>
                {customer.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {customer.email}</span>}
                {customer.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {customer.address}</span>}
                <span>Client · créé le {new Date(customer.createdAt).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => navigate('/pos', { state: { saleCustomer: { id: customer.id, name: customer.name, phone: customer.phone, address: customer.address } } })}
            >
              <ShoppingBag className="w-4 h-4" /> Nouvelle vente
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadStatement} loading={statementLoading}>
              <FileText className="w-4 h-4" /> Relevé
            </Button>
            <Button size="sm" variant="outline" onClick={handleWhatsAppStatement}>
              <MessageCircle className="w-4 h-4" /> Relevé WhatsApp
            </Button>
            {netBalance > 0 && (
              <Button size="sm" variant="outline" onClick={handleWhatsAppOverdue} className="text-amber-600">
                <BellRing className="w-4 h-4" /> Notifier retard
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setAdvanceAmount(''); setAdvanceModalOpen(true) }}>
              <Wallet className="w-4 h-4" /> Avance
            </Button>
            {customer.phone && (
              <Button variant="outline" size="sm" onClick={() => openWhatsApp(customer.phone)}><Phone className="w-4 h-4" /> WhatsApp</Button>
            )}
          </div>
        </div>

        {/* Résumé financier */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          <div className="p-3 rounded-xl bg-surface-100 border border-surface-200"><p className="text-[11px] text-surface-400">Total ventes</p><p className="font-bold text-surface-900">{formatCurrency(totalSales)}</p></div>
          <div className="p-3 rounded-xl bg-surface-100 border border-surface-200"><p className="text-[11px] text-surface-400">Total payé</p><p className="font-bold text-emerald-500">{formatCurrency(totalPaid)}</p></div>
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20"><p className="text-[11px] text-surface-400">Dette client</p><p className="font-bold text-danger">{formatCurrency(creditBalance)}</p></div>
          <div className="p-3 rounded-xl bg-info/10 border border-info/20"><p className="text-[11px] text-surface-400">Prêts (reste)</p><p className="font-bold text-info">{formatCurrency(loanSummary.balance)}</p></div>
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"><p className="text-[11px] text-surface-400">Avance détenue</p><p className="font-bold text-emerald-600">{formatCurrency(Math.max(0, advanceBalance))}</p></div>
          <div className={`p-3 rounded-xl border ${netBalance > 0 ? 'bg-danger/10 border-danger/20' : netBalance < 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-surface-100 border-surface-200'}`}>
            <p className="text-[11px] text-surface-400">Solde net</p>
            <p className={`font-bold ${netBalance > 0 ? 'text-danger' : netBalance < 0 ? 'text-emerald-600' : 'text-surface-900'}`}>
              {netBalance > 0 ? `Doit ${formatCurrency(netBalance)}` : netBalance < 0 ? `J'ai ${formatCurrency(Math.abs(netBalance))}` : 'À jour'}
            </p>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex gap-2 overflow-x-auto pb-1 mt-5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 transition-colors ${tab === t.key ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200 lg:col-span-2">
                <p className="text-sm font-semibold text-surface-900 mb-3">Résumé financier</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-surface-500">Total des achats (ventes)</span><span className="font-semibold">{formatCurrency(totalSales)}</span></div>
                  <div className="flex justify-between"><span className="text-surface-500">Montant payé</span><span className="font-semibold text-emerald-500">{formatCurrency(totalPaid)}</span></div>
                  <div className="flex justify-between"><span className="text-surface-500">Dette client (crédits)</span><span className="font-semibold text-danger">{formatCurrency(creditBalance)}</span></div>
                  <div className="flex justify-between"><span className="text-surface-500">Avance détenue pour le client</span><span className="font-semibold text-emerald-600">{formatCurrency(Math.max(0, advanceBalance))}</span></div>
                  <div className="flex justify-between border-t border-surface-200 pt-2"><span className="text-surface-500">Prêts accordés</span><span className="font-semibold">{formatCurrency(loanSummary.totalLoaned)}</span></div>
                  <div className="flex justify-between"><span className="text-surface-500">Remboursé (prêts)</span><span className="font-semibold text-emerald-500">{formatCurrency(loanSummary.totalPaid)}</span></div>
                  <div className="flex justify-between"><span className="text-surface-500">Prêt en cours</span><span className="font-semibold text-info">{formatCurrency(loanSummary.balance)}</span></div>
                  <div className="flex justify-between border-t border-surface-200 pt-2">
                    <span className="font-semibold text-surface-700">Solde net</span>
                    <span className={`font-bold ${netBalance > 0 ? 'text-danger' : netBalance < 0 ? 'text-emerald-600' : 'text-surface-900'}`}>
                      {netBalance > 0 ? `Le client doit ${formatCurrency(netBalance)}` : netBalance < 0 ? `La boutique détient ${formatCurrency(Math.abs(netBalance))}` : 'À jour'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200 space-y-2">
                <p className="text-sm font-semibold text-surface-900">Actions rapides</p>
                <p className="text-xs text-surface-500">Rendez-vous dans les onglets Dettes, Prêts et Rappels pour gérer le compte de {customer.name}.</p>
                <Button size="sm" variant="outline" onClick={() => setTab('reminders')}><BellRing className="w-4 h-4" /> Créer un rappel</Button>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-2">
              {timeline.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 p-3 bg-surface-100 border border-surface-200 rounded-xl">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white ${ev.kind === 'danger' ? 'bg-danger' : ev.kind === 'success' ? 'bg-emerald-500' : ev.kind === 'warning' ? 'bg-amber-500' : 'bg-primary-500'}`}>
                    {ev.kind === 'danger' ? <X className="w-4 h-4" /> : ev.kind === 'success' ? <Check className="w-4 h-4" /> : ev.kind === 'warning' ? <CreditCard className="w-4 h-4" /> : <HistoryIcon className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 truncate">{ev.label}</p>
                    <p className="text-xs text-surface-400">{formatDateTime(ev.date)} · {ev.ref}</p>
                  </div>
                  {ev.amount !== undefined && <span className="text-sm font-semibold text-surface-900">{formatCurrency(ev.amount)}</span>}
                </div>
              ))}
              {timeline.length === 0 && <p className="text-center py-12 text-surface-400 text-sm">Aucune opération enregistrée pour ce client</p>}
            </div>
          )}

          {tab === 'sales' && (
            <div className="responsive-table overflow-x-auto rounded-2xl border border-surface-200">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-xs text-surface-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Facture</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-right px-4 py-3">Total</th>
                    <th className="text-right px-4 py-3">Payé</th>
                    <th className="text-left px-4 py-3">Statut</th>
                    <th className="text-right px-4 py-3">Facture</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map(s => (
                    <tr key={s.id} className="border-t border-surface-100">
                      <td className="px-4 py-2.5 font-semibold text-primary-500">{s.invoiceNumber || '—'}</td>
                      <td className="px-4 py-2.5 text-surface-500">{formatDateTime(s.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(s.total)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-500">{formatCurrency(s.paid)}</td>
                      <td className="px-4 py-2.5"><Badge variant={s.status === 'cancelled' ? 'danger' : s.paid >= s.total ? 'success' : 'warning'}>{s.status === 'cancelled' ? 'Annulée' : s.paid >= s.total ? 'Payée' : 'Partielle'}</Badge></td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => exportSalePDF(s, settings || undefined, undefined, userName(s.userId))}
                            title="Télécharger la facture (PDF)"
                            className="p-2 rounded-lg hover:bg-primary-500/15 text-surface-500 hover:text-primary-500 transition-colors"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => shareSalePDF(s, settings || undefined, undefined, userName(s.userId))}
                            title="Envoyer / partager la facture"
                            className="p-2 rounded-lg hover:bg-emerald-500/15 text-surface-500 hover:text-emerald-500 transition-colors"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          {customer.phone && (
                            <button
                              onClick={() => {
                                const msg = `Bonjour ${customer.name}, voici votre facture ${s.invoiceNumber || ''} d'un montant de ${formatCurrency(s.total)} (payé : ${formatCurrency(s.paid)}). Reste : ${formatCurrency(Math.max(0, s.total - (s.paid || 0)))}.`
                                openWhatsApp(customer.phone, msg)
                              }}
                              title="Notifier la facture sur WhatsApp"
                              className="p-2 rounded-lg hover:bg-emerald-500/15 text-surface-500 hover:text-emerald-500 transition-colors"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sales.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-surface-400">Aucune vente</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'credits' && (
            <div className="space-y-3">
              {credits.map(c => (
                <div key={c.id} className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary-500" />
                      <span className="text-sm font-semibold text-surface-900">Crédit {c.id.slice(0, 8)}</span>
                      <Badge variant={c.status === 'paid' ? 'success' : c.status === 'overdue' ? 'danger' : 'warning'}>{c.status === 'paid' ? 'Soldé' : c.status === 'overdue' ? 'En retard' : 'En cours'}</Badge>
                    </div>
                    <span className="text-xs text-surface-400">
                      {c.dueDate && new Date(c.dueDate).getFullYear() < 2100 ? `Échéance : ${new Date(c.dueDate).toLocaleDateString('fr-FR')}` : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                    <div><p className="text-xs text-surface-400">Montant</p><p className="font-semibold">{formatCurrency(c.amount)}</p></div>
                    <div><p className="text-xs text-surface-400">Payé</p><p className="font-semibold text-emerald-500">{formatCurrency(c.paid)}</p></div>
                    <div><p className="text-xs text-surface-400">Reste</p><p className="font-semibold text-danger">{formatCurrency(Math.max(0, c.balance))}</p></div>
                  </div>
                </div>
              ))}
              {credits.length === 0 && <p className="text-center py-10 text-surface-400 text-sm">Aucun crédit pour ce client</p>}
            </div>
          )}

          {tab === 'payments' && (
            <div className="overflow-x-auto rounded-2xl border border-surface-200">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-xs text-surface-500 uppercase">
                  <tr><th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Type</th><th className="text-right px-4 py-3">Montant</th><th className="text-left px-4 py-3">Utilisateur</th></tr>
                </thead>
                <tbody>
                  {creditPayments.map(p => (
                    <tr key={p.id} className="border-t border-surface-100">
                      <td className="px-4 py-2.5 text-surface-500">{formatDateTime(p.date)}</td>
                      <td className="px-4 py-2.5">Crédit {p.method}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-500">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-2.5 text-surface-500">{userName(p.userId)}</td>
                    </tr>
                  ))}
                  {loanPayments.map(p => (
                    <tr key={p.id} className="border-t border-surface-100">
                      <td className="px-4 py-2.5 text-surface-500">{formatDateTime(p.date)}</td>
                      <td className="px-4 py-2.5">Prêt {p.method}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-emerald-500">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-2.5 text-surface-500">—</td>
                    </tr>
                  ))}
                  {creditPayments.length === 0 && loanPayments.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-surface-400">Aucun paiement</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'loans' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
                  <p className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2"><HandCoins className="w-4 h-4 text-primary-500" /> Nouveau prêt</p>
                  <div className="space-y-2">
                    <Input label="Montant (FCFA)" type="number" min="0" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} />
                    <Input label="Échéance (optionnelle)" type="date" value={loanDue} onChange={e => setLoanDue(e.target.value)} />
                    <Button size="sm" className="w-full" onClick={handleNewLoan}><Plus className="w-4 h-4" /> Accorder {formatCurrency(parseFloat(loanAmount) || 0)}</Button>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
                  <p className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-500" /> Remboursement</p>
                  <div className="space-y-2">
                    <Input label="Montant remboursé (FCFA)" type="number" min="0" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} />
                    <Select label="Moyen" value={repayMethod} onChange={e => setRepayMethod(e.target.value as any)} options={[
                      { value: 'cash', label: 'Espèces' }, { value: 'wave', label: 'Wave' }, { value: 'orange', label: 'Orange Money' },
                      { value: 'mobile', label: 'Mobile Money' }, { value: 'card', label: 'Carte' }, { value: 'bank', label: 'Virement' },
                    ]} />
                    <Button size="sm" variant="outline" className="w-full" onClick={handleRepay}>Rembourser</Button>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-info/10 border border-info/20">
                <p className="text-sm font-semibold text-info">SOLDE TOTAL DES PRÊTS : {formatCurrency(loanSummary.balance)}</p>
                <p className="text-xs text-surface-500 mt-1">Prêté {formatCurrency(loanSummary.totalLoaned)} · Remboursé {formatCurrency(loanSummary.totalPaid)}</p>
              </div>

              <div className="responsive-table overflow-x-auto rounded-2xl border border-surface-200">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 text-xs text-surface-500 uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Date</th><th className="text-left px-4 py-3">Référence</th>
                      <th className="text-right px-4 py-3">Montant</th><th className="text-right px-4 py-3">Remboursé</th>
                      <th className="text-right px-4 py-3">Reste</th><th className="text-left px-4 py-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map(l => (
                      <tr key={l.id} className="border-t border-surface-100">
                        <td className="px-4 py-2.5 text-surface-500">{new Date(l.createdAt).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-2.5 font-semibold text-primary-500">{l.number}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(l.amount)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-500">{formatCurrency(l.paid)}</td>
                        <td className="px-4 py-2.5 text-right text-danger">{formatCurrency(l.balance)}</td>
                        <td className="px-4 py-2.5"><Badge variant={l.status === 'paid' ? 'success' : l.status === 'cancelled' ? 'danger' : l.status === 'partial' ? 'warning' : 'info'}>{l.status === 'paid' ? 'Soldé' : l.status === 'cancelled' ? 'Annulé' : l.status === 'partial' ? 'Partiel' : 'En cours'}</Badge></td>
                      </tr>
                    ))}
                    {loans.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-surface-400">Aucun prêt</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'reminders' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-surface-100 border border-surface-200">
                <p className="text-sm font-semibold text-surface-900 mb-3 flex items-center gap-2"><BellRing className="w-4 h-4 text-amber-500" /> Nouveau rappel {creditBalance > 0 ? `(dette : ${formatCurrency(creditBalance)})` : '(aucune dette en cours)'}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <Input label="Date du rappel" type="date" value={remDue} onChange={e => setRemDue(e.target.value)} />
                  <Button size="sm" onClick={handleNewReminder}>Créer le rappel</Button>
                </div>
              </div>
              {openReminders.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-100 border border-surface-200 flex-wrap">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.status === 'overdue' ? 'bg-danger text-white' : r.status === 'today' ? 'bg-amber-500 text-white' : 'bg-surface-200 text-surface-500'}`}>
                    <BellRing className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900">
                      {r.status === 'overdue' ? 'En retard' : r.status === 'today' ? 'Aujourd’hui' : r.status === 'postponed' ? 'Reporté' : 'À venir'}
                    </p>
                    <p className="text-xs text-surface-400">{formatCurrency(Math.max(0, r.debtAmount - r.paidAmount))} restants · rappel le {new Date(r.remindDate).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={async () => { await markReminderDone(r.id); toast('Rappel marqué effectué', 'success') }}><Check className="w-4 h-4" /> Fait</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { const d = prompt('Reporter au :', new Date(r.remindDate).toISOString().slice(0, 10)); if (d) { await postponeReminder(r.id, d); toast('Rappel reporté', 'success') } }}><ChevronRight className="w-4 h-4" /> Reporter</Button>
                  </div>
                </div>
              ))}
              {reminders.length === 0 && <p className="text-center py-10 text-surface-400 text-sm">Aucun rappel pour ce client</p>}
            </div>
          )}
        </div>
      </div>
      <Modal open={advanceModalOpen} onClose={() => setAdvanceModalOpen(false)} title={`Avance — ${customer.name}`} size="sm">
        <div className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm">
            <p className="text-surface-500 text-xs">Avance actuellement détenue</p>
            <p className="font-bold text-emerald-600">{formatCurrency(Math.max(0, advanceBalance))}</p>
          </div>
          <Input label="Montant (FCFA)" type="number" min="0" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleAddAdvance}><ArrowDownCircle className="w-4 h-4" /> Enregistrer</Button>
            <Button variant="outline" className="flex-1" onClick={handleRefundAdvance} disabled={advanceBalance <= 0}><ArrowUpCircle className="w-4 h-4" /> Rembourser</Button>
          </div>
          <p className="text-xs text-surface-400">L'avance est l'argent du client que vous détenez. Elle n'est pas comptée comme chiffre d'affaires.</p>
        </div>
      </Modal>

      <div className="flex justify-end p-6 border-t border-surface-200">
        <Button variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
    </Modal>
  )
}
