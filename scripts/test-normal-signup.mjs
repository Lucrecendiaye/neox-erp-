import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const URL = 'https://banknoizmiprfwhrcihc.supabase.co'
const env = readFileSync('.env.local', 'utf8')
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY="?([^"\r\n]+)"?/)[1].trim()

const supabase = createClient(URL, anonKey, { auth: { persistSession: false } })

async function run() {
  const email = 'normalsignup-' + Date.now() + '@neoxerp.app'
  const pw = 'Normal123!'
  const { data: su, error: suErr } = await supabase.auth.signUp({ email, password: pw, options: { data: { name: 'Normal', loginId: 'normalx' } } })
  console.log('signUp user:', su?.user?.id || 'NONE', suErr?.message || '')
  if (su?.user) {
    const { data: login, error: le } = await supabase.auth.signInWithPassword({ email, password: pw })
    console.log('signIn (unconfirmed):', le ? 'ERR ' + JSON.stringify(le) : 'OK ' + login.user.email)
  }
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})