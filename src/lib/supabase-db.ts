import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from './supabase'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export type TableName =
  | 'products' | 'categories' | 'stock_movements' | 'customers'
  | 'suppliers' | 'sales' | 'purchases' | 'invoices'
  | 'accounting_entries' | 'accounts' | 'credits' | 'audit_logs'
  | 'profiles' | 'notifications' | 'businesses'
  | 'employees' | 'attendance' | 'payrolls' | 'cash_book'
  | 'leads' | 'business_cards'

type QueryBuilder = ReturnType<typeof supabase.from>

export function useSupabaseQuery<T>(
  table: TableName,
  queryFn?: (q: QueryBuilder) => any,
  deps: unknown[] = []
): { data: T[] | undefined; loading: boolean; error: string | null } {
  const [data, setData] = useState<T[] | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchData() {
      try {
        setLoading(true)
        let q = supabase.from(table).select('*') as any
        if (queryFn) q = queryFn(q as QueryBuilder)
        const { data: result, error: err } = await q
        if (cancelled) return
        if (err) throw err
        setData((result || []) as T[])
        setError(null)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur de requête')
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
  }, [table, ...deps])

  return { data, loading, error }
}

export const sb = {
  getAll: async <T>(table: TableName, options?: { order?: string; ascending?: boolean; limit?: number }) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    let q = supabase.from(table).select('*')
    if (options?.order) q = q.order(options.order, { ascending: options.ascending ?? false })
    if (options?.limit) q = q.limit(options.limit)
    const { data, error } = await q
    if (error) throw error
    return data as T[]
  },

  getById: async <T>(table: TableName, id: string) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single()
    if (error) throw error
    return data as T
  },

  insert: async <T>(table: TableName, record: Partial<T>) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const { data, error } = await supabase.from(table).insert(record).select().single()
    if (error) throw error
    return data as T
  },

  update: async <T>(table: TableName, id: string, updates: Partial<T>) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select().single()
    if (error) throw error
    return data as T
  },

  remove: async (table: TableName, id: string) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
  },

  filter: async <T>(table: TableName, column: string, value: any) => {
    if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
    const { data, error } = await supabase.from(table).select('*').eq(column, value)
    if (error) throw error
    return data as T[]
  },
}

export async function syncToSupabase(table: TableName, records: any[]) {
  if (!isSupabaseConfigured() || records.length === 0) return
  const { error } = await supabase.from(table).upsert(records, { onConflict: 'id' })
  if (error) console.error(`Sync error [${table}]:`, error)
}
