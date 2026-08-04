import { supabase, isSupabaseConfigured } from './supabase'
import { useAppStore } from '@/stores/appStore'
import db from '@/db'
import { sanitizePayloadForSync } from './imageStorage'
import { sanitizeForCloud } from './syncEngine'

const SUBSCRIPTIONS: { table: string; dexieTable: keyof typeof db }[] = [
  { table: 'products', dexieTable: 'products' },
  { table: 'categories', dexieTable: 'categories' },
  { table: 'customers', dexieTable: 'customers' },
  { table: 'suppliers', dexieTable: 'suppliers' },
  { table: 'sales', dexieTable: 'sales' },
  { table: 'purchases', dexieTable: 'purchases' },
  { table: 'invoices', dexieTable: 'invoices' },
  { table: 'credits', dexieTable: 'credits' },
  { table: 'notifications', dexieTable: 'notifications' },
  { table: 'employees', dexieTable: 'employees' },
  { table: 'attendance', dexieTable: 'attendance' },
  { table: 'payrolls', dexieTable: 'payrolls' },
  { table: 'cash_book', dexieTable: 'cashBook' },
  { table: 'leads', dexieTable: 'leads' },
  { table: 'locations', dexieTable: 'locations' },
  { table: 'product_stocks', dexieTable: 'productStocks' },
  { table: 'product_history', dexieTable: 'productHistory' },
  { table: 'supplier_invoices', dexieTable: 'supplierInvoices' },
  { table: 'supplier_payments', dexieTable: 'supplierPayments' },
  { table: 'compensations', dexieTable: 'compensations' },
  { table: 'transfers', dexieTable: 'transfers' },
]

const TENANT_TABLES: Set<string> = new Set([
  'products', 'categories', 'customers', 'suppliers', 'sales', 'purchases',
  'invoices', 'credits', 'employees', 'attendance', 'payrolls',
  'cash_book', 'leads', 'notifications', 'locations', 'product_stocks',
  'product_history', 'supplier_invoices', 'supplier_payments',
  'compensations', 'transfers',
])

const SESSION_ID = crypto.randomUUID()
const activeChannels: any[] = []

function getCurrentBusinessId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

export function getSessionId() {
  return SESSION_ID
}

export async function subscribeAll(onChange?: (table: string, event: string, data: any) => void) {
  if (!isSupabaseConfigured() || !supabase) return
  const businessId = getCurrentBusinessId()

  for (const { table, dexieTable } of SUBSCRIPTIONS) {
    const channel = supabase
      .channel(`realtime-${table}-${SESSION_ID}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table },
        async (payload: { eventType: string; new: any; old: any }) => {
          try {
            const payloadBizId = payload.new?.businessId || payload.old?.businessId
            if (businessId && TENANT_TABLES.has(table) && payloadBizId !== businessId) return
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const row = payload.new
              const dexie = (db as any)[dexieTable]
              if (dexie) {
                const flat = { ...row }
                const key = row.id
                delete flat.id
                await dexie.put({ id: key, ...flat })
              }
            } else if (payload.eventType === 'DELETE') {
              const dexie = (db as any)[dexieTable]
              if (dexie && payload.old?.id) {
                await dexie.delete(payload.old.id)
              }
            }
            onChange?.(table, payload.eventType, payload.new)
          } catch {
            // silent
          }
        })
      .subscribe()

    activeChannels.push(channel)
  }
}

export function unsubscribeAll() {
  for (const ch of activeChannels) {
    supabase?.removeChannel(ch)
  }
  activeChannels.length = 0
}

export async function syncWrite(table: string, data: Record<string, any>): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false
  if (!data.businessId) {
    const state = useAppStore.getState()
    data.businessId = state.currentBusiness?.id || state.user?.businessId || ''
  }

  const { error } = await supabase.from(table).upsert(sanitizeForCloud(table, await sanitizePayloadForSync(data)), { onConflict: 'id' })
  if (error) {
    console.error(`Sync write error [${table}]:`, error)
    return false
  }
  return true
}

export async function syncDelete(table: string, id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false
  const businessId = getCurrentBusinessId()
  let q = supabase.from(table).delete().eq('id', id)
  if (businessId && TENANT_TABLES.has(table)) q = q.eq('businessId', businessId)
  const { error } = await q
  if (error) {
    console.error(`Sync delete error [${table}]:`, error)
    return false
  }
  return true
}

export function getSyncTableName(dexieKey: string): string | null {
  const found = SUBSCRIPTIONS.find(s => s.dexieTable === dexieKey)
  return found?.table || null
}

export async function syncWriteObject(dexieTable: keyof typeof db, obj: Record<string, any>): Promise<boolean> {
  const table = getSyncTableName(dexieTable as string)
  if (!table) return false
  return syncWrite(table, obj)
}

export async function syncDeleteObject(dexieTable: keyof typeof db, id: string): Promise<boolean> {
  const table = getSyncTableName(dexieTable as string)
  if (!table) return false
  return syncDelete(table, id)
}
