import type { Sale, SaleItem, CashBookEntry, CashOperation, CreditPayment, Credit, Product } from '@/types'

export type PeriodKey = 'today' | 'yesterday' | '7d' | 'month' | 'prevMonth' | 'quarter' | 'semester' | 'year' | 'custom'

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'yesterday', label: 'Hier' },
  { value: '7d', label: '7 jours' },
  { value: 'month', label: 'Ce mois' },
  { value: 'prevMonth', label: 'Mois précédent' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'semester', label: 'Ce semestre' },
  { value: 'year', label: 'Cette année' },
  { value: 'custom', label: 'Personnalisée' },
]

export const PERIOD_LABELS: Record<PeriodKey, string> = PERIOD_OPTIONS.reduce((acc, o) => {
  acc[o.value] = o.label
  return acc
}, {} as Record<PeriodKey, string>)

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

export interface PeriodBounds {
  start: Date
  end: Date
}

export function getPeriodBounds(key: PeriodKey, now: Date = new Date(), custom?: { start?: string; end?: string }): PeriodBounds {
  switch (key) {
    case 'today':
      return { start: startOfDay(now), end: now }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(now.getDate() - 1)
      return { start: startOfDay(y), end: endOfDay(y) }
    }
    case '7d': {
      const d = new Date(now)
      d.setDate(now.getDate() - 6)
      return { start: startOfDay(d), end: now }
    }
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
    case 'prevMonth': {
      const y = now.getFullYear()
      const m = now.getMonth() - 1
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      return { start: new Date(now.getFullYear(), q * 3, 1), end: now }
    }
    case 'semester': {
      const h = Math.floor(now.getMonth() / 6)
      return { start: new Date(now.getFullYear(), h * 6, 1), end: now }
    }
    case 'year':
      return { start: new Date(now.getFullYear(), 0, 1), end: now }
    case 'custom': {
      const s = custom?.start ? new Date(`${custom.start}T00:00:00`) : startOfDay(now)
      const e = custom?.end ? new Date(`${custom.end}T23:59:59`) : now
      return { start: s, end: e.getTime() >= now.getTime() ? now : e }
    }
  }
}

export function inRange(dateStr: string | Date | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  return t >= start.getTime() && t <= end.getTime()
}

export function completedSales(sales: Sale[]): Sale[] {
  return (sales || []).filter(s => s.status === 'completed')
}

export function periodSales(sales: Sale[], start: Date, end: Date): Sale[] {
  return completedSales(sales).filter(s => inRange(s.createdAt, start, end))
}

export function revenue(list: Sale[]): number {
  return (list || []).reduce((sum, s) => sum + (s.total || 0), 0)
}

export function revenuePaid(list: Sale[]): number {
  return (list || []).reduce((sum, s) => sum + (s.paid || 0), 0)
}

function itemQty(i: SaleItem): number {
  return (i.quantity || 0) * (i.unitQuantity || 1)
}

export function cogs(list: Sale[], products: Product[]): number {
  let sum = 0
  for (const sale of list || []) {
    for (const i of sale.items || []) {
      const p = (products || []).find(pr => pr.id === i.productId)
      sum += itemQty(i) * (p?.purchasePrice || 0)
    }
  }
  return sum
}

export function isCharge(op: CashOperation): boolean {
  return op.type === 'out' && (op.nature === undefined || op.nature === 'charge')
}

export interface TreasurySummary {
  inflows: number
  outflows: number
  balance: number
  runningBalance: number
  charges: number
}

export function treasury(cashBook: CashBookEntry[], cashOps: CashOperation[], start: Date, end: Date): TreasurySummary {
  let inflows = 0
  let outflows = 0
  let charges = 0
  let runningBalance = 0

  for (const e of cashBook || []) {
    if (inRange(e.date, start, end)) {
      runningBalance += e.type === 'in' ? e.amount : -e.amount
      if (e.type === 'in') inflows += e.amount
      else {
        outflows += e.amount
        charges += e.amount
      }
    }
  }

  for (const o of cashOps || []) {
    if (o.status === 'cancelled') continue
    if (inRange(o.date, start, end)) {
      runningBalance += o.type === 'in' ? o.amount : -o.amount
      if (o.type === 'in') inflows += o.amount
      else {
        outflows += o.amount
        if (isCharge(o)) charges += o.amount
      }
    }
  }

  return { inflows, outflows, balance: inflows - outflows, runningBalance, charges }
}

