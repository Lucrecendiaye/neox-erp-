import { generateId } from './utils'
import { queueOfflineOperation } from './syncEngine'

let offlineCounter = parseInt(localStorage.getItem('neox-offline-counter') || '0', 10)

function getNextOfflineNumber(): string {
  offlineCounter++
  localStorage.setItem('neox-offline-counter', String(offlineCounter))
  return `OFF-${String(offlineCounter).padStart(5, '0')}`
}

export async function processOfflineSale(saleData: Record<string, unknown>): Promise<string> {
  const offlineNumber = getNextOfflineNumber()
  const sale = {
    ...saleData,
    id: saleData.id || generateId(),
    invoiceNumber: offlineNumber,
    status: 'pending_sync',
    createdAt: new Date().toISOString(),
  }

  await queueOfflineOperation('sales' as any, 'insert', sale)
  return offlineNumber
}

export function resetOfflineCounter(): void {
  localStorage.setItem('neox-offline-counter', '0')
  offlineCounter = 0
}
