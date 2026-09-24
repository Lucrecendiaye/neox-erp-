import type { Sale, Product, User, AuditLog } from '@/types'
import { completedSales, inRange, type PeriodBounds } from '@/engine/dashboardStats'

export type UserGranularity = 'day' | 'month' | 'semester'

export interface UserSalesStats {
  userId: string
  userName: string
  salesCount: number
  revenue: number
  cogs: number
  grossProfit: number
  avgBasket: number
  lastActivity: string
}

function itemQty(i: { quantity: number; unitQuantity?: number }): number {
  return (i.quantity || 0) * (i.unitQuantity || 1)
}

export function salesCogs(list: Sale[], products: Product[]): number {
  let sum = 0
  for (const sale of list || []) {
    for (const i of sale.items || []) {
      const p = (products || []).find(pr => pr.id === i.productId)
      sum += itemQty(i) * (p?.purchasePrice || 0)
    }
  }
  return sum
}

export function resolveUser(
  users: User[] | undefined,
  userId: string
): User | undefined {
  if (!users || !userId) return undefined
  return users.find(u => u.id === userId || (u.authUserId && u.authUserId === userId))
}

export function computeUserStats(
  sales: Sale[],
  products: Product[],
  users: User[] = []
): UserSalesStats[] {
  const keyToRow = new Map<string, UserSalesStats>()
  const seen = new Set<UserSalesStats>()

  const ensureRow = (userId: string): UserSalesStats => {
    let row = keyToRow.get(userId)
    if (!row) {
      row = { userId, userName: '', salesCount: 0, revenue: 0, cogs: 0, grossProfit: 0, avgBasket: 0, lastActivity: '' }
      keyToRow.set(userId, row)
      seen.add(row)
    }
    return row
  }

  for (const u of users || []) {
    const row = ensureRow(u.id)
    row.userName = u.name
    if (u.authUserId) keyToRow.set(u.authUserId, row)
  }

  for (const s of completedSales(sales) || []) {
    const uid = s.userId || ''
    const row = ensureRow(uid)
    row.salesCount++
    row.revenue += s.total || 0
    row.cogs += salesCogs([s], products)
    row.lastActivity = !row.lastActivity || s.createdAt > row.lastActivity ? s.createdAt : row.lastActivity
  }

  for (const row of seen) {
    row.grossProfit = row.revenue - row.cogs
    row.avgBasket = row.salesCount > 0 ? row.revenue / row.salesCount : 0
  }
  return [...seen].sort((a, b) => b.revenue - a.revenue)
}

export function filterSalesByUsers(sales: Sale[] | undefined, userIds: string[] | null): Sale[] {
  const all = completedSales(sales || [])
  if (!userIds || userIds.length === 0) return all
  return all.filter(s => userIds.includes(s.userId || ''))
}

export function periodSalesOf(sales: Sale[], start: Date, end: Date): Sale[] {
  return completedSales(sales).filter(s => inRange(s.createdAt, start, end))
}

export interface SeriesPoint {
  label: string
  revenue: number
  cogs: number
  grossProfit: number
  count: number
}

export function bucketLabel(ts: number, granularity: UserGranularity): string {
  const d = new Date(ts)
  if (granularity === 'day') return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  if (granularity === 'semester') {
    const h = Math.floor(d.getMonth() / 6)
    return `${d.getFullYear()} ${h === 0 ? 'S1' : 'S2'}`
  }
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
}

export function buildUserSeries(
  sales: Sale[],
  products: Product[],
  bounds: PeriodBounds,
  granularity: UserGranularity = 'day'
): SeriesPoint[] {
  const ps = completedSales(sales)
  const byBucket = new Map<string, SeriesPoint>()
  const stepMs = granularity === 'day' ? 86400000 : granularity === 'month' ? 30 * 86400000 : 183 * 86400000

  let t = bounds.start.getTime()
  while (t <= bounds.end.getTime()) {
    const label = bucketLabel(t, granularity)
    const bEnd = Math.min(t + stepMs - 1, bounds.end.getTime())
    const inBucket = (dateStr: string | undefined) => {
      if (!dateStr) return false
      const x = new Date(dateStr).getTime()
      return x >= t && x <= bEnd
    }
    const bucketSales = ps.filter(s => inBucket(s.createdAt))
    const rev = bucketSales.reduce((sum, s) => sum + (s.total || 0), 0)
    const c = salesCogs(bucketSales, products)
    const existing = byBucket.get(label)
    if (existing) {
      existing.revenue += rev
      existing.cogs += c
      existing.grossProfit = existing.revenue - existing.cogs
      existing.count += bucketSales.length
    } else {
      byBucket.set(label, {
        label,
        revenue: rev,
        cogs: c,
        grossProfit: rev - c,
        count: bucketSales.length,
      })
    }
    t += stepMs
  }
  return [...byBucket.values()]
}

