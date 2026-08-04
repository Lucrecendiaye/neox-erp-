import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import { useBusinessId } from '@/hooks/useBusinessId'
import { useAppStore } from '@/stores/appStore'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { sanitizeForCloud } from './syncEngine'

export type TableName =
  | 'products' | 'categories' | 'stock_movements' | 'customers'
  | 'suppliers' | 'sales' | 'purchases' | 'invoices'
  | 'credits' | 'audit_logs'
  | 'profiles' | 'notifications' | 'businesses'
  | 'employees' | 'attendance' | 'payrolls' | 'cash_book'
  | 'leads' | 'business_cards' | 'settings'
  | 'locations' | 'product_stocks' | 'product_history'
  | 'supplier_invoices' | 'supplier_payments' | 'compensations' | 'transfers'

type QueryBuilder = any

const TENANT_TABLES: Set<TableName> = new Set([
  'products', 'categories', 'stock_movements', 'customers',
  'suppliers', 'sales', 'purchases', 'invoices',
  'credits', 'audit_logs',
  'employees', 'attendance', 'payrolls', 'cash_book',
  'leads', 'business_cards', 'locations', 'product_stocks',
  'product_history', 'supplier_invoices', 'supplier_payments',
  'compensations', 'transfers', 'notifications',
])

export function useSupabaseQuery<T>(
  table: TableName,
  queryFn?: (q: QueryBuilder) => any,
  deps: unknown[] = []
): { data: T[] | undefined; loading: boolean; error: string | null } {
  const businessId = useBusinessId()
  const [data, setData] = useState<T[] | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return }

    let cancelled = false

    async function fetchData() {
      try {
        setLoading(true)
        let q = supabase.from(table).select('*') as any
        if (businessId && TENANT_TABLES.has(table)) {
          q = q.eq('businessId', businessId)
        }
        if (queryFn) q = queryFn(q as QueryBuilder)
        const { data: result, error: err } = await q
        if (cancelled) return
        if (err) throw err
        setData((result || []) as T[])
        setError(null)
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Erreur de requête'
          setError(msg)
          console.error(`[Supabase] ${table}:`, err)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()

    const channel = supabase
      .channel(`public:${table}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (cancelled) return
          const payloadBizId = (payload.new as any)?.businessId || (payload.old as any)?.businessId
          if (businessId && TENANT_TABLES.has(table) && payloadBizId !== businessId) return
          if (payload.eventType === 'INSERT') {
            setData(prev => prev ? [payload.new as T, ...prev] : [payload.new as T])
          } else if (payload.eventType === 'UPDATE') {
            setData(prev => prev ? prev.map(item => (item as any).id === (payload.new as any).id ? payload.new as T : item) : prev)
          } else if (payload.eventType === 'DELETE') {
            setData(prev => prev ? prev.filter(item => (item as any).id !== (payload.old as any).id) : prev)
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [table, businessId, ...deps])

  return { data, loading, error }
}

function getCurrentBusinessId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

export const sb = {
  getAll: async <T>(table: TableName, options?: { order?: string; ascending?: boolean; limit?: number; businessId?: string }) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const bizId = options?.businessId || getCurrentBusinessId()
    let q = supabase.from(table).select('*')
    if (bizId && TENANT_TABLES.has(table)) q = q.eq('businessId', bizId)
    if (options?.order) q = q.order(options.order, { ascending: options.ascending ?? false })
    if (options?.limit) q = q.limit(options.limit)
    const { data, error } = await q
    if (error) throw error
    return data as T[]
  },

  getById: async <T>(table: TableName, id: string) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const bizId = getCurrentBusinessId()
    let q = supabase.from(table).select('*').eq('id', id)
    if (bizId && TENANT_TABLES.has(table)) q = q.eq('businessId', bizId)
    const { data, error } = await q.single()
    if (error) throw error
    return data as T
  },

  insert: async <T>(table: TableName, record: Partial<T>) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const bizId = getCurrentBusinessId()
    const enriched = { ...record } as any
    if (bizId && TENANT_TABLES.has(table) && !enriched.businessId) {
      enriched.businessId = bizId
    }
    const { data, error } = await supabase.from(table).insert(enriched).select().single()
    if (error) {
      console.error(`[Supabase] insert ${table}:`, error, enriched)
      throw error
    }
    return data as T
  },

  update: async <T>(table: TableName, id: string, updates: Partial<T>) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const bizId = getCurrentBusinessId()
    let q = supabase.from(table).update(updates as any).eq('id', id)
    if (bizId && TENANT_TABLES.has(table)) q = q.eq('businessId', bizId)
    const { data, error } = await q.select().single()
    if (error) {
      console.error(`[Supabase] update ${table}:`, error, updates)
      throw error
    }
    return data as T
  },

  remove: async (table: TableName, id: string) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const bizId = getCurrentBusinessId()
    let q = supabase.from(table).delete().eq('id', id)
    if (bizId && TENANT_TABLES.has(table)) q = q.eq('businessId', bizId)
    const { error } = await q
    if (error) {
      console.error(`[Supabase] delete ${table}:`, error)
      throw error
    }
  },

  filter: async <T>(table: TableName, column: string, value: any) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const bizId = getCurrentBusinessId()
    let q = supabase.from(table).select('*').eq(column, value)
    if (bizId && TENANT_TABLES.has(table)) q = q.eq('businessId', bizId)
    const { data, error } = await q
    if (error) throw error
    return data as T[]
  },
}

export async function syncToSupabase(table: TableName, records: any[]) {
  if (!isSupabaseConfigured() || records.length === 0) return
  const { error } = await supabase.from(table).upsert(records.map(r => sanitizeForCloud(table, r)), { onConflict: 'id' })
  if (error) console.error(`[Supabase] sync error [${table}]:`, error)
}
