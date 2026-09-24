import db from '@/db'
import { generateId } from '@/lib/utils'
import { syncWriteObject } from '@/lib/realtime'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { createNotification } from './notifications'
import type { AlertSettings } from '@/types'

const DEFAULT_SETTINGS: AlertSettings = {
  saleDelete: true,
  saleEdit: true,
  paymentEdit: true,
  loanDelete: true,
  stockManual: true,
  cashEdit: true,
  thresholdSaleEdit: 0,
  thresholdExpense: 0,
  thresholdLoan: 0,
  thresholdDebt: 0,
  thresholdStock: 0,
}

export async function getAlertSettings(): Promise<AlertSettings> {
  const s = await db.settings.get('default')
  return { ...DEFAULT_SETTINGS, ...(s?.alertSettings || {}) }
}

export async function setAlertSettings(next: Partial<AlertSettings>): Promise<void> {
  const settings = await db.settings.get('default') || { id: 'default' } as any
  await db.settings.put({ ...settings, alertSettings: { ...DEFAULT_SETTINGS, ...currentSettings(settings), ...next } })
}

function currentSettings(s: any): Partial<AlertSettings> {
  return s?.alertSettings || {}
}

function categoryEnabled(category: string, settings: AlertSettings): boolean {
  let key = category as keyof AlertSettings
  if (category === 'expense') key = 'cashEdit'
  if (category === 'debt') key = 'paymentEdit'
  return settings[key] !== false
}

async function existingPending(category: string, senderId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const all = await db.notifications
    .filter(n => n.type === 'sensitive_delete' || n.type === 'sensitive_edit' || n.type === 'loan_alert')
    .toArray()
  return all.some(n =>
    (n.title || '').includes(category) &&
    n.senderId === senderId &&
    n.createdAt >= cutoff
  )
}

/**
 * Notification "sensible" : les suppressions / manipulations importantes créent une
 * alerte pour le gérant. Les événements répétés d'une catégorie par le même utilisateur
 * sont regroupés dans une seule notification (30 minutes) pour éviter le spam.
 */
export async function notifySensitive(opts: {
  category: 'saleDelete' | 'saleEdit' | 'paymentEdit' | 'loanDelete' | 'stockManual' | 'cashEdit' | 'expense' | 'debt'
  title: string
  message: string
  link?: string
}): Promise<void> {
  const state = useAppStore.getState()
  const senderId = state.user?.id || ''
  const userName = state.user?.name || 'Utilisateur'
  const settings = await getAlertSettings()
  if (!categoryEnabled(opts.category, settings)) return

  const catLabel: Record<string, string> = {
    saleDelete: 'Suppression de vente', saleEdit: 'Modification de vente',
    paymentEdit: 'Modification de paiement', loanDelete: 'Suppression de prêt',
    stockManual: 'Modification de stock', cashEdit: 'Caisse & trésorerie',
    expense: 'Dépense importante', debt: 'Dette',
  }

  // Regroupement : si une notification de même catégorie/expéditeur existe depuis <30min,
  // on l'actualise (décompte) au lieu d'en créer une nouvelle.
  if (opts.category !== 'saleDelete' && opts.category !== 'loanDelete') {
    if (await existingPending(catLabel[opts.category], senderId)) {
      const target = await db.notifications
        .filter(n => (n.type === 'sensitive_delete' || n.type === 'sensitive_edit' || n.type === 'loan_alert')
          && (n.title || '').includes(catLabel[opts.category])
          && n.senderId === senderId
          && n.createdAt >= new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .first()
      if (target) {
        const count = (target.message.match(/⚠️/g) || []).length
        const msgCount = count + 1
        const newMsg = `${msgCount} événement(s) : ${opts.message}`
        await db.notifications.update(target.id, { message: newMsg, read: false })
        if (isSupabaseConfigured()) {
          await syncWriteObject('notifications', { id: target.id, message: newMsg, read: false }).catch(() => {})
        }
        return
      }
    }
  }

  await createNotification({
    type: opts.category === 'saleDelete' || opts.category === 'loanDelete' ? 'sensitive_delete' : 'sensitive_edit',
    title: opts.title,
    message: `${userName} : ${opts.message}`,
    link: opts.link,
    recipientId: undefined,
    senderId,
  })
  void catLabel
}
