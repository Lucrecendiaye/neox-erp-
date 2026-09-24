import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Badge, Modal, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import db from '@/db'
import { formatCurrency, formatDate, formatDateTimeLong } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Printer, FileSpreadsheet, FileText, FileDown, TrendingUp, TrendingDown, Wallet, Receipt, PiggyBank, CalendarDays, Banknote, CreditCard, ArrowUpRight, ArrowDownRight, ListRestart, PieChart } from 'lucide-react'
import type { Sale, CashBookEntry, Credit } from '@/types'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces', wave: 'Wave', orange: 'Orange Money', mobile: 'Mobile Money',
  card: 'Carte bancaire', bank: 'Virement', credit: 'Crédit', split: 'Mixte',
}
const PAYMENT_ORDER = ['cash', 'wave', 'orange', 'mobile', 'card', 'bank', 'credit']

function pad(n: number): string { return String(n).padStart(2, '0') }
function monthKey(year: number, month: number): string { return `${year}-${pad(month + 1)}` }
function inMonth(iso: string | undefined, key: string): boolean {
  return (iso || '').slice(0, 7) === key
}
function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) return { year: year - 1, month: 11 }
  return { year, month: month - 1 }
}
function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return cur > 0 ? 100 : 0
  return ((cur - prev) / prev) * 100
}

function splitPayments(sale: Sale): Record<string, number> {
  const res: Record<string, number> = {}
  const splits = (sale.splitPayments || []).filter(p => p.amount > 0)
  if (splits.length > 0) {
    for (const p of splits) res[p.method] = (res[p.method] || 0) + p.amount
  } else {
    const key = sale.paymentMethod === 'credit' ? 'credit' : sale.paymentMethod || 'cash'
    res[key] = (res[key] || 0) + (sale.paid || 0)
  }
  return res
}

function fmtNum(v: number): string { return Math.round(v).toLocaleString('fr-FR') }

