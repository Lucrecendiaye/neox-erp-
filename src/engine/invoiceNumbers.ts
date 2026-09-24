import db from '@/db'
import { generateInvoiceNumber } from '@/lib/utils'
import { useAppStore } from '@/stores/appStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Dernier numéro séquentiel trouvé dans une chaîne de type « FAC-00012 ». */
function suffixOf(number: string): number {
  const m = /(\d+)\s*$/.exec(number || '')
  return m ? parseInt(m[1], 10) : 0
}

function currentBizId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

/**
 * Génère le prochain numéro de facture unique et incrémente le compteur.
 * La vérification des numéros déjà existants (ventes + factures) garantit une
 * numérotation continue, même en cas de compteur désynchronisé ou d'appareils multiples.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const bizId = currentBizId()

  // Numérotation serveur (verrou advisory Supabase) : garantit l'unicité même
  // avec plusieurs appareils connectés en même temps.
  if (isSupabaseConfigured() && supabase && bizId) {
    try {
      const settings = await db.settings.get('default')
      const prefix = settings?.invoicePrefix || 'FAC-'
      const { data, error } = await supabase.rpc('next_invoice_number', { biz: bizId, prefix })
      if (!error && typeof data === 'string' && data) {
        const m = /(\d+)\s*$/.exec(data)
        if (m && settings) {
          await db.settings.update('default', { invoiceNextNumber: parseInt(m[1], 10) + 1 })
        }
        return data
      }
    } catch {
      // fonction absente / hors ligne → fallback local
    }
  }

  return db.transaction('rw', [db.settings, db.sales, db.invoices], async () => {
    const settings = await db.settings.get('default')
    const prefix = settings?.invoicePrefix || 'FAC-'
    const counter = settings?.invoiceNextNumber || 1

    let maxSeq = 0
    const sales = await db.sales.where('businessId').equals(bizId).toArray()
    for (const s of sales) maxSeq = Math.max(maxSeq, suffixOf(s.invoiceNumber || ''))
    const invoices = await db.invoices.where('businessId').equals(bizId).toArray()
    for (const i of invoices) maxSeq = Math.max(maxSeq, suffixOf(i.number || ''))

    const next = Math.max(counter, maxSeq + 1)
    if (settings) {
      await db.settings.update('default', { invoiceNextNumber: next + 1 })
    }
    return generateInvoiceNumber(prefix, next)
  })
}