export type AuditVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

export interface AuditMeta {
  label: string
  variant: AuditVariant
}

const ACTION_META: Record<string, AuditMeta> = {
  create: { label: 'Création', variant: 'success' },
  edit: { label: 'Modification', variant: 'warning' },
  delete: { label: 'Suppression', variant: 'danger' },
  cancel: { label: 'Annulation', variant: 'danger' },
  payment: { label: 'Paiement', variant: 'success' },
  receive: { label: 'Réception', variant: 'success' },
  validate: { label: 'Validation', variant: 'success' },
  duplicate: { label: 'Duplication', variant: 'info' },
  sign: { label: 'Signature', variant: 'info' },
  adjust: { label: 'Ajustement', variant: 'warning' },
  remove_stock: { label: 'Retrait stock', variant: 'warning' },
  user_created: { label: 'Utilisateur créé', variant: 'success' },
  user_updated: { label: 'Utilisateur modifié', variant: 'warning' },
  user_deleted: { label: 'Utilisateur supprimé', variant: 'danger' },
  user_disabled: { label: 'Utilisateur bloqué', variant: 'danger' },
  user_enabled: { label: 'Utilisateur activé', variant: 'success' },
  password_reset: { label: 'Mot de passe réinitialisé', variant: 'warning' },
  create_sale: { label: 'Vente', variant: 'success' },
  pay: { label: 'Encaissement', variant: 'success' },
}

export function auditMeta(action: string): AuditMeta {
  if (ACTION_META[action]) return ACTION_META[action]
  const base = action.split('_')[0]
  if (ACTION_META[base]) return ACTION_META[base]
  return { label: action, variant: 'info' }
}

export function entityLabel(entity: string): string {
  const labels: Record<string, string> = {
    sale: 'Vente',
    credit: 'Crédit',
    credit_payment: 'Paiement crédit',
    purchase: 'Achat',
    transfer: 'Transfert',
    bon_sortie: 'Bon de sortie',
    stock: 'Stock',
    supplier_invoice: 'Facture fournisseur',
    compensation: 'Compensation',
    user: 'Utilisateur',
    cash_operation: 'Opération cash',
    cashbook: 'Caisse',
    location: 'Emplacement',
    product: 'Produit',
    customer: 'Client',
  }
  return labels[entity] || entity
}

export interface AuditFilters {
  userIds?: string[] | null
  actions?: string[] | null
  entities?: string[] | null
  search?: string
  start?: Date
  end?: Date
}

export function filterAuditLogs(logs: AuditLog[] | undefined, f: AuditFilters = {}): AuditLog[] {
  const all = logs || []
  let out = all
  if (f.userIds && f.userIds.length > 0) {
    out = out.filter(l => f.userIds!.includes(l.userId))
  }
  if (f.actions && f.actions.length > 0) {
    out = out.filter(l => f.actions!.includes(l.action))
  }
  if (f.entities && f.entities.length > 0) {
    out = out.filter(l => f.entities!.includes(l.entity))
  }
  if (f.start && f.end) {
    out = out.filter(l => inRange(l.createdAt, f.start as Date, f.end as Date))
  }
  if (f.search && f.search.trim()) {
    const q = f.search.trim().toLowerCase()
    const haystack = (l: AuditLog) => [
      l.action, l.entity, l.entityId, l.userName, l.userLoginId,
      l.details, l.oldData, l.newData, entityLabel(l.entity), auditMeta(l.action).label,
    ].filter(Boolean).join(' ').toLowerCase()
    out = out.filter(l => haystack(l).includes(q))
  }
  return out
}

export function parseJsonData(raw?: string): Record<string, string> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        out[k] = typeof v === 'string' ? v : JSON.stringify(v)
      }
      return out
    }
    return null
  } catch {
    return null
  }
}

export function extractOldNew(log: AuditLog): { old: Record<string, string> | null; new: Record<string, string> | null } {
  return { old: parseJsonData(log.oldData), new: parseJsonData(log.newData) }
}