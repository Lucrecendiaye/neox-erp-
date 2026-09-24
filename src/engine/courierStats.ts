import type { Delivery } from '@/types'
import { getDateRangeBounds, inDateRange, type DateRangeKey } from '@/lib/dateRange'

export interface CourierStatsRow {
  courierId: string
  courierName: string
  totalDeliveries: number
  delivered: number
  returned: number
  failed: number
  cancelled: number
  inProgress: number
  productValue: number
  feeClient: number
  feeShop: number
  fees: number
  companyPortion: number
  courierEarnings: number
  courierPayments: number
  pendingToCourier: number
}

function deliveryDate(d: Delivery, now: Date): string {
  return d.deliveredAt || d.returnedAt || d.cancelledAt || d.createdAt || now.toISOString()
}

/** Separe strictement l'argent de l'entreprise (ventes produits) du revenu du livreur
 *  (frais de livraison client + boutique). Aucun montant n'est compté deux fois :
 *  les frais ne font jamais partie du CA entreprise. */
export function compileCourierStats(
  deliveries: Delivery[],
  range: DateRangeKey,
  customStart?: string,
  customEnd?: string
): CourierStatsRow[] {
  const now = new Date()
  const bounds = getDateRangeBounds(range, customStart, customEnd)
  const periodDeliveries = deliveries.filter(d =>
    inDateRange(deliveryDate(d, now), bounds)
  )

  const byCourier = new Map<string, CourierStatsRow>()
  for (const d of periodDeliveries) {
    const key = d.courierId || '__none__'
    let row = byCourier.get(key)
    if (!row) {
      row = {
        courierId: d.courierId || '',
        courierName: d.courierName || 'Sans livreur',
        totalDeliveries: 0, delivered: 0, returned: 0, failed: 0, cancelled: 0, inProgress: 0,
        productValue: 0, feeClient: 0, feeShop: 0, fees: 0, companyPortion: 0,
        courierEarnings: 0, courierPayments: 0, pendingToCourier: 0,
      }
      byCourier.set(key, row)
    }

    row.totalDeliveries++
    if (d.status === 'delivered') row.delivered++
    else if (d.status === 'failed') row.failed++
    else if (d.status === 'cancelled') row.cancelled++
    else row.inProgress++

    const productValue = (d.subtotal || 0) - (d.discount || 0)
    const fees = (d.deliveryFeeClient || 0) + (d.deliveryFeeShop || 0)

    // Seules les livraisons réellement livrées génèrent un revenu pour le livreur.
    // Une livraison retournée/annulée ne compte plus dans les frais ni dans ce qui
    // reste dû au livreur.
    if (d.status === 'delivered') {
      row.companyPortion += productValue
      row.productValue += productValue
      row.feeClient += d.deliveryFeeClient || 0
      row.feeShop += d.deliveryFeeShop || 0
      row.fees += fees
      row.courierEarnings += fees
    } else {
      row.productValue += productValue
    }

    if (d.courierPayDecision?.payCourier) {
      row.courierPayments += d.courierPayDecision.amount || 0
    }
  }

  const rows = Array.from(byCourier.values())
  for (const row of rows) {
    row.pendingToCourier = Math.max(0, row.courierEarnings - row.courierPayments)
  }
  return rows.sort((a, b) => b.totalDeliveries - a.totalDeliveries)
}

export interface GlobalCourierStats {
  rows: CourierStatsRow[]
  totalDeliveries: number
  delivered: number
  returned: number
  failed: number
  inProgress: number
  productValue: number
  fees: number
  companyPortion: number
  courierEarnings: number
  courierPayments: number
  pendingToCourier: number
}

export function summarizeCourierStats(rows: CourierStatsRow[]): GlobalCourierStats {
  return {
    rows,
    totalDeliveries: rows.reduce((s, r) => s + r.totalDeliveries, 0),
    delivered: rows.reduce((s, r) => s + r.delivered, 0),
    returned: rows.reduce((s, r) => s + r.returned + r.failed, 0),
    failed: rows.reduce((s, r) => s + r.failed, 0),
    inProgress: rows.reduce((s, r) => s + r.inProgress, 0),
    productValue: rows.reduce((s, r) => s + r.productValue, 0),
    fees: rows.reduce((s, r) => s + r.fees, 0),
    companyPortion: rows.reduce((s, r) => s + r.companyPortion, 0),
    courierEarnings: rows.reduce((s, r) => s + r.courierEarnings, 0),
    courierPayments: rows.reduce((s, r) => s + r.courierPayments, 0),
    pendingToCourier: rows.reduce((s, r) => s + r.pendingToCourier, 0),
  }
}