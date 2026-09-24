#!/usr/bin/env node
/**
 * NeoX ERP — Keep-alive
 *
 * Empêche la mise en pause du projet Supabase (plan Free : pause après 7 jours
 * d'inactivité) et vérifie que l'app Vercel répond.
 *
 * Usage :  node scripts/keep-alive.mjs
 * Env requis (ou .env.local) :
 *   VITE_SUPABASE_URL        ex: https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY   clé anon publique
 *   APP_URL (optionnel)      ex: https://neox-erp-alpha.vercel.app
 *
 * Sortie : code 0 si tout va bien, 1 si une cible échoue (pour alerter la CI).
 */

import fs from 'node:fs'
import path from 'node:path'

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/"/g, '').trim()
const SUPABASE_KEY = (process.env.VITE_SUPABASE_ANON_KEY || '').replace(/"/g, '').trim()
const APP_URL = (process.env.APP_URL || 'https://neox-erp-alpha.vercel.app').trim()

const results = []

async function pingSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    results.push({ target: 'supabase', ok: false, detail: 'Variables VITE_SUPABASE_* absentes' })
    return
  }
  const started = Date.now()
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/customers?select=id&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(15000),
    })
    const ms = Date.now() - started
    // 200/206 = OK ; 401/403 = projet vivant mais clé/RLS (acceptable pour un keep-alive)
    const alive = res.status < 500
    results.push({ target: 'supabase', ok: alive, detail: `HTTP ${res.status} en ${ms}ms` })
  } catch (e) {
    results.push({ target: 'supabase', ok: false, detail: `Injoignable : ${String(e).slice(0, 120)}` })
  }
}

async function pingApp() {
  const started = Date.now()
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(15000) })
    const ms = Date.now() - started
    results.push({ target: 'vercel-app', ok: res.ok, detail: `HTTP ${res.status} en ${ms}ms` })
  } catch (e) {
    results.push({ target: 'vercel-app', ok: false, detail: `Injoignable : ${String(e).slice(0, 120)}` })
  }
}

await Promise.all([pingSupabase(), pingApp()])

console.log('\n=== NeoX ERP — Keep-alive ===')
for (const r of results) {
  console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.target.padEnd(12)} ${r.detail}`)
}

const failed = results.filter(r => !r.ok)
if (failed.length) {
  console.error(`\n${failed.length} cible(s) en échec.`)
  process.exit(1)
}
console.log('\nTout est vivant.')
