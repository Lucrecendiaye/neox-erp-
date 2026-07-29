import { isSupabaseConfigured, supabase } from './supabase'
import db from '@/db'
import { useAppStore, useSyncStore } from '@/stores/appStore'

type TableName = keyof typeof db & string

const TABLES: { name: TableName; supabaseName: string }[] = [
  { name: 'products', supabaseName: 'products' },
  { name: 'categories', supabaseName: 'categories' },
  { name: 'customers', supabaseName: 'customers' },
  { name: 'suppliers', supabaseName: 'suppliers' },
  { name: 'sales', supabaseName: 'sales' },
  { name: 'purchases', supabaseName: 'purchases' },
  { name: 'credits', supabaseName: 'credits' },

  { name: 'cashBook', supabaseName: 'cash_book' },
  { name: 'employees', supabaseName: 'employees' },
  { name: 'attendance', supabaseName: 'attendance' },
  { name: 'payrolls', supabaseName: 'payrolls' },
  { name: 'leads', supabaseName: 'leads' },
  { name: 'notifications', supabaseName: 'notifications' },
  { name: 'auditLogs', supabaseName: 'audit_logs' },
  { name: 'locations', supabaseName: 'locations' },
  { name: 'productStocks', supabaseName: 'product_stocks' },
  { name: 'productHistory', supabaseName: 'product_history' },
  { name: 'supplierInvoices', supabaseName: 'supplier_invoices' },
  { name: 'supplierPayments', supabaseName: 'supplier_payments' },
  { name: 'compensations', supabaseName: 'compensations' },
  { name: 'transfers', supabaseName: 'transfers' },
]

const TENANT_TABLES: Set<string> = new Set([
  'products', 'categories', 'customers', 'suppliers', 'sales', 'purchases',
  'credits', 'cash_book', 'employees',
  'attendance', 'payrolls', 'leads', 'notifications', 'audit_logs',
  'locations', 'product_stocks', 'product_history', 'supplier_invoices',
  'supplier_payments', 'compensations', 'transfers',
])

function getCurrentBusinessId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

const PROCESSED_IDS_KEY = 'neox-synced-ids'
const MAX_RETRIES = 5
const BASE_DELAY = 1000

function getProcessedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PROCESSED_IDS_KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set<string>()
  }
}

function addProcessedIds(ids: string[]): void {
  const existing = getProcessedIds()
  for (const id of ids) existing.add(id)
  const arr = Array.from(existing).slice(-10000)
  localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(arr))
}

function hasBeenProcessed(id: string): boolean {
  return getProcessedIds().has(id)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries - 1) throw err
      await delay(BASE_DELAY * Math.pow(2, attempt))
    }
  }
  throw new Error('Retry exhausted')
}

export async function pushToSupabase(): Promise<{ success: number; failed: number }> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase non configuré')
  useSyncStore.getState().setSyncing(true)

  let success = 0
  let failed = 0
  const processedIds: string[] = []
  const businessId = getCurrentBusinessId()

  for (const { name, supabaseName } of TABLES) {
    try {
      let query = (db[name] as any)
      if (businessId && TENANT_TABLES.has(supabaseName)) {
        query = query.where('businessId').equals(businessId)
      }
      const items = await query.toArray()
      for (const item of items) {
        if (hasBeenProcessed(item.id)) continue
        try {
          const { id, ...data } = item
          await retryWithBackoff(async () => {
            const { error } = await supabase!.from(supabaseName).upsert({ id, ...data }, { onConflict: 'id' })
            if (error) throw error
          })
          processedIds.push(id)
          success++
        } catch {
          failed++
        }
      }
    } catch {
      failed++
    }
  }

  addProcessedIds(processedIds)
  useSyncStore.getState().setSyncing(false)
  useSyncStore.getState().setLastSync(new Date().toISOString())
  return { success, failed }
}

export async function pullFromSupabase(): Promise<{ success: number; failed: number }> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase non configuré')
  useSyncStore.getState().setSyncing(true)

  let success = 0
  let failed = 0
  const businessId = getCurrentBusinessId()

  for (const { name, supabaseName } of TABLES) {
    try {
      let q = supabase.from(supabaseName).select('*')
      if (businessId && TENANT_TABLES.has(supabaseName)) {
        q = q.eq('businessId', businessId)
      }
      const { data, error } = await q
      if (error) { failed++; continue }
      if (!data) continue
      const table = db[name] as any
      for (const row of data) {
        if (hasBeenProcessed(row.id)) continue
        try {
          await table.put(row)
          success++
        } catch {
          failed++
        }
      }
    } catch { failed++ }
  }

  useSyncStore.getState().setSyncing(false)
  useSyncStore.getState().setLastSync(new Date().toISOString())
  return { success, failed }
}

export async function syncAll(): Promise<{ pushed: { success: number; failed: number }; pulled: { success: number; failed: number } }> {
  const pushed = await pushToSupabase()
  const pulled = await pullFromSupabase()
  return { pushed, pulled }
}

export async function queueOfflineOperation(
  table: TableName,
  operation: 'insert' | 'update' | 'delete',
  data: Record<string, unknown>
): Promise<void> {
  const queue: any[] = JSON.parse(localStorage.getItem('neox-sync-queue') || '[]')
  queue.push({
    id: crypto.randomUUID?.() || `${Date.now()}`,
    table,
    operation,
    data,
    createdAt: new Date().toISOString(),
    retries: 0,
  })
  localStorage.setItem('neox-sync-queue', JSON.stringify(queue))
}

export async function processSyncQueue(): Promise<void> {
  const queue: any[] = JSON.parse(localStorage.getItem('neox-sync-queue') || '[]')
  if (queue.length === 0 || !isSupabaseConfigured()) return

  const remaining: any[] = []
  const businessId = getCurrentBusinessId()
  for (const item of queue) {
    try {
      const { name, supabaseName } = TABLES.find(t => t.name === item.table) || { supabaseName: item.table }
      if (item.operation === 'delete') {
        await retryWithBackoff(async () => {
          let q = supabase!.from(supabaseName).delete().eq('id', item.data.id)
          if (businessId && TENANT_TABLES.has(supabaseName)) q = q.eq('businessId', businessId)
          const { error } = await q
          if (error) throw error
        })
      } else {
        await retryWithBackoff(async () => {
          const payload = { id: item.data.id, ...item.data }
          if (businessId && TENANT_TABLES.has(supabaseName) && !payload.businessId) {
            payload.businessId = businessId
          }
          const { error } = await supabase!.from(supabaseName).upsert(payload, { onConflict: 'id' })
          if (error) throw error
        })
      }
    } catch {
      item.retries = (item.retries || 0) + 1
      if (item.retries < MAX_RETRIES) {
        remaining.push(item)
      }
    }
  }
  localStorage.setItem('neox-sync-queue', JSON.stringify(remaining))
}
