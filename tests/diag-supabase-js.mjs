import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const id = 'diag-connect@neoxerp.test'

console.log('=== 1. supabase.rpc public_lookup_profile ===')
try {
  const { data, error } = await supabase.rpc('public_lookup_profile', { p_identifier: id })
  console.log('data:', JSON.stringify(data)?.slice(0, 180))
  console.log('error:', JSON.stringify(error)?.slice(0, 180))
} catch (e) {
  console.log('THROW:', String(e?.message || e))
}

console.log('\n=== 2. supabase.auth.signInWithPassword ===')
try {
  const { data, error } = await supabase.auth.signInWithPassword({ email: id, password: 'DiagPass123!' })
  console.log('error:', JSON.stringify(error?.message || error))
  console.log('user:', data?.user?.email || null)
} catch (e) {
  console.log('THROW:', String(e?.message || e))
}
