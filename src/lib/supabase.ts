import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

let supabase: any = null

if (supabaseUrl && supabaseAnonKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  } catch {
    supabase = null
  }
}

export { supabase }

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey && supabase)
}

async function checkSupabaseHealth(): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey || !supabase) return false
  try {
    const { error } = await supabase.from('products').select('id').limit(1)
    if (error) {
      console.warn('[Supabase] Health check failed:', error.message)
      return false
    }
    console.log('[Supabase] Connected')
    return true
  } catch {
    return false
  }
}

export async function waitForSupabase(maxRetries = 10): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkSupabaseHealth()) return true
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

/**
 * Vérifie périodiquement que le cloud répond et met à jour l'état global.
 * But : si Supabase est en pause (plan Free) ou si le quota est épuisé (HTTP 402),
 * l'utilisateur voit un message clair au lieu d'un échec silencieux.
 */
export async function startCloudHealthMonitor(intervalMs = 60000): Promise<void> {
  if (!isSupabaseConfigured()) return
  const { useAppStore } = await import('@/stores/appStore')
  const tick = async () => {
    const ok = await checkSupabaseHealth()
    useAppStore.getState().setCloudStatus(ok ? 'ok' : 'down')
    // Si le navigateur est en ligne mais que le cloud ne répond pas, on signale.
    if (!ok) console.warn('[Supabase] Cloud injoignable — quota épuisé, projet en pause, ou réseau.')
  }
  await tick()
  setInterval(tick, intervalMs)
}
