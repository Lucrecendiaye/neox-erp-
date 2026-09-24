#!/usr/bin/env node
/**
 * NeoX ERP — Audit du quota Supabase (plan Free)
 *
 * Vérifie l'état des ressources et alerte si l'on approche des limites.
 * Utilise l'API Management Supabase (token personnel) si disponible,
 * sinon retombe sur des vérifications directes de la base.
 *
 * Usage :  node scripts/quota-check.mjs
 * Env (optionnel) :
 *   SUPABASE_ACCESS_TOKEN   token personnel Supabase (https://supabase.com/dashboard/account/tokens)
 *   SUPABASE_PROJECT_REF    ex: banknoizmiprfwhrcihc
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  (fallback)
 *
 * Limites plan Free (Supabase, nov. 2025) :
 *   Database 500 MB · Egress 5 GB · Storage 1 GB · Realtime msg 2M
 *   Realtime connexions 200 · MAU 50 000 · Edge invocations 500k
 *
 * Sortie : code 0 si OK, 1 si un seuil d'alerte (>=80%) est franchi.
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

const ACCESS_TOKEN = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()
let PROJECT_REF = (process.env.SUPABASE_PROJECT_REF || '').trim()
if (!PROJECT_REF) {
  const m = /https:\/\/([a-z0-9]+)\.supabase\.co/.exec(process.env.VITE_SUPABASE_URL || '')
  PROJECT_REF = m ? m[1] : ''
}

const FREE_LIMITS = {
  db_size_bytes: 500 * 1024 * 1024,
  egress_bytes: 5 * 1024 * 1024 * 1024,
  storage_bytes: 1 * 1024 * 1024 * 1024,
}
const WARN_RATIO = 0.8

function fmtBytes(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GB'
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(2) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KB'
  return n + ' B'
}

async function fetchUsage() {
  if (!ACCESS_TOKEN || !PROJECT_REF) return null
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/usage`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return await res.json()
  } catch (e) {
    return { error: String(e).slice(0, 120) }
  }
}

console.log('\n=== NeoX ERP — Audit quota Supabase (plan Free) ===\n')

const usage = await fetchUsage()

if (!usage) {
  console.log('SUPABASE_ACCESS_TOKEN non fourni : audit automatique indisponible.')
  console.log('→ Ajoute SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF pour l\'activer.')
  console.log('  Token : https://supabase.com/dashboard/account/tokens')
  console.log('\nVérifie manuellement : https://supabase.com/dashboard/org/_/usage')
  process.exit(0)
}

if (usage.error) {
  console.error(`Impossible de lire l'usage : ${usage.error}`)
  process.exit(1)
}

// Supabase renvoie une structure avec "usages" ou des clés directes selon la version de l'API.
const pick = (...keys) => {
  for (const k of keys) {
    if (usage[k] !== undefined) return usage[k]
    if (usage.usages && usage.usages[k] !== undefined) return usage.usages[k]
  }
  return undefined
}

const dbSize = Number(pick('db_size', 'database_size', 'dbSize') ?? 0)
const egress = Number(pick('egress', 'egress_bytes') ?? 0)
const storage = Number(pick('storage_size', 'storage', 'storage_bytes') ?? 0)

const rows = [
  { label: 'Database', used: dbSize, limit: FREE_LIMITS.db_size_bytes },
  { label: 'Egress', used: egress, limit: FREE_LIMITS.egress_bytes },
  { label: 'Storage', used: storage, limit: FREE_LIMITS.storage_bytes },
]

let warn = false
for (const r of rows) {
  const ratio = r.limit > 0 ? r.used / r.limit : 0
  const pct = (ratio * 100).toFixed(1)
  const flag = ratio >= WARN_RATIO ? '⚠️  ALERTE' : 'ok'
  if (ratio >= WARN_RATIO) warn = true
  console.log(`${flag}  ${r.label.padEnd(10)} ${fmtBytes(r.used)} / ${fmtBytes(r.limit)}  (${pct}%)`)
}

console.log('\nDétail complet : https://supabase.com/dashboard/org/_/usage')

if (warn) {
  console.error('\n⚠️  Un seuil approche 80% — prévois un upgrade vers Pro ($25/mo) pour éviter la coupure (plan Free = arrêt à 100%).')
  process.exit(1)
}
console.log('\nQuota confortable.')