export function receivables(credits: Credit[], now: Date = new Date()): { total: number; count: number; overdueCount: number; collected: number } {
  let total = 0
  let count = 0
  let overdueCount = 0
  let collected = 0
  for (const c of credits || []) {
    if (c.status === 'active' || c.status === 'overdue') {
      total += c.balance || 0
      collected += c.paid || 0
      count++
      if (c.dueDate && new Date(c.dueDate).getTime() < now.getTime()) overdueCount++
    }
  }
  return { total, count, overdueCount, collected }
}

export function creditCollected(creditPayments: CreditPayment[], start: Date, end: Date): number {
  return (creditPayments || []).filter(p => inRange(p.date, start, end)).reduce((s, p) => s + p.amount, 0)
}

export interface DashboardStats {
  revenue: number
  salesCount: number
  grossProfit: number
  collected: number
  receivables: { total: number; count: number; overdueCount: number; collected: number }
  creditCollected: number
  treasury: TreasurySummary
  netProfit: number
  netMargin: number
}

export function computeDashboardStats(
  sales: Sale[],
  products: Product[],
  credits: Credit[],
  creditPayments: CreditPayment[],
  cashBook: CashBookEntry[],
  cashOps: CashOperation[],
  bounds: PeriodBounds,
  now: Date = new Date()
): DashboardStats {
  const ps = periodSales(sales, bounds.start, bounds.end)
  const rev = revenue(ps)
  const grossProfit = rev - cogs(ps, products)
  const tr = treasury(cashBook, cashOps, bounds.start, bounds.end)
  const recv = receivables(credits, now)
  const collectedCredit = creditCollected(creditPayments, bounds.start, bounds.end)
  const netProfit = grossProfit - tr.charges
  return {
    revenue: rev,
    salesCount: ps.length,
    grossProfit,
    collected: tr.inflows,
    receivables: recv,
    creditCollected: collectedCredit,
    treasury: tr,
    netProfit,
    netMargin: grossProfit > 0 ? (netProfit / grossProfit) * 100 : 0,
  }
}

export interface ChartBucket {
  label: string
  revenue: number
  grossProfit: number
  netProfit: number
  collected: number
}

type BucketSize = 'day' | 'week' | 'month'

function bucketSizeFor(spanDays: number): BucketSize {
  if (spanDays <= 9) return 'day'
  if (spanDays <= 100) return 'week'
  return 'month'
}

