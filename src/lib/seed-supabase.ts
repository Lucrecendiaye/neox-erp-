import { supabase, isSupabaseConfigured } from './supabase'
import db from '@/db'

type SyncTable = {
  name: string
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

  { name: 'credits', source: () => db.credits.toArray() },
  { name: 'audit_logs', source: () => db.auditLogs.toArray() },
  { name: 'notifications', source: () => db.notifications.toArray() },
  { name: 'attendance', source: () => db.attendance.toArray() },
  { name: 'payrolls', source: () => db.payrolls.toArray() },
  { name: 'cash_book', source: () => db.cashBook.toArray() },
  { name: 'leads', source: () => db.leads.toArray() },
  { name: 'business_cards', source: () => db.businessCards.toArray() },
  { name: 'locations', source: () => db.locations.toArray() },
  { name: 'product_stocks', source: () => db.productStocks.toArray() },
  { name: 'product_history', source: () => db.productHistory.toArray() },
  { name: 'supplier_invoices', source: () => db.supplierInvoices.toArray() },
  { name: 'supplier_payments', source: () => db.supplierPayments.toArray() },
  { name: 'compensations', source: () => db.compensations.toArray() },
  { name: 'transfers', source: () => db.transfers.toArray() },
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

export async function pullSupabaseToDexie(): Promise<{ table: string; count: number }[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
  const results: { table: string; count: number }[] = []

  for (const { name, source } of TABLES) {
    try {
      const { data, error } = await supabase.from(name).select('*')
      if (error) {
        console.error(`Pull error [${name}]:`, error)
        results.push({ table: name, count: -1 })
        continue
      }
      if (!data || data.length === 0) {
        results.push({ table: name, count: 0 })
        continue
      }
      const dexieTable = name === 'stock_movements' ? 'stockMovements'
        : name === 'cash_book' ? 'cashBook'
        : name === 'audit_logs' ? 'auditLogs'
        : name === 'product_stocks' ? 'productStocks'
        : name === 'product_history' ? 'productHistory'
        : name === 'supplier_invoices' ? 'supplierInvoices'
        : name === 'supplier_payments' ? 'supplierPayments'
        : name === 'business_cards' ? 'businessCards'
        : name as string

      const table = (db as any)[dexieTable]
      if (!table) {
        results.push({ table: name, count: -1 })
        continue
      }
      for (const row of data) {
        const flat = { ...row }
        delete flat.id
        await table.put({ id: row.id, ...flat })
      }
      results.push({ table: name, count: data.length })
    } catch (err) {
      console.error(`Pull error [${name}]:`, err)
      results.push({ table: name, count: -1 })
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
