import db from '@/db'
import { isSupabaseConfigured } from './supabase'

const TABLES_TO_BACKUP = [
  'products', 'categories', 'customers', 'suppliers',
  'sales', 'purchases',
  'cashBook',
  'employees', 'attendance', 'payrolls',
  'leads', 'settings', 'locations', 'productStocks',
  'supplierInvoices', 'supplierPayments', 'compensations',
] as const

export async function createBackup(): Promise<{ size: number; date: string }> {
  const backup: Record<string, any[]> = {}

  for (const table of TABLES_TO_BACKUP) {
    try {
      const data = await (db as any)[table].toArray()
      backup[table] = data
    } catch {
      backup[table] = []
    }
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const date = new Date().toISOString()
  const size = blob.size

  const backups: any[] = JSON.parse(localStorage.getItem('neox-backups') || '[]')
  backups.push({ date, size, data: backup })
  const recent = backups.slice(-10)
  localStorage.setItem('neox-backups', JSON.stringify(recent))

  return { size, date }
}

export function getBackupList(): { date: string; size: number }[] {
  try {
    const backups: any[] = JSON.parse(localStorage.getItem('neox-backups') || '[]')
    return backups.map(({ date, size }) => ({ date, size }))
  } catch {
    return []
  }
}

export function restoreFromBackup(index = 0): boolean {
  try {
    const backups: any[] = JSON.parse(localStorage.getItem('neox-backups') || '[]')
    if (backups.length <= index) return false
    const backup = backups[index]
    if (!backup.data) return false

    Object.entries(backup.data).forEach(([table, records]) => {
      const store = (db as any)[table]
      if (store && Array.isArray(records)) {
        records.forEach((record: any) => store.put(record))
      }
    })
    return true
  } catch {
    return false
  }
}

export async function scheduleAutoBackup(intervalMs = 30 * 60 * 1000): Promise<() => void> {
  const id = setInterval(async () => {
    try {
      await createBackup()
    } catch {
      // Silently fail
    }
  }, intervalMs)
  return () => clearInterval(id)
}
