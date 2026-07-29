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