function bucketLabel(ts: number, size: BucketSize): string {
  const d = new Date(ts)
  if (size === 'day') return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  if (size === 'week') {
    const start = new Date(ts)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return `${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
  }
  return d.toLocaleDateString('fr-FR', { month: 'short' })
}

function buildBuckets(start: Date, end: Date): { label: string; startTs: number; endTs: number }[] {
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const size = bucketSizeFor(spanDays)
  const buckets: { label: string; startTs: number; endTs: number }[] = []
  const stepMs = size === 'day' ? 86400000 : size === 'week' ? 7 * 86400000 : 30 * 86400000

  const first = start.getTime()
  for (let t = first; t <= end.getTime(); t += stepMs) {
    const bEnd = Math.min(t + stepMs - 1, end.getTime())
    buckets.push({ label: bucketLabel(t, size), startTs: t, endTs: bEnd })
  }
  return buckets
}

export function buildChart(
  sales: Sale[],
  cashBook: CashBookEntry[],
  cashOps: CashOperation[],
  products: Product[],
  bounds: PeriodBounds
): ChartBucket[] {
  const ps = completedSales(sales)
  const buckets = buildBuckets(bounds.start, bounds.end)
  return buckets.map(b => {
    const inBucket = (dateStr: string | undefined) => {
      if (!dateStr) return false
      const t = new Date(dateStr).getTime()
      return t >= b.startTs && t <= b.endTs
    }
    const bucketSales = ps.filter(s => inBucket(s.createdAt))
    const rev = revenue(bucketSales)
    const gross = rev - cogs(bucketSales, products)
    const charges = (cashBook || []).filter(e => e.type === 'out' && inBucket(e.date)).reduce((s, e) => s + e.amount, 0)
      + (cashOps || []).filter(o => o.type === 'out' && o.status !== 'cancelled' && isCharge(o) && inBucket(o.date)).reduce((s, o) => s + o.amount, 0)
    const collected = (cashBook || []).filter(e => e.type === 'in' && inBucket(e.date)).reduce((s, e) => s + e.amount, 0)
      + (cashOps || []).filter(o => o.type === 'in' && o.status !== 'cancelled' && inBucket(o.date)).reduce((s, o) => s + o.amount, 0)
    return {
      label: b.label,
      revenue: rev,
      grossProfit: gross,
      netProfit: gross - charges,
      collected,
    }
  })
}

export interface TopProduct {
  name: string
  qty: number
  revenue: number
}

export function topProducts(list: Sale[], limit = 7): TopProduct[] {
  const map = new Map<string, TopProduct>()
  for (const sale of list || []) {
    for (const i of sale.items || []) {
      const existing = map.get(i.productName) || { name: i.productName || 'Inconnu', qty: 0, revenue: 0 }
      existing.qty += itemQty(i)
      existing.revenue += i.total || 0
      map.set(existing.name, existing)
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit)
}

export interface TopClient {
  name: string
  count: number
  revenue: number
}

export function topClients(list: Sale[], limit = 5): TopClient[] {
  const map = new Map<string, TopClient>()
  for (const sale of list || []) {
    const name = sale.customerName || 'Client divers'
    const existing = map.get(name) || { name, count: 0, revenue: 0 }
    existing.count++
    existing.revenue += sale.total || 0
    map.set(name, existing)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

export interface RecentTx {
  id: string
  kind: 'vente' | 'credit' | 'cashbook_in' | 'cashbook_out' | 'cash_in' | 'cash_out'
  label: string
  ref: string
  amount: number
  date: string
  party?: string
  userId?: string
}

export function recentTransactions(
  sales: Sale[],
  creditPayments: CreditPayment[],
  cashBook: CashBookEntry[],
  cashOps: CashOperation[],
  salesById: Map<string, Sale>,
  limit = 10
): RecentTx[] {
  const txns: RecentTx[] = []
  for (const s of completedSales(sales)) {
    txns.push({ id: `sale-${s.id}`, kind: 'vente', label: 'Vente', ref: s.invoiceNumber || s.id.slice(0, 8), amount: s.total || 0, date: s.createdAt, party: s.customerName, userId: s.userId })
  }
  for (const p of creditPayments || []) {
    const sale = p.saleId ? salesById.get(p.saleId) : undefined
    txns.push({ id: `credit-${p.id}`, kind: 'credit', label: 'Règlement crédit', ref: sale?.invoiceNumber || p.customerId?.slice(0, 8) || p.id.slice(0, 8), amount: p.amount, date: p.date, userId: p.userId })
  }
  for (const e of cashBook || []) {
    txns.push({
      id: `cb-${e.id}`,
      kind: e.type === 'in' ? 'cashbook_in' : 'cashbook_out',
      label: e.type === 'in' ? 'Entrée caisse' : 'Sortie caisse',
      ref: e.reference || e.id.slice(0, 8),
      amount: e.amount,
      date: e.date,
      party: e.partyName,
      userId: e.userId,
    })
  }
  for (const o of cashOps || []) {
    if (o.status === 'cancelled') continue
    txns.push({
      id: `op-${o.id}`,
      kind: o.type === 'in' ? 'cash_in' : 'cash_out',
      label: o.type === 'in' ? 'Entrée cash' : 'Sortie cash',
      ref: o.reference || o.number || o.id.slice(0, 8),
      amount: o.amount,
      date: o.date,
      party: o.partyName,
      userId: o.userId,
    })
  }
  return txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, limit)
}
