import db from '@/db'
import { supabase, isSupabaseConfigured } from './supabase'

const DAY_MS = 24 * 60 * 60 * 1000

const PURGE_KEY = 'neox-purge-last-run'

const RETENTION: { dexieTable: 'productHistory' | 'auditLogs'; supabaseTable: string; days: number; label: string }[] = [
  { dexieTable: 'productHistory', supabaseTable: 'product_history', days: 182, label: 'product_history (>6 mois)' },
  { dexieTable: 'auditLogs', supabaseTable: 'audit_logs', days: 90, label: 'audit_logs (>90 jours)' },
]

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

export async function purgeOldRecords(businessId: string): Promise<{ deleted: number; details: Record<string, number> }> {
  const now = Date.now()
  const last = Number(localStorage.getItem(PURGE_KEY) || 0)
  if (last && now - last < DAY_MS) return { deleted: 0, details: {} }

  const details: Record<string, number> = {}
  let total = 0

  for (const cfg of RETENTION) {
    const cutoff = daysAgo(cfg.days)
    const stale: { id: string; createdAt: string }[] = await (db[cfg.dexieTable] as any)
      .where('businessId').equals(businessId)
      .and((r: { createdAt: string }) => r.createdAt < cutoff)
      .toArray()

    if (stale.length === 0) continue

    if (isSupabaseConfigured() && supabase) {
      const failed: string[] = []
      for (const rec of stale) {
        const { error } = await supabase
          .from(cfg.supabaseTable)
          .delete()
          .eq('id', rec.id)
          .eq('businessId', businessId)
        if (error) failed.push(rec.id)
      }
      const synced = stale.filter(r => !failed.includes(r.id))
      if (synced.length > 0) {
        await db[cfg.dexieTable].bulkDelete(synced.map(r => r.id))
      }
      total += synced.length
      details[cfg.label] = synced.length
    } else {
      await db[cfg.dexieTable].bulkDelete(stale.map(r => r.id))
      total += stale.length
      details[cfg.label] = stale.length
    }
  }

  localStorage.setItem(PURGE_KEY, String(now))
  return { deleted: total, details }
}