export default function AccountingModule() {
  const businessId = useBusinessId()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [creditPage, setCreditPage] = useState(1)
  const [expensesDetailOpen, setExpensesDetailOpen] = useState(false)

  const sales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).filter(s => s.status === 'completed').toArray(), [businessId])
  const cashBook = useLiveQuery(() => db.cashBook.where('businessId').equals(businessId).toArray(), [businessId])
  const credits = useLiveQuery(() => db.credits.where('businessId').equals(businessId).toArray(), [businessId])
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const settings = useLiveQuery(() => db.settings.get('default'), [])
  const business = useLiveQuery(() => db.businesses.get(businessId), [businessId])

  const costMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products || []) m.set(p.id, p.purchasePrice || 0)
    return m
  }, [products])

  function saleCost(s: Sale): number {
    return (s.items || []).reduce((sum, it) => sum + (it.quantity || 0) * (costMap.get(it.productId) || 0), 0)
  }

  const stats = useMemo(() => {
    const key = monthKey(year, month)
    const prev = prevMonth(year, month)
    const prevKey = monthKey(prev.year, prev.month)
    const today = new Date().toISOString().split('T')[0]

    const allSales = sales || []
    const monthSales = allSales.filter(s => inMonth(s.createdAt, key))
    const prevSales = allSales.filter(s => inMonth(s.createdAt, prevKey))
    const todaySales = allSales.filter(s => (s.createdAt || '').slice(0, 10) === today)

    const allExpenses = (cashBook || []).filter(e => e.type === 'out')
    const monthExpenses = allExpenses.filter(e => inMonth(e.date, key))
    const prevExpenses = allExpenses.filter(e => inMonth(e.date, prevKey))
    const todayExpenses = allExpenses.filter(e => (e.date || '').slice(0, 10) === today)

    const monthRevenue = monthSales.reduce((s, x) => s + x.total, 0)
    const prevRevenue = prevSales.reduce((s, x) => s + x.total, 0)
    const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0)

    const monthCost = monthSales.reduce((s, x) => s + saleCost(x), 0)
    const todayCost = todaySales.reduce((s, x) => s + saleCost(x), 0)

    const monthExpense = monthExpenses.reduce((s, x) => s + x.amount, 0)
    const prevExpense = prevExpenses.reduce((s, x) => s + x.amount, 0)
    const todayExpense = todayExpenses.reduce((s, x) => s + x.amount, 0)

    const monthMargin = monthRevenue - monthCost
    const monthNet = monthMargin - monthExpense

    const totalRevenue = allSales.reduce((s, x) => s + x.total, 0)
    const totalMargin = allSales.reduce((s, x) => s + (x.total - saleCost(x)), 0)
    const totalExpense = allExpenses.reduce((s, x) => s + x.amount, 0)
    const totalNet = totalMargin - totalExpense

    const monthPaymentTotals: Record<string, number> = {}
    for (const s of monthSales) {
      for (const [m, v] of Object.entries(splitPayments(s))) monthPaymentTotals[m] = (monthPaymentTotals[m] || 0) + v
    }

    const expByCategory: { category: string; amount: number; count: number }[] = []
    const catMap = new Map<string, { amount: number; count: number }>()
    for (const e of monthExpenses) {
      const cur = catMap.get(e.category) || { amount: 0, count: 0 }
      cur.amount += e.amount; cur.count += 1
      catMap.set(e.category, cur)
    }
    for (const [category, v] of catMap.entries()) expByCategory.push({ category, amount: v.amount, count: v.count })
    expByCategory.sort((a, b) => b.amount - a.amount)

    const allCredits = credits || []
    const activeCredits = allCredits.filter(c => c.status !== 'paid')
    const creditTotal = allCredits.reduce((s, x) => s + x.amount, 0)
    const creditPaid = allCredits.reduce((s, x) => s + x.paid, 0)

    return {
      monthRevenue, monthTransactions: monthSales.length,
      prevRevenue, revenueChange: pctChange(monthRevenue, prevRevenue),
      monthExpense, prevExpense, expenseChange: pctChange(monthExpense, prevExpense),
      monthMargin, monthNet,
      todayRevenue, todayCost, todayExpense,
      todayMargin: todayRevenue - todayCost,
      todayNet: (todayRevenue - todayCost) - todayExpense,
      totalRevenue, totalMargin, totalExpense, totalNet,
      monthPaymentTotals,
      expByCategory,
      creditTotal, creditPaid, creditUnpaid: creditTotal - creditPaid, activeCredits,
      monthSales, monthExpenses, allSales, allExpenses,
    }
  }, [sales, cashBook, credits, costMap, year, month])

  const projected = {
    revenue: stats.monthRevenue * 12,
    margin: stats.monthMargin * 12,
    expense: stats.monthExpense * 12,
    net: stats.monthNet * 12,
  }

  const periodLabel = `${MONTHS[month]} ${year}`
  const generatedAt = formatDateTimeLong(new Date())
  const companyName = business?.name || settings?.name || 'Entreprise'

  const creditTotalRows = stats.activeCredits.length
  const pageSize = 8
  const creditPageCount = Math.max(1, Math.ceil(creditTotalRows / pageSize))
  const paginatedCredits = stats.activeCredits.slice((creditPage - 1) * pageSize, creditPage * pageSize)

  function signatureBlock(): string {
    return `
      <div class="signatures">
        <div class="sig"><div>Le dirigeant / Gérant</div><div class="line"></div></div>
        <div class="sig"><div>Le comptable</div><div class="line"></div></div>
      </div>`
  }

  function buildHTML(forPrint: boolean): string {
    const escS = (v: string | number | null | undefined) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const money = (v: number) => escS(formatCurrency(v))
    const sign = (v: number) => `<span class="${v >= 0 ? 'green' : 'red'}">${money(v)}</span>`

    const kpis = [
      ['Ventes du mois', money(stats.monthRevenue), `${stats.monthTransactions} transaction(s) — évolution ${stats.revenueChange === null ? '—' : (stats.revenueChange >= 0 ? '+' : '') + stats.revenueChange.toFixed(1) + '%'}`],
      ['Dépenses du mois', money(stats.monthExpense), 'Toutes dépenses enregistrées'],
      ['Marge brute', money(stats.monthMargin), 'Chiffre d\u2019affaires − coût des produits'],
      ['Résultat net', sign(stats.monthNet), 'Marge brute − dépenses du mois'],
    ]
    const cumul = [
      ['Ventes totales', money(stats.totalRevenue)],
      ['Bénéfice total', money(stats.totalMargin)],
      ['Dépenses totales', money(stats.totalExpense)],
      ['Résultat total', sign(stats.totalNet)],
    ]
    const proj = [
      ['Ventes projetées', money(projected.revenue)],
      ['Bénéfice projeté', money(projected.margin)],
      ['Dépenses projetées', money(projected.expense)],
      ['Résultat net projeté', sign(projected.net)],
    ]
    const creditsRows = stats.activeCredits.map(c => `
      <tr>
        <td>${escS(c.customerName)}</td>
        <td class="r">${money(c.amount)}</td>
        <td class="r">${money(c.paid)}</td>
        <td class="r strong">${money(c.balance)}</td>
        <td>${c.status === 'overdue' ? '<span class="red">En retard</span>' : c.status === 'defaulted' ? '<span class="red">Impayé</span>' : c.dueDate ? escS(formatDate(c.dueDate)) : '—'}</td>
      </tr>`).join('')
    const paymentRows = PAYMENT_ORDER
      .filter(p => stats.monthPaymentTotals[p] > 0)
      .map(p => `<tr><td>${escS(PAYMENT_LABELS[p] || p)}</td><td class="r strong">${money(stats.monthPaymentTotals[p])}</td></tr>`).join('')
    const expenseRows = stats.expByCategory.map(e => `
      <tr><td>${escS(e.category)}</td><td class="r">${e.count}</td><td class="r strong">${money(e.amount)}</td></tr>`).join('')
    const salesRows = stats.monthSales.slice(0, 200).map(s => `
      <tr>
        <td>${escS(s.invoiceNumber)}</td>
        <td>${escS(s.customerName || 'Divers')}</td>
        <td>${escS(formatDate(s.createdAt))}</td>
        <td class="r">${money(s.total)}</td>
        <td>${escS(s.paymentMethod === 'split' ? 'Mixte' : (PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod))}</td>
      </tr>`).join('')

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Rapport comptable — ${escS(companyName)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
  .banner { display: flex; justify-content: space-between; align-items: center; background: #1e40af; color: #fff; padding: 12px 14px; border-radius: 4px; }
  .banner h1 { margin: 0; font-size: 18px; }
  .banner h2 { margin: 2px 0 0; font-size: 12px; font-weight: normal; opacity: .9; }
  .banner .right { text-align: right; }
  .banner .title { font-size: 16px; font-weight: bold; }
  .meta { margin: 10px 0; font-size: 11px; color: #475569; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 14px; font-size: 11px; }
  th { background: #1e40af; color: #fff; text-align: left; padding: 6px 8px; text-transform: uppercase; font-size: 9.5px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 5px 8px; }
  .r { text-align: right; }
  .strong { font-weight: bold; }
  .green { color: #16a34a; font-weight: bold; }
  .red { color: #dc2626; font-weight: bold; }
  h4 { margin: 14px 0 4px; color: #1e40af; text-transform: uppercase; font-size: 11px; }
  .signatures { display: flex; gap: 30px; margin-top: 40px; }
  .sig { flex: 1; font-size: 11px; color: #475569; text-align: center; }
  .sig .line { margin-top: 34px; border-top: 1px dashed #94a3b8; }
  .footer { margin-top: 16px; padding-top: 8px; border-top: 2px solid #1e40af; font-size: 9.5px; color: #64748b; text-align: center; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <div class="banner">
    <div>
      <h1>${escS(companyName)}</h1>
      ${settings?.address ? `<h2>${escS(settings.address)}</h2>` : ''}
      ${settings?.phone ? `<h2>Tel: ${escS(settings.phone)}</h2>` : ''}
    </div>
    <div class="right"><div class="title">RAPPORT COMPTABLE</div><div>${escS(periodLabel)}</div></div>
  </div>
  <div class="meta">
    <span><strong>Période :</strong> ${escS(periodLabel)}</span>
    <span><strong>Généré le :</strong> ${escS(generatedAt)}</span>
  </div>

  <h4>Indicateurs financiers</h4>
  <table><thead><tr><th>Indicateur</th><th class="r">Valeur</th><th>Détail</th></tr></thead>
  <tbody>${kpis.map(k => `<tr><td>${k[0]}</td><td class="r strong">${k[1]}</td><td>${k[2]}</td></tr>`).join('')}</tbody></table>

  <h4>Bilans cumulés</h4>
  <table><thead><tr><th>Indicateur</th><th class="r">Cumul</th></tr></thead>
  <tbody>${cumul.map(k => `<tr><td>${k[0]}</td><td class="r strong">${k[1]}</td></tr>`).join('')}</tbody></table>

  <h4>Projection annuelle</h4>
  <table><thead><tr><th>Indicateur</th><th class="r">Projection</th></tr></thead>
  <tbody>${proj.map(k => `<tr><td>${k[0]}</td><td class="r strong">${k[1]}</td></tr>`).join('')}</tbody></table>

  <h4>Récapitulatif du jour</h4>
  <table><thead><tr><th>Indicateur</th><th class="r">Valeur</th></tr></thead>
  <tbody>
    <tr><td>Ventes du jour</td><td class="r strong">${money(stats.todayRevenue)}</td></tr>
    <tr><td>Dépenses du jour</td><td class="r strong">${money(stats.todayExpense)}</td></tr>
    <tr><td>Bilan du jour</td><td class="r strong">${sign(stats.todayNet)}</td></tr>
  </tbody></table>

  <h4>Crédits en cours</h4>
  <table><thead><tr><th>Client</th><th class="r">Total crédit</th><th class="r">Remboursé</th><th class="r">Impayé</th><th>Échéance / Statut</th></tr></thead>
  <tbody>${creditsRows}</tbody>
  <tfoot><tr><td class="strong">Total crédits</td><td class="r strong">${money(stats.creditTotal)}</td><td class="r strong">${money(stats.creditPaid)}</td><td class="r strong red">${money(stats.creditUnpaid)}</td><td></td></tr></tfoot></table>

  <h4>Répartition par mode de paiement (${escS(periodLabel)})</h4>
  <table><thead><tr><th>Mode</th><th class="r">Montant encaissé</th></tr></thead>
  <tbody>${paymentRows || '<tr><td class="r" colspan="2" style="text-align:center;color:#94a3b8">Aucun encaissement sur la période</td></tr>'}</tbody></table>

  <h4>Dépenses détaillées (${escS(periodLabel)})</h4>
  <table><thead><tr><th>Catégorie</th><th class="r">Opérations</th><th class="r">Montant</th></tr></thead>
  <tbody>${expenseRows || '<tr><td colspan="3" style="text-align:center;color:#94a3b8">Aucune dépense enregistrée</td></tr>'}</tbody></table>

  <h4>Ventes de la période (${escS(periodLabel)})</h4>
  <table><thead><tr><th>Facture</th><th>Client</th><th>Date</th><th class="r">Montant</th><th>Mode</th></tr></thead>
  <tbody>${salesRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8">Aucune vente</td></tr>'}</tbody></table>

  ${forPrint ? signatureBlock() : ''}
  <div class="footer">Document généré par ${escS(companyName)} le ${escS(generatedAt)} — NeoX ERP</div>
</body></html>`
  }

  function exportCSV() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
    const sign = (v: number) => Math.round(v).toLocaleString('fr-FR')
    const lines: string[] = []
    lines.push(esc('RAPPORT COMPTABLE'), esc(companyName), esc(periodLabel))
    lines.push('')
    lines.push(['Indicateur', 'Valeur', 'Détail'].join(';'))
    lines.push(['Ventes du mois', sign(stats.monthRevenue), `${stats.monthTransactions} transactions`].map(esc).join(';'))
    lines.push(['Dépenses du mois', sign(stats.monthExpense)].map(esc).join(';'))
    lines.push(['Marge brute', sign(stats.monthMargin)].map(esc).join(';'))
    lines.push(['Résultat net', sign(stats.monthNet)].map(esc).join(';'))
    lines.push('')
    lines.push(['CUMULÉS', 'Valeur'].join(';'))
    lines.push(['Ventes totales', sign(stats.totalRevenue)].map(esc).join(';'))
    lines.push(['Bénéfice total', sign(stats.totalMargin)].map(esc).join(';'))
    lines.push(['Dépenses totales', sign(stats.totalExpense)].map(esc).join(';'))
    lines.push(['Résultat total', sign(stats.totalNet)].map(esc).join(';'))
    lines.push('')
    lines.push(['PROJECTION ANNUELLE (×12)', 'Valeur'].join(';'))
    lines.push(['Ventes projetées', sign(projected.revenue)].map(esc).join(';'))
    lines.push(['Bénéfice projeté', sign(projected.margin)].map(esc).join(';'))
    lines.push(['Dépenses projetées', sign(projected.expense)].map(esc).join(';'))
    lines.push(['Résultat net projeté', sign(projected.net)].map(esc).join(';'))
    lines.push('')
    lines.push(['RÉCAPITULATIF DU JOUR', 'Valeur'].join(';'))
    lines.push(['Ventes du jour', sign(stats.todayRevenue)].map(esc).join(';'))
    lines.push(['Dépenses du jour', sign(stats.todayExpense)].map(esc).join(';'))
    lines.push(['Bilan du jour', sign(stats.todayNet)].map(esc).join(';'))
    lines.push('')
    lines.push(['CRÉDITS EN COURS', 'Total', 'Remboursé', 'Impayé'].join(';'))
    lines.push(['Crédits', sign(stats.creditTotal), sign(stats.creditPaid), sign(stats.creditUnpaid)].map(esc).join(';'))
    stats.activeCredits.forEach(c => {
      lines.push(['— ' + c.customerName, sign(c.amount), sign(c.paid), sign(c.balance)].map(esc).join(';'))
    })
    lines.push('')
    lines.push(['PAIEMENTS PAR MODE', 'Montant'].join(';'))
    PAYMENT_ORDER.filter(p => stats.monthPaymentTotals[p] > 0).forEach(p => {
      lines.push([PAYMENT_LABELS[p] || p, sign(stats.monthPaymentTotals[p])].map(esc).join(';'))
    })
    lines.push('')
    lines.push(['DÉPENSES PAR CATÉGORIE', 'Opérations', 'Montant'].join(';'))
    stats.expByCategory.forEach(e => {
      lines.push([e.category, String(e.count), sign(e.amount)].map(esc).join(';'))
    })
    lines.push('')
    lines.push(['VENTES DE LA PÉRIODE', 'Client', 'Date', 'Montant', 'Mode'].join(';'))
    stats.monthSales.slice(0, 500).forEach(s => {
      lines.push([s.invoiceNumber, s.customerName || 'Divers', formatDate(s.createdAt), sign(s.total), s.paymentMethod === 'split' ? 'Mixte' : (PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod)].map(esc).join(';'))
    })
    const csv = '\uFEFF' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rapport_comptable_${monthKey(year, month)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  function exportExcel() {
    const escS = (v: string | number | null | undefined) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const money = (v: number) => Math.round(v).toLocaleString('fr-FR')
    const rows = (title: string, head: string[], body: string[][], extra?: string) => `
      <h4>${escS(title)}</h4>
      <table border="1"><thead><tr>${head.map(h => `<th>${escS(h)}</th>`).join('')}</tr></thead>
      <tbody>${body.map(r => `<tr>${r.map(c => `<td>${escS(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    const layout = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
      <h2>RAPPORT COMPTABLE — ${escS(companyName)} — ${escS(periodLabel)}</h2>
      <p><em>Généré le ${escS(generatedAt)}</em></p>
      ${rows('Indicateurs', ['Indicateur', 'Valeur', 'Détail'], [
        ['Ventes du mois', money(stats.monthRevenue), `${stats.monthTransactions} transactions`],
        ['Dépenses du mois', money(stats.monthExpense), ''],
        ['Marge brute', money(stats.monthMargin), ''],
        ['Résultat net', money(stats.monthNet), ''],
      ])}
      ${rows('Bilans cumulés', ['Indicateur', 'Cumul'], [
        ['Ventes totales', money(stats.totalRevenue)],
        ['Bénéfice total', money(stats.totalMargin)],
        ['Dépenses totales', money(stats.totalExpense)],
        ['Résultat total', money(stats.totalNet)],
      ])}
      ${rows('Projection annuelle', ['Indicateur', 'Projection'], [
        ['Ventes projetées', money(projected.revenue)],
        ['Bénéfice projeté', money(projected.margin)],
        ['Dépenses projetées', money(projected.expense)],
        ['Résultat net projeté', money(projected.net)],
      ])}
      ${rows('Récapitulatif du jour', ['Indicateur', 'Valeur'], [
        ['Ventes du jour', money(stats.todayRevenue)],
        ['Dépenses du jour', money(stats.todayExpense)],
        ['Bilan du jour', money(stats.todayNet)],
      ])}
      ${rows('Crédits en cours', ['Client', 'Total crédit', 'Remboursé', 'Impayé'], stats.activeCredits.map(c => [c.customerName, money(c.amount), money(c.paid), money(c.balance)]))}
      ${rows('Paiements par mode', ['Mode', 'Montant'], PAYMENT_ORDER.filter(p => stats.monthPaymentTotals[p] > 0).map(p => [PAYMENT_LABELS[p] || p, money(stats.monthPaymentTotals[p])]))}
      ${rows('Dépenses par catégorie', ['Catégorie', 'Opérations', 'Montant'], stats.expByCategory.map(e => [e.category, String(e.count), money(e.amount)]))}
      ${rows('Ventes de la période', ['Facture', 'Client', 'Date', 'Montant', 'Mode'], stats.monthSales.map(s => [s.invoiceNumber, s.customerName || 'Divers', formatDate(s.createdAt), money(s.total), s.paymentMethod === 'split' ? 'Mixte' : (PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod)]))}
    </body></html>`
    const blob = new Blob([layout], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `rapport_comptable_${monthKey(year, month)}.xls`
    a.click(); URL.revokeObjectURL(url)
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const W = 297
    const money = (v: number) => Math.round(v).toLocaleString('fr-FR') + ' FCFA'
    const BLUE: [number, number, number] = [30, 64, 175]
    const RED: [number, number, number] = [220, 38, 38]
    const GREEN: [number, number, number] = [22, 163, 74]

    doc.setFillColor(...BLUE)
    doc.rect(0, 0, W, 26, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(15)
    doc.setFont('helvetica', 'bold')
    doc.text('RAPPORT COMPTABLE', 14, 12)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text(`${companyName} — ${periodLabel}`, 14, 19)
    doc.text(`Généré le ${generatedAt}`, W - 14, 12, { align: 'right' })
    doc.text(`Export PDF — NeoX ERP`, W - 14, 19, { align: 'right' })

    const pct = (v: number | null) => v === null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
    const netColor = (v: number): [number, number, number] => (v >= 0 ? GREEN : RED)

    autoTable(doc, {
      startY: 32,
      head: [['Indicateur', 'Valeur', 'Détail']],
      body: [
        ['Ventes du mois', money(stats.monthRevenue), `${stats.monthTransactions} transactions — évolution ${pct(stats.revenueChange)}`],
        ['Dépenses du mois', money(stats.monthExpense), `${stats.monthExpenses.length} écriture(s) de dépense`],
        ['Marge brute', money(stats.monthMargin), 'Chiffre d\u2019affaires − coût des produits vendus'],
        ['Résultat net', money(stats.monthNet), 'Marge brute − dépenses du mois'],
      ],
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right', cellWidth: 55 }, 2: { cellWidth: 140 } },
      margin: { left: 14, right: 14 },
    })
    const rowsAfterKpi = (doc as any).lastAutoTable.finalY + 6

    autoTable(doc, {
      startY: rowsAfterKpi,
      head: [['Cumulés', 'Valeur']],
      body: [
        ['Ventes totales', money(stats.totalRevenue)],
        ['Bénéfice total', money(stats.totalMargin)],
        ['Dépenses totales', money(stats.totalExpense)],
        ['Résultat total', money(stats.totalNet)],
      ],
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9, textColor: 0 },
      columnStyles: { 1: { halign: 'right', cellWidth: 70 } },
      margin: { left: 14, right: 14 },
    })
    const cumulY = (doc as any).lastAutoTable.finalY + 8
    if (cumulY > 180) { doc.addPage(); }

    autoTable(doc, {
      startY: cumulY,
      head: [['Projection annuelle (×12)', 'Valeur']],
      body: [
        ['Ventes projetées', money(projected.revenue)],
        ['Bénéfice projeté', money(projected.margin)],
        ['Dépenses projetées', money(projected.expense)],
        ['Résultat net projeté', money(projected.net)],
      ],
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9, textColor: 0 },
      columnStyles: { 1: { halign: 'right', cellWidth: 70 } },
      margin: { left: 14, right: 14 },
    })
    const projY = (doc as any).lastAutoTable.finalY + 8
    if (projY > 200) { doc.addPage(); }

    autoTable(doc, {
      startY: projY,
      head: [['Jour', 'Valeur']],
      body: [
        ['Ventes du jour', money(stats.todayRevenue)],
        ['Dépenses du jour', money(stats.todayExpense)],
        ['Bilan du jour', money(stats.todayNet)],
      ],
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 9, fontStyle: 'bold' },
      bodyStyles: { fontSize: 9, textColor: 0 },
      columnStyles: { 1: { halign: 'right', cellWidth: 70 } },
      margin: { left: 14, right: 14 },
    })

    let y = (doc as any).lastAutoTable.finalY + 8
    if (y > 180) { doc.addPage(); y = 22 }

    autoTable(doc, {
      startY: y,
      head: [['Client', 'Total crédit', 'Remboursé', 'Impayé', 'Statut']],
      body: stats.activeCredits.map(c => [c.customerName, money(c.amount), money(c.paid), money(c.balance), c.status === 'overdue' ? 'En retard' : c.status]),
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: 0 },
      foot: [['TOTAL', money(stats.creditTotal), money(stats.creditPaid), money(stats.creditUnpaid), '']],
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8.5, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 }, 2: { halign: 'right', cellWidth: 40 }, 3: { halign: 'right', cellWidth: 40 } },
      margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 8
    if (y > 200) { doc.addPage(); y = 22 }

    autoTable(doc, {
      startY: y,
      head: [['Mode de paiement', 'Montant encaissé']],
      body: PAYMENT_ORDER.filter(p => stats.monthPaymentTotals[p] > 0).map(p => [PAYMENT_LABELS[p] || p, money(stats.monthPaymentTotals[p])]),
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: 0 },
      columnStyles: { 1: { halign: 'right', cellWidth: 55 } },
      margin: { left: 14, right: 14 },
    })
    y = (doc as any).lastAutoTable.finalY + 5

    autoTable(doc, {
      startY: y,
      head: [['Catégorie', 'Opérations', 'Montant']],
      body: stats.expByCategory.map(e => [e.category, String(e.count), money(e.amount)]),
      theme: 'grid',
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8.5, textColor: 0 },
      margin: { left: 14, right: 14 },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 8
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(`Signature du dirigeant / gérant : __________________________      Signature du comptable : __________________________`, W / 2, finalY, { align: 'center' })
    doc.setFontSize(7)
    doc.setTextColor(100, 100, 100)
    doc.text(`Document généré le ${generatedAt} — NeoX ERP`, W / 2, finalY + 5, { align: 'center' })

    doc.save(`rapport_comptable_${monthKey(year, month)}.pdf`)
  }

  function handlePrint() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.open()
    w.document.write(buildHTML(true))
    w.document.close()
    setTimeout(() => { try { w.focus(); w.print() } catch { /* fenêtre fermée */ } }, 400)
  }

  const years = [] as number[]
  for (let y = now.getFullYear() - 5; y <= now.getFullYear() + 1; y++) years.push(y)

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-surface-900">Comptabilité</h2>
          <p className="text-sm text-surface-500">Performance financière de l'entreprise</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-surface-400" />
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-surface-300 text-sm bg-surface-100">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-surface-300 text-sm bg-surface-100">
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportCSV()} title="Export CSV">
              <FileSpreadsheet className="w-4 h-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportExcel()} title="Export Excel">
              <FileDown className="w-4 h-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportPDF()} title="Export PDF">
              <FileText className="w-4 h-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} title="Imprimer le rapport">
              <Printer className="w-4 h-4" /> Imprimer
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Ventes du mois</p>
              <p className="text-2xl font-bold gradient-text">{formatCurrency(stats.monthRevenue)}</p>
              <p className="text-xs text-surface-500">{stats.monthTransactions} transaction(s)</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium">
            {stats.revenueChange === null ? (
              <Badge variant="default">Mois précédent : aucune vente</Badge>
            ) : (
              <Badge variant={stats.revenueChange >= 0 ? 'success' : 'danger'}>
                {stats.revenueChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {stats.revenueChange >= 0 ? '+' : ''}{stats.revenueChange.toFixed(1)}% vs mois dernier
              </Badge>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5"><Wallet className="w-4 h-4" /> Dépenses du mois</p>
              <p className="text-2xl font-bold text-danger">{formatCurrency(stats.monthExpense)}</p>
              <p className="text-xs text-surface-500">{stats.monthExpenses.length} écriture(s)</p>
            </div>
          </div>
          <div className="mt-3">
            {stats.expenseChange === null ? (
              <Badge variant="default">Moins qu'au mois dernier</Badge>
            ) : stats.expenseChange <= 0 ? (
              <Badge variant="success"><ArrowDownRight className="w-3 h-3" /> {stats.expenseChange.toFixed(1)}% vs mois dernier</Badge>
            ) : (
              <Badge variant="warning"><ArrowUpRight className="w-3 h-3" /> +{stats.expenseChange.toFixed(1)}% vs mois dernier</Badge>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div>
            <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Marge brute</p>
            <p className="text-2xl font-bold text-primary-400">{formatCurrency(stats.monthMargin)}</p>
            <p className="text-xs text-surface-500">Chiffre d'affaires − coût des produits vendus</p>
          </div>
        </Card>

        <Card className="p-5">
          <div>
            <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1.5"><PiggyBank className="w-4 h-4" /> Résultat net</p>
            <p className={`text-2xl font-bold ${stats.monthNet >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(stats.monthNet)}</p>
            <p className="text-xs text-surface-500">Marge brute − dépenses du mois</p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bilans cumulés</CardTitle>
            <Badge variant="info">Depuis le début de l'activité</Badge>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Ventes totales', value: stats.totalRevenue, color: 'text-surface-900' },
              { label: 'Bénéfice total', value: stats.totalMargin, color: 'text-success' },
              { label: 'Dépenses totales', value: stats.totalExpense, color: 'text-danger' },
              { label: 'Résultat total', value: stats.totalNet, color: stats.totalNet >= 0 ? 'text-success' : 'text-danger' },
            ].map(k => (
              <div key={k.label} className="rounded-xl bg-surface-50 border border-surface-200 p-4">
                <p className="text-xs text-surface-500">{k.label}</p>
                <p className={`text-lg font-bold mt-1 ${k.color}`}>{formatCurrency(k.value)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Projection annuelle</CardTitle>
            <Badge variant="info">Estimation valeur du mois ×12</Badge>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Ventes projetées', value: projected.revenue, color: 'text-surface-900' },
              { label: 'Bénéfice projeté', value: projected.margin, color: 'text-success' },
              { label: 'Dépenses projetées', value: projected.expense, color: 'text-danger' },
              { label: 'Résultat net projeté', value: projected.net, color: projected.net >= 0 ? 'text-success' : 'text-danger' },
            ].map(k => (
              <div key={k.label} className="rounded-xl bg-surface-50 border border-surface-200 p-4">
                <p className="text-xs text-surface-500">{k.label}</p>
                <p className={`text-lg font-bold mt-1 ${k.color}`}>{formatCurrency(k.value)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Récapitulatif du jour</CardTitle>
            <Badge variant="info">{new Date().toLocaleDateString('fr-FR')}</Badge>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-surface-500 flex items-center gap-1"><Banknote className="w-3.5 h-3.5" /> Ventes du jour</p>
              <p className="text-lg font-bold mt-1 text-surface-900">{formatCurrency(stats.todayRevenue)}</p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-surface-500 flex items-center gap-1"><Receipt className="w-3.5 h-3.5" /> Dépenses du jour</p>
              <p className="text-lg font-bold mt-1 text-danger">{formatCurrency(stats.todayExpense)}</p>
            </div>
            <div className={`rounded-xl border p-4 ${stats.todayNet >= 0 ? 'bg-emerald-500/10 border-emerald-200' : 'bg-red-500/10 border-red-200'}`}>
              <p className="text-xs font-medium flex items-center gap-1 text-surface-600"><PiggyBank className="w-3.5 h-3.5" /> Bilan du jour</p>
              <p className={`text-lg font-bold mt-1 ${stats.todayNet >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(stats.todayNet)}</p>
              <p className="text-[11px] text-surface-500">{stats.todayNet >= 0 ? 'Positif' : 'Négatif'}</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crédits en cours</CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setCreditsOpen(true); setCreditPage(1) }}>
              <CreditCard className="w-4 h-4" /> Voir le détail
            </Button>
          </CardHeader>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-surface-500">Total crédits</p>
              <p className="text-lg font-bold mt-1 text-surface-900">{formatCurrency(stats.creditTotal)}</p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <p className="text-xs text-surface-500">Remboursés</p>
              <p className="text-lg font-bold mt-1 text-success">{formatCurrency(stats.creditPaid)}</p>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-200 p-4">
              <p className="text-xs font-medium text-surface-600">Impayés</p>
              <p className="text-lg font-bold mt-1 text-danger">{formatCurrency(stats.creditUnpaid)}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par mode de paiement</CardTitle>
            <Badge variant="info">{periodLabel}</Badge>
          </CardHeader>
          <div className="flex flex-col gap-2">
            {PAYMENT_ORDER.filter(p => stats.monthPaymentTotals[p] > 0).map(p => {
              const total = stats.monthRevenue || 1
              const val = stats.monthPaymentTotals[p] || 0
              const pct = (val / total) * 100
              return (
                <div key={p} className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-surface-800 flex items-center gap-1.5">
                      {p === 'cash' ? <Banknote className="w-4 h-4 text-emerald-500" /> : p === 'wave' || p === 'orange' || p === 'mobile' ? <PieChart className="w-4 h-4 text-blue-500" /> : <CreditCard className="w-4 h-4 text-indigo-500" />}
                      {PAYMENT_LABELS[p] || p}
                    </span>
                    <span className="font-bold text-surface-900">{formatCurrency(val)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                    <div className={`h-full rounded-full ${p === 'cash' ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <p className="text-[11px] text-surface-400 mt-1">{pct.toFixed(1)}% des encaissements du mois</p>
                </div>
              )
            })}
            {PAYMENT_ORDER.every(p => !stats.monthPaymentTotals[p]) && (
              <div className="text-center py-8 text-surface-400 text-sm">Aucun encaissement sur la période</div>
            )}
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          <CardHeader className="p-6 pb-2">
            <CardTitle className="text-base">Dépenses détaillées</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setExpensesDetailOpen(true)}>
              <ListRestart className="w-4 h-4" /> Ouvrir
            </Button>
          </CardHeader>
          <div className="overflow-x-auto responsive-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Catégorie</th>
                  <th className="text-center px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Opérations</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {stats.expByCategory.map(e => (
                  <tr key={e.category} className="hover:bg-surface-50">
                    <td data-label="Catégorie" className="px-6 py-3 text-sm font-medium">{e.category}</td>
                    <td data-label="Opérations" className="px-6 py-3 text-center text-sm text-surface-500">{e.count}</td>
                    <td data-label="Montant" className="px-6 py-3 text-right text-sm font-semibold text-danger">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
                {stats.expByCategory.length === 0 && (
                  <tr><td colSpan={3} className="px-6 py-8 text-center text-surface-400 text-sm">Aucune dépense enregistrée</td></tr>
                )}
              </tbody>
              {stats.expByCategory.length > 0 && (
                <tfoot>
                  <tr className="bg-surface-50 border-t border-surface-200">
                    <td className="px-6 py-3 text-sm font-bold">Total</td>
                    <td className="px-6 py-3 text-center text-sm font-bold">{stats.expByCategory.reduce((s, e) => s + e.count, 0)}</td>
                    <td className="px-6 py-3 text-right text-sm font-bold text-danger">{formatCurrency(stats.monthExpense)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventes de la période — {periodLabel}</CardTitle>
          <Badge variant="info">{stats.monthSales.length} vente(s)</Badge>
        </CardHeader>
        <div className="overflow-x-auto responsive-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Facture</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Client</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Total</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-surface-500 uppercase">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {stats.monthSales.slice(0, 60).map(s => (
                <tr key={s.id} className="hover:bg-surface-50">
                  <td data-label="Facture" className="px-6 py-3 text-sm font-medium">{s.invoiceNumber}</td>
                  <td data-label="Client" className="px-6 py-3 text-sm text-surface-600">{s.customerName || 'Divers'}</td>
                  <td data-label="Date" className="px-6 py-3 text-sm text-surface-500">{formatDate(s.createdAt)}</td>
                  <td data-label="Total" className="px-6 py-3 text-right text-sm font-semibold">{formatCurrency(s.total)}</td>
                  <td data-label="Mode" className="px-6 py-3 text-center"><Badge variant="info">{s.paymentMethod === 'split' ? 'Mixte' : (PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod)}</Badge></td>
                </tr>
              ))}
              {stats.monthSales.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-surface-400 text-sm">Aucune vente pour cette période</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={creditsOpen} onClose={() => setCreditsOpen(false)} title="Détail des crédits en cours" size="lg">
        <div className="p-6">
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-3 text-center">
              <p className="text-xs text-surface-500">Total crédits</p>
              <p className="text-lg font-bold text-surface-900">{formatCurrency(stats.creditTotal)}</p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 p-3 text-center">
              <p className="text-xs text-surface-500">Remboursés</p>
              <p className="text-lg font-bold text-success">{formatCurrency(stats.creditPaid)}</p>
            </div>
            <div className="rounded-xl bg-red-500/10 border border-red-200 p-3 text-center">
              <p className="text-xs font-medium text-surface-600">Impayés</p>
              <p className="text-lg font-bold text-danger">{formatCurrency(stats.creditUnpaid)}</p>
            </div>
          </div>
          <div className="overflow-x-auto responsive-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Client</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Total</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Remboursé</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Impayé</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {paginatedCredits.map(c => (
                  <tr key={c.id} className="hover:bg-surface-50">
                    <td data-label="Client" className="px-4 py-3 text-sm font-medium">{c.customerName}</td>
                    <td data-label="Total" className="px-4 py-3 text-right text-sm">{formatCurrency(c.amount)}</td>
                    <td data-label="Remboursé" className="px-4 py-3 text-right text-sm text-success">{formatCurrency(c.paid)}</td>
                    <td data-label="Impayé" className="px-4 py-3 text-right text-sm font-semibold text-danger">{formatCurrency(c.balance)}</td>
                    <td data-label="Statut" className="px-4 py-3 text-center"><Badge variant={c.status === 'overdue' || c.status === 'defaulted' ? 'danger' : c.status === 'active' ? 'warning' : 'success'}>{c.status}</Badge></td>
                  </tr>
                ))}
                {paginatedCredits.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-400 text-sm">Aucun crédit en cours</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {creditTotalRows > pageSize && (
            <div className="mt-4">
              <Pagination page={creditPage} totalPages={creditPageCount} totalItems={creditTotalRows} onPageChange={setCreditPage} />
            </div>
          )}
        </div>
      </Modal>

      <Modal open={expensesDetailOpen} onClose={() => setExpensesDetailOpen(false)} title={`Dépenses de ${periodLabel}`} size="lg">
        <div className="p-6">
          <div className="overflow-x-auto responsive-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Catégorie</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Description</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Mode</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-surface-500 uppercase">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {stats.monthExpenses.slice(0, 200).map(e => (
                  <tr key={e.id} className="hover:bg-surface-50">
                    <td data-label="Date" className="px-4 py-3 text-sm text-surface-500">{formatDate(e.date)}</td>
                    <td data-label="Catégorie" className="px-4 py-3 text-sm font-medium">{e.category}</td>
                    <td data-label="Description" className="px-4 py-3 text-sm text-surface-600 truncate max-w-[220px]">{e.description || '—'}</td>
                    <td data-label="Mode" className="px-4 py-3 text-center"><Badge variant="info">{PAYMENT_LABELS[e.paymentMethod] || e.paymentMethod}</Badge></td>
                    <td data-label="Montant" className="px-4 py-3 text-right text-sm font-semibold text-danger">{formatCurrency(e.amount)}</td>
                  </tr>
                ))}
                {stats.monthExpenses.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-surface-400 text-sm">Aucune dépense pour cette période</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-4">
            <Badge variant="danger">Total {formatCurrency(stats.monthExpense)}</Badge>
          </div>
        </div>
      </Modal>
    </div>
  )
}