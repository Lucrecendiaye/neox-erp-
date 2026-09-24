import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const base = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
const h = (extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...extra })

async function signup(email, password, name) {
  const r = await fetch(`${base}/auth/v1/signup`, { method: 'POST', headers: h(), body: JSON.stringify({ email, password, data: { name, phone: '', loginId: email } }) })
  const t = await r.json()
  return { status: r.status, user: t?.id || t?.user?.id || null, confirmed: t?.user?.email_confirmed_at || null, session: !!t?.access_token, msg: t?.msg || t?.message || '' }
}

async function login(email, password) {
  const r = await fetch(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: h(), body: JSON.stringify({ email, password }) })
  const t = await r.json()
  return { status: r.status, error: t?.error_description || t?.msg || '', user: t?.user?.id || null }
}

const email = 'diag-connect@neoxerp.test'
console.log('=== SIGNUP', email, '===')
console.log(await signup(email, 'DiagPass123!', 'Test Dia'))

console.log('=== LOGIN direct après signup ===')
console.log(await login(email, 'DiagPass123!'))

console.log('=== LOOKUP profile (ce que fait l’app avant login) ===')
const rp = await fetch(`${base}/rest/v1/rpc/public_lookup_profile`, { method: 'POST', headers: h(), body: JSON.stringify({ p_identifier: email }) })
console.log(rp.status, (await rp.text()).slice(0, 200))
