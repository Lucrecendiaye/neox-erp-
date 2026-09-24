import db from '@/db'
import { supabase, isSupabaseConfigured } from './supabase'

const DAY_MS = 24 * 60 * 60 * 1000

const PURGE_KEY = 'neox-purge-last-run'
const DELETE_BATCH_SIZE = 100

const RETENTION: { dexieTable: 'productHistory' | 'auditLogs'; supabaseTable: string; days: number; label: string }[] = [
  { dexieTable: 'productHistory', supabaseTable: 'product_history', days: 182, label: 'product_history (>6 mois)' },
  { dexieTable: 'auditLogs', supabaseTable: 'audit_logs', days: 90, label: 'audit_logs (>90 jours)' },
]

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

async function findAndDeleteRemoteRecords(
  supabaseTable: string,
  businessId: string,
  cutoff: string,
): Promise<string[]> {
  if (!supabase) return []

  const ids: string[] = []
  const pageSize = 500
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(supabaseTable)
      .select('id')
      .eq('businessId', businessId)
      .lt('createdAt', cutoff)
      .range(from, from + pageSize - 1)
    if (error) throw error
    const page = (data || []).map((row: { id: string }) => row.id)
    ids.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
    const batch = ids.slice(i, i + DELETE_BATCH_SIZE)
    const { error } = await supabase
      .from(supabaseTable)
      .delete()
      .in('id', batch)
      .eq('businessId', businessId)
    if (error) throw error
  }

  return ids
}

export async function purgeOldRecords(businessId: string): Promise<{ deleted: number; details: Record<string, number> }> {
  const now = Date.now()
  const last = Number(localStorage.getItem(PURGE_KEY) || 0)
  if (last && now - last < DAY_MS) return { deleted: 0, details: {} }

  const details: Record<string, number> = {}
  let total = 0
  let hasErrors = false

  for (const cfg of RETENTION) {
    const cutoff = daysAgo(cfg.days)
    const stale: { id: string; createdAt: string }[] = await (db[cfg.dexieTable] as any)
      .where('businessId').equals(businessId)
      .and((r: { createdAt: string }) => r.createdAt < cutoff)
      .toArray()

    if (isSupabaseConfigured() && supabase) {
      try {
        const remoteIds = await findAndDeleteRemoteRecords(cfg.supabaseTable, businessId, cutoff)
        const deletedIds = [...new Set([...stale.map(r => r.id), ...remoteIds])]
        if (deletedIds.length > 0) {
          await db[cfg.dexieTable].bulkDelete(deletedIds)
          total += deletedIds.length
          details[cfg.label] = deletedIds.length
        }
      } catch (error) {
        hasErrors = true
        console.error(`[purge] ${cfg.supabaseTable} error:`, error)
      }
    } else if (stale.length > 0) {
      await db[cfg.dexieTable].bulkDelete(stale.map(r => r.id))
      total += stale.length
      details[cfg.label] = stale.length
    }
  }

  if (!hasErrors) localStorage.setItem(PURGE_KEY, String(now))
  return { deleted: total, details }
}
