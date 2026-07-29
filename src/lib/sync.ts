import { isSupabaseConfigured, supabase } from './supabase'
import { useAppStore } from '@/stores/appStore'
import db from '@/db'

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

export async function pushToSupabase(): Promise<{ success: number; failed: number }> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase non configuré')
  const businessId = getCurrentBusinessId()
  let success = 0
  let failed = 0

  for (const { name, supabaseName } of TABLES) {
    try {
      let query = (db[name] as any)
      if (businessId && TENANT_TABLES.has(supabaseName)) {
        query = query.where('businessId').equals(businessId)
      }
      const items = await query.toArray()
      for (const item of items) {
        const { id, ...data } = item
        const { error } = await supabase.from(supabaseName).upsert({ id, ...data }, { onConflict: 'id' })
        if (error) failed++
        else success++
      }
    } catch { failed++ }
  }
  return { success, failed }
}

export async function pullFromSupabase(): Promise<{ success: number; failed: number }> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase non configuré')
  const businessId = getCurrentBusinessId()
  let success = 0
  let failed = 0

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
        await table.put(row)
        success++
      }
    } catch { failed++ }
  }
  return { success, failed }
}

export async function syncAll(): Promise<{ pushed: { success: number; failed: number }; pulled: { success: number; failed: number } }> {
  const pushed = await pushToSupabase()
  const pulled = await pullFromSupabase()
  return { pushed, pulled }
}
