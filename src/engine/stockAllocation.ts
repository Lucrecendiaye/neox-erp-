import db from '@/db'
import type { SaleItem } from '@/types'
import type { Location } from './types'

export interface StockSourceOption {
  locationId: string
  locationName: string
  type: 'shop' | 'warehouse'
  quantity: number
}

export class StockAllocationRequiredError extends Error {
  readonly productId: string
  readonly productName: string
  readonly requestedQuantity: number
  readonly shopQuantity: number
  readonly missingQuantity: number
  readonly sources: StockSourceOption[]

  constructor(input: {
    productId: string
    productName: string
    requestedQuantity: number
    shopQuantity: number
    missingQuantity: number
    sources: StockSourceOption[]
  }) {
    super(`Choisissez un dépôt pour compléter "${input.productName}" : ${input.missingQuantity} unité(s) manquante(s)`)
    this.name = 'StockAllocationRequiredError'
    this.productId = input.productId
    this.productName = input.productName
    this.requestedQuantity = input.requestedQuantity
    this.shopQuantity = input.shopQuantity
    this.missingQuantity = input.missingQuantity
    this.sources = input.sources
  }
}

async function locationsFor(businessId: string): Promise<Location[]> {
  return db.locations.where('businessId').equals(businessId).filter(l => l.isActive !== false).toArray()
}

export async function getStockSources(businessId: string, productId: string, defaultLocationId?: string): Promise<StockSourceOption[]> {
  const locations = await locationsFor(businessId)
  const stocks = await db.productStocks.where('businessId').equals(businessId).filter(s => s.productId === productId).toArray()
  const stockByLocation = new Map(stocks.map(s => [s.locationId, s.quantity]))
  const knownIds = new Set(locations.map(l => l.id))
  const sources = locations
    .filter(l => l.type === 'shop' || l.type === 'warehouse')
    .sort((a, b) => (a.type === 'shop' ? -1 : b.type === 'shop' ? 1 : a.name.localeCompare(b.name)))
    .map(l => ({
      locationId: l.id,
      locationName: l.name,
      type: l.type,
      quantity: stockByLocation.get(l.id) || 0,
    }))
  if (defaultLocationId && !knownIds.has(defaultLocationId)) {
    sources.unshift({ locationId: defaultLocationId, locationName: 'Boutique', type: 'shop', quantity: stockByLocation.get(defaultLocationId) || 0 })
  }
  return sources
}

function baseQuantity(item: SaleItem): number {
  return item.quantity * (item.unitQuantity || 1)
}

/**
 * Allocates each unassigned sale line from the shop first, then from the
 * warehouse explicitly selected for that product. No transfer is created.
 */
export async function allocateSaleItems(
  items: SaleItem[],
  businessId: string,
  defaultLocationId: string,
  sourceSelections: Record<string, string> = {},
): Promise<SaleItem[]> {
  const sourceCache = new Map<string, StockSourceOption[]>()
  const consumed = new Map<string, number>()
  const result: SaleItem[] = []

  async function sources(productId: string) {
    let value = sourceCache.get(productId)
    if (!value) {
      value = await getStockSources(businessId, productId, defaultLocationId)
      sourceCache.set(productId, value)
    }
    return value
  }

  function remaining(productId: string, source: StockSourceOption) {
    return Math.max(0, source.quantity - (consumed.get(`${productId}::${source.locationId}`) || 0))
  }

  function addAllocation(item: SaleItem, source: StockSourceOption, quantity: number, first: boolean) {
    const unitQty = item.unitQuantity || 1
    const baseQty = quantity * unitQty
    const allocated: SaleItem = {
      ...item,
      quantity,
      discount: first ? item.discount : 0,
      total: quantity * item.unitPrice - (first ? item.discount : 0),
      locationId: source.locationId,
    }
    result.push(allocated)
    const key = `${item.productId}::${source.locationId}`
    consumed.set(key, (consumed.get(key) || 0) + baseQty)
  }

  for (const item of items) {
    const requested = Number(item.quantity) || 0
    if (requested <= 0) continue
    const unitQty = item.unitQuantity || 1
    const requiredBase = baseQuantity(item)
    const availableSources = await sources(item.productId)
    // Existing source assignments remain authoritative for historical or
    // already allocated lines, but they are still checked before deduction.
    if (item.locationId) {
      const assigned = availableSources.find(s => s.locationId === item.locationId)
      if (!assigned) {
        throw new Error(`Stock insuffisant pour "${item.productName}" dans cet emplacement`)
      }
      if (assigned.type === 'shop' && remaining(item.productId, assigned) < requiredBase) {
        const shopUnits = Math.floor(remaining(item.productId, assigned) / unitQty)
        if (shopUnits > 0) addAllocation(item, assigned, shopUnits, true)
        const missing = requested - shopUnits
        const warehouses = availableSources.filter(s => s.type === 'warehouse' && remaining(item.productId, s) >= unitQty)
        const selectedId = sourceSelections[item.productId]
        const selected = selectedId ? availableSources.find(s => s.locationId === selectedId) : warehouses.length === 1 ? warehouses[0] : undefined
        const selectedRemainingUnits = selected ? Math.floor(remaining(item.productId, selected) / unitQty) : 0
        if (!selected || selected.type !== 'warehouse' || selectedRemainingUnits < missing) {
          throw new StockAllocationRequiredError({
            productId: item.productId,
            productName: item.productName,
            requestedQuantity: requested,
            shopQuantity: assigned.quantity,
            missingQuantity: missing,
            sources: availableSources,
          })
        }
        addAllocation(item, selected, missing, shopUnits <= 0)
        continue
      }
      if (remaining(item.productId, assigned) < requiredBase) {
        throw new Error(`Stock insuffisant pour "${item.productName}" dans ${assigned.locationName}`)
      }
      addAllocation(item, assigned, requested, true)
      continue
    }

    const shop = availableSources.find(s => s.type === 'shop' && s.locationId === defaultLocationId)
      || availableSources.find(s => s.type === 'shop')
    const shopUnits = shop ? Math.floor(remaining(item.productId, shop) / unitQty) : 0
    const shopPart = Math.min(requested, shopUnits)
    if (shop && shopPart > 0) addAllocation(item, shop, shopPart, true)

    const missing = requested - shopPart
    if (missing <= 0) continue

    const warehouses = availableSources.filter(s => s.type === 'warehouse' && remaining(item.productId, s) >= unitQty)
    const selectedId = sourceSelections[item.productId]
    const selected = selectedId ? availableSources.find(s => s.locationId === selectedId) : warehouses.length === 1 ? warehouses[0] : undefined
    const selectedRemainingUnits = selected ? Math.floor(remaining(item.productId, selected) / unitQty) : 0

    if (!selected || selected.type !== 'warehouse' || selectedRemainingUnits < missing) {
      throw new StockAllocationRequiredError({
        productId: item.productId,
        productName: item.productName,
        requestedQuantity: requested,
        shopQuantity: shop?.quantity || 0,
        missingQuantity: missing,
        sources: availableSources,
      })
    }
    addAllocation(item, selected, missing, shopPart <= 0)
  }

  return result
}
