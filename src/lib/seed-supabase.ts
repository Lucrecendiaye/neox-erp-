import { supabase, isSupabaseConfigured } from './supabase'
import { sb } from './supabase-db'
import db from '@/db'

type SyncTable = {
  name: Parameters<typeof sb.getAll>[0]
  source: () => Promise<any[]>
  transform?: (item: any) => any
}

const TABLES: SyncTable[] = [
  { name: 'businesses', source: () => db.businesses.toArray() },
  { name: 'categories', source: () => db.categories.toArray() },
  { name: 'suppliers', source: () => db.suppliers.toArray() },
  { name: 'customers', source: () => db.customers.toArray() },
  { name: 'products', source: () => db.products.toArray() },
  { name: 'employees', source: () => db.employees.toArray() },
  {
    name: 'stock_movements',
    source: () => db.stockMovements.toArray(),
    transform: (item: any) => ({ ...item, userId: item.userId, unitPrice: item.unitPrice }),
  },
  { name: 'sales', source: () => db.sales.toArray() },
  { name: 'purchases', source: () => db.purchases.toArray() },
  { name: 'invoices', source: () => db.invoices.toArray() },
  { name: 'accounts', source: () => db.accounts.toArray() },
  { name: 'accounting_entries', source: () => db.accountingEntries.toArray() },
  { name: 'credits', source: () => db.credits.toArray() },
  { name: 'audit_logs', source: () => db.auditLogs.toArray() },
  { name: 'notifications', source: () => db.notifications.toArray() },
  { name: 'attendance', source: () => db.attendance.toArray() },
  { name: 'payrolls', source: () => db.payrolls.toArray() },
  { name: 'cash_book', source: () => db.cashBook.toArray() },
  { name: 'leads', source: () => db.leads.toArray() },
  { name: 'business_cards', source: () => db.businessCards.toArray() },
]

export async function syncDexieToSupabase(): Promise<{ table: string; count: number }[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')

  const results: { table: string; count: number }[] = []

  for (const { name, source, transform } of TABLES) {
    const records = await source()
    if (records.length === 0) {
      results.push({ table: name, count: 0 })
      continue
    }
    const data = transform ? records.map(transform) : records
    const { error } = await supabase.from(name).upsert(data, { onConflict: 'id' })
    if (error) {
      console.error(`Sync error [${name}]:`, error)
      results.push({ table: name, count: -1 })
    } else {
      results.push({ table: name, count: records.length })
    }
  }

  return results
}

export async function clearSupabaseData(): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
  const tables = TABLES.map(t => t.name).reverse()
  for (const table of tables) {
    await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  }
}
