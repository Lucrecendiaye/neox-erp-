import type { Sale, CashBookEntry, CashOperation } from '@/types'
import type { Location } from './types'

/**
 * Séparation stricte des caisses :
 *  - 'boutique'  : ventes réalisées directement en boutique
 *  - 'livraison' : argent appartenant à l'entreprise provenant des ventes livrées
 *
 * Règle fondamentale : l'argent appartenant aux livreurs (frais de livraison)
 * n'est jamais compté comme une entrée de caisse de l'entreprise.
 */

export type CashBox = 'boutique' | 'livraison' | 'cash'

export const CASH_BOX_OPTIONS: { value: CashBox | 'all'; label: string }[] = [
  { value: 'boutique', label: 'Caisse boutique' },
  { value: 'livraison', label: 'Caisse livraison' },
  { value: 'cash', label: 'Caisse cash' },
]

export function cashBoxLabel(box: CashBox): string {
  if (box === 'boutique') return 'Caisse boutique'
  if (box === 'livraison') return 'Caisse livraison'
  return 'Caisse cash'
}

const SALE_CATEGORIES = new Set([
  'Encaissement vente',
  'Acompte crédit',
  'Paiement mixte',
  'Encaissement crédit',
])

/** Box of a sale based on its location type. */
export function cashBoxOfSale(sale: Sale | undefined, locationsById: Map<string, Location>): CashBox {
  if (!sale || !sale.locationId) return 'boutique'
  const loc = locationsById.get(sale.locationId)
  return loc?.type === 'warehouse' ? 'boutique' : 'boutique'
}

/** Box of a cashBook movement. Delivery cash goes to 'livraison', manual caisse to 'cash'. */
export function cashBoxOfCashBookEntry(
  e: CashBookEntry,
  salesById: Map<string, Sale>,
  locationsById: Map<string, Location>
): CashBox {
  if (e.category === 'Encaissement livraison') return 'livraison'
  if (e.category === 'Frais de livraison') return 'livraison'
  if (e.category === 'Rémunération livreur') return 'livraison'
  // Opérations manuelles du journal de caisse
  if (e.category === 'Entrée caisse' || e.category === 'Sortie caisse' || e.category === 'Entrée cash' || e.category === 'Sortie cash') {
    return 'cash'
  }
  if (SALE_CATEGORIES.has(e.category) && e.linkedId) {
    const sale = salesById.get(e.linkedId)
    if (sale) return cashBoxOfSale(sale, locationsById)
  }
  return 'cash'
}

/** Box of a manual cash operation (entrée/sortie cash) : caisse cash. */
export function cashBoxOfCashOp(_o: CashOperation, _locationsById: Map<string, Location>): CashBox {
  return 'cash'
}

export interface CashBoxReport {
  box: CashBox
  /** Total ventes (complétées) attribuables à la caisse, toute période confondue */
  totalSales: number
  /** Entrées de caisse sur la période */
  inflows: number
  /** Sorties de caisse sur la période */
  outflows: number
  /** Solde historique (toutes périodes) */
  balance: number
  countIn: number
  countOut: number
  saleCount: number
}

export function buildCashBoxReports(
  sales: Sale[],
  cashBook: CashBookEntry[],
  cashOps: CashOperation[],
  locations: Location[],
  start: Date,
  end: Date
): Record<CashBox, CashBoxReport> {
  const locationsById = new Map<string, Location>(locations.map(l => [l.id, l]))
  const salesById = new Map<string, Sale>(sales.map(s => [s.id, s]))

  const report: Record<CashBox, CashBoxReport> = {
    boutique: { box: 'boutique', totalSales: 0, inflows: 0, outflows: 0, balance: 0, countIn: 0, countOut: 0, saleCount: 0 },
    livraison: { box: 'livraison', totalSales: 0, inflows: 0, outflows: 0, balance: 0, countIn: 0, countOut: 0, saleCount: 0 },
    cash: { box: 'cash', totalSales: 0, inflows: 0, outflows: 0, balance: 0, countIn: 0, countOut: 0, saleCount: 0 },
  }

  for (const s of sales || []) {
    if (s.status !== 'completed') continue
    const box = cashBoxOfSale(s, locationsById)
    const r = report[box]
    r.totalSales += s.total || 0
    r.saleCount += 1
  }

  const inRange = (d: string | undefined | null) => {
    if (!d) return false
    const t = new Date(d).getTime()
    return t >= start.getTime() && t <= end.getTime()
  }

  for (const e of cashBook || []) {
    const box = cashBoxOfCashBookEntry(e, salesById, locationsById)
    const r = report[box]
    const amount = e.amount || 0
    if (e.type === 'in') {
      r.balance += amount
      if (inRange(e.date)) { r.inflows += amount; r.countIn += 1 }
    } else {
      r.balance -= amount
      if (inRange(e.date)) { r.outflows += amount; r.countOut += 1 }
    }
  }

  for (const o of cashOps || []) {
    if (o.status === 'cancelled') continue
    const box = cashBoxOfCashOp(o, locationsById)
    const r = report[box]
    const amount = o.amount || 0
    if (o.type === 'in') {
      r.balance += amount
      if (inRange(o.date)) { r.inflows += amount; r.countIn += 1 }
    } else {
      r.balance -= amount
      if (inRange(o.date)) { r.outflows += amount; r.countOut += 1 }
    }
  }

  return report
}
