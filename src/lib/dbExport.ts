import db from '@/db'

export async function exportDBToJSON(): Promise<string> {
  const tables = [
    'products', 'categories', 'stockMovements', 'customers',
    'suppliers', 'sales', 'purchases', 'invoices',
    'accountingEntries', 'accounts', 'credits', 'auditLogs',
    'users', 'settings', 'notifications',
  ] as const

  const data: Record<string, unknown> = {}
  for (const table of tables) {
    data[table] = await (db as any)[table].toArray()
  }
  return JSON.stringify(data, null, 2)
}

export async function importDBFromJSON(json: string): Promise<number> {
  const data = JSON.parse(json)
  let total = 0

  const tables = [
    'products', 'categories', 'stockMovements', 'customers',
    'suppliers', 'sales', 'purchases', 'invoices',
    'accountingEntries', 'accounts', 'credits', 'auditLogs',
    'users', 'settings', 'notifications',
  ] as const

  for (const table of tables) {
    const items = data[table]
    if (!Array.isArray(items)) continue
    await (db as any)[table].clear()
    if (items.length > 0) {
      await (db as any)[table].bulkAdd(items)
      total += items.length
    }
  }
  return total
}

export function downloadJSON(data: string, filename = `neox-erp-backup-${new Date().toISOString().slice(0, 10)}.json`) {
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
    reader.readAsText(file)
  })
}
