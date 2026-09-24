import { isSupabaseConfigured, supabase } from './supabase'
import db from '@/db'
import { useAppStore, useSyncStore } from '@/stores/appStore'
import { sanitizePayloadForSync, mergePhotosForSync } from './imageStorage'

type TableName = keyof typeof db & string

const TABLES: { name: TableName; supabaseName: string }[] = [
  { name: 'products', supabaseName: 'products' },
  { name: 'categories', supabaseName: 'categories' },
  { name: 'customers', supabaseName: 'customers' },
  { name: 'suppliers', supabaseName: 'suppliers' },
  { name: 'sales', supabaseName: 'sales' },
  { name: 'purchases', supabaseName: 'purchases' },
  { name: 'credits', supabaseName: 'credits' },
  { name: 'cashBook', supabaseName: 'cash_book' },
  { name: 'employees', supabaseName: 'employees' },
  { name: 'attendance', supabaseName: 'attendance' },
  { name: 'payrolls', supabaseName: 'payrolls' },
  { name: 'leads', supabaseName: 'leads' },
  { name: 'notifications', supabaseName: 'notifications' },
  { name: 'auditLogs', supabaseName: 'audit_logs' },
  { name: 'locations', supabaseName: 'locations' },
  { name: 'productStocks', supabaseName: 'product_stocks' },
  { name: 'productHistory', supabaseName: 'product_history' },
  { name: 'supplierInvoices', supabaseName: 'supplier_invoices' },
  { name: 'supplierPayments', supabaseName: 'supplier_payments' },
  { name: 'compensations', supabaseName: 'compensations' },
  { name: 'transfers', supabaseName: 'transfers' },
  { name: 'stockMovements', supabaseName: 'stock_movements' },
  { name: 'invoices', supabaseName: 'invoices' },
  { name: 'accounts', supabaseName: 'accounts' },
  { name: 'creditPayments', supabaseName: 'credit_payments' },
  { name: 'bonSorties', supabaseName: 'bon_sorties' },
  { name: 'cashOps', supabaseName: 'cash_operations' },
  { name: 'cashCategories', supabaseName: 'cash_categories' },
  { name: 'deliveries', supabaseName: 'deliveries' },
  { name: 'businessCards', supabaseName: 'business_cards' },
  { name: 'settings', supabaseName: 'settings' },
  { name: 'businesses', supabaseName: 'businesses' },
  { name: 'users', supabaseName: 'profiles' },
]

const TENANT_TABLES: Set<string> = new Set([
  'products', 'categories', 'customers', 'suppliers', 'sales', 'purchases',
  'credits', 'cash_book', 'employees', 'attendance', 'payrolls', 'leads',
  'notifications', 'audit_logs', 'locations', 'product_stocks', 'product_history',
  'supplier_invoices', 'supplier_payments', 'compensations', 'transfers',
  'stock_movements', 'invoices', 'accounts', 'credit_payments', 'bon_sorties',
  'cash_operations', 'cash_categories',
  'deliveries', 'business_cards', 'settings', 'profiles',
])

const SMALL_TABLES = new Set([
  'categories', 'locations', 'employees', 'attendance', 'payrolls', 'leads',
  'notifications', 'audit_logs', 'settings', 'profiles', 'cash_categories',
])

const PULL_ONLY_TABLES = new Set([
  'profiles', 'businesses', 'settings',
])

const AUDIT_LOG_DB_COLUMNS = new Set([
  'id', 'businessId', 'userId', 'action', 'entity', 'entityId', 'details', 'createdAt',
])

const CREDIT_DB_COLUMNS = new Set([
  'id', 'businessId', 'customerId', 'customerName', 'amount', 'paid', 'balance', 'dueDate', 'status', 'reminderSent', 'createdAt',
])

const PROFILE_CLOUD_COLUMNS = new Set([
  'id', 'businessId', 'email', 'name', 'phone', 'role', 'permissions',
  'createdAt', 'updatedAt', 'authUserId', 'is_active', 'last_login',
])

const PRODUCT_CLOUD_COLUMNS = new Set([
  'id', 'businessId', 'name', 'description', 'photos', 'barcode', 'qrCode',
  'reference', 'categoryId', 'brand', 'unit', 'purchasePrice', 'sellingPrice',
  'wholesalePrice', 'priceDozen', 'pricePack', 'packSize', 'margin', 'taxRate',
  'stockAlert', 'stockMin', 'stockMax', 'location', 'supplierId', 'status',
  'createdAt', 'updatedAt',
])

const SALES_CLOUD_COLUMNS = new Set([
  'id', 'businessId', 'invoiceNumber', 'createdAt', 'customerId', 'customerName',
  'items', 'subtotal', 'discountTotal', 'taxTotal', 'total', 'paid', 'change',
  'paymentMethod', 'splitPayments', 'status', 'userId', 'locationId',
])

const CASH_BOOK_CLOUD_COLUMNS = new Set([
  'id', 'businessId', 'date', 'type', 'category', 'amount', 'description',
  'partyName', 'paymentMethod', 'reference', 'createdAt', 'userId',
])

const NOTIFICATION_CLOUD_COLUMNS = new Set([
  'id', 'businessId', 'type', 'title', 'message', 'read', 'link', 'createdAt',
])

export function sanitizeForCloud(supabaseName: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (supabaseName === 'products') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(payload)) {
      if (PRODUCT_CLOUD_COLUMNS.has(key)) out[key] = payload[key]
    }
    return out
  }
  if (supabaseName === 'audit_logs') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(payload)) {
      if (AUDIT_LOG_DB_COLUMNS.has(key)) out[key] = payload[key]
    }
    return out
  }
  if (supabaseName === 'credits') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(payload)) {
      if (CREDIT_DB_COLUMNS.has(key)) out[key] = payload[key]
    }
    return out
  }
  if (supabaseName === 'sales') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(payload)) {
      if (SALES_CLOUD_COLUMNS.has(key)) out[key] = payload[key]
    }
    return out
  }
  if (supabaseName === 'cash_book') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(payload)) {
      if (CASH_BOOK_CLOUD_COLUMNS.has(key)) out[key] = payload[key]
    }
    return out
  }
  if (supabaseName === 'notifications') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(payload)) {
      if (NOTIFICATION_CLOUD_COLUMNS.has(key)) out[key] = payload[key]
    }
    return out
  }
  if (supabaseName === 'profiles' || supabaseName === 'users') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(payload)) {
      if (PROFILE_CLOUD_COLUMNS.has(key)) out[key] = payload[key]
    }
    delete out.passwordHash
    if (out.isActive !== undefined) {
      out.is_active = out.isActive
      delete out.isActive
    }
    if (out.authUserId !== undefined) {
      out.auth_user_id = out.authUserId
      delete out.authUserId
    }
    delete out.passwordHash
    delete out.loginId
    delete out.status
    delete out.isPrimaryAdmin
    return out
  }
  return payload
}

function sanitizeForTable(supabaseName: string, payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeForCloud(supabaseName, payload)
}

function getCurrentBusinessId(): string {
  const state = useAppStore.getState()
  return state.currentBusiness?.id || state.user?.businessId || ''
}

const SYNCED_FINGERPRINTS_KEY = 'neox-synced-fingerprints'
const MAX_RETRIES = 3
const BASE_DELAY = 500

function fingerprint(obj: unknown): string {
  try {
    const json = JSON.stringify(obj)
    let h = 5381
    for (let i = 0; i < json.length; i++) {
      h = ((h << 5) + h + json.charCodeAt(i)) >>> 0
    }
    return h.toString(36) + ':' + json.length
  } catch {
    return ''
  }
}

function getSyncedFingerprints(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SYNCED_FINGERPRINTS_KEY) || '{}')
  } catch {
    return {}
  }
}

function setSyncedFingerprints(entries: Record<string, string>): void {
  const existing = getSyncedFingerprints()
  for (const k of Object.keys(entries)) existing[k] = entries[k]
  const keys = Object.keys(existing)
  if (keys.length > 30000) {
    for (const k of keys.slice(0, keys.length - 30000)) delete existing[k]
  }
  try {
    localStorage.setItem(SYNCED_FINGERPRINTS_KEY, JSON.stringify(existing))
  } catch {
    // stockage plein: on ne bloque jamais la sync
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch {
      if (attempt === retries - 1) throw new Error(`Failed after ${retries} retries`)
      await delay(BASE_DELAY * Math.pow(2, attempt))
    }
  }
  throw new Error('Retry exhausted')
}

export async function pushToSupabase(): Promise<{ success: number; failed: number }> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase non configuré')
  useSyncStore.getState().setSyncing(true)

  let success = 0
  let failed = 0
  const businessId = getCurrentBusinessId()

  const results = await Promise.allSettled(TABLES.map(async ({ name, supabaseName }) => {
    if (PULL_ONLY_TABLES.has(supabaseName)) return
    let query = (db[name] as any)
    if (businessId && TENANT_TABLES.has(supabaseName)) {
      query = query.where('businessId').equals(businessId)
    }
    const items = await query.toArray()
    if (items.length === 0) return

    const synced = getSyncedFingerprints()
    const batch: any[] = []
    for (const item of items) {
      const fp = fingerprint(item)
      if (synced[item.id] === fp) continue
      const { id, ...data } = item
      batch.push({ id, data, fp })
    }
    if (batch.length === 0) return

    try {
      await retryWithBackoff(async () => {
        const sanitized = await Promise.all(
          batch.map(async ({ id, data }) => {
            const clean = await sanitizePayloadForSync(data)
            return { id, ...sanitizeForTable(supabaseName, clean) }
          })
        )
        const { error } = await supabase!.from(supabaseName).upsert(sanitized, { onConflict: 'id' })
        if (error) throw error
      })
      const entries: Record<string, string> = {}
      for (const { id, fp } of batch) entries[id] = fp
      setSyncedFingerprints(entries)
      success += batch.length
    } catch {
      failed += batch.length
    }
  }))

  for (const r of results) {
    if (r.status === 'rejected') failed++
  }

  useSyncStore.getState().setSyncing(false)
  useSyncStore.getState().setLastSync(new Date().toISOString())
  return { success, failed }
}

function mapCloudToLocal(
  supabaseName: string,
  row: any,
  existing?: any
): any {
  if (supabaseName === 'settings') {
    return { ...row, id: 'default', businessId: row.businessId || row.business_id || '' }
  }
  if (supabaseName === 'sales') {
    const paid = Number(row.paid) || 0
    const total = Number(row.total) || 0
    return {
      ...row,
      paymentStatus: row.paymentStatus || (paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid'),
      supplierId: existing?.supplierId || row.supplierId || undefined,
      discountTotal: row.discountTotal ?? 0,
      taxTotal: row.taxTotal ?? 0,
      change: row.change ?? 0,
      businessId: row.businessId || existing?.businessId || '',
    }
  }
  if (supabaseName !== 'profiles') return row
  const status = row.status || (row.is_active === false ? 'blocked' : 'active')
  return {
    id: row.id,
    authUserId: row.auth_user_id || row.authUserId || '',
    businessId: row.businessId || row.business_id || '',
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || undefined,
    loginId: row.login_id || row.loginId || row.email || '',
    passwordHash: existing?.passwordHash || '',
    role: row.role || 'staff',
    permissions: row.permissions?.length ? row.permissions : ['*'],
    isActive: row.is_active ?? true,
    isPrimaryAdmin: row.is_primary_admin ?? (existing?.isPrimaryAdmin ?? false),
    status,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    lastLogin: row.last_login || undefined,
  }
}

async function pullTable(
  name: TableName,
  supabaseName: string,
  businessId: string,
  onProgress?: (table: string, count: number) => void
): Promise<{ success: number; failed: number }> {
  let success = 0
  let failed = 0
  try {
    let q = supabase!.from(supabaseName).select('*', { count: 'estimated', head: false }).limit(1)
    if (businessId && TENANT_TABLES.has(supabaseName)) {
      q = q.eq('businessId', businessId)
    }
    const { count } = await q
    const estimated = count || 0

    onProgress?.(supabaseName, 0)

    const pageSize = SMALL_TABLES.has(supabaseName) ? 1000 : 200
    const allData: any[] = []
    let from = 0
    let hasMore = true

    while (hasMore) {
      let r = supabase!.from(supabaseName).select('*').range(from, from + pageSize - 1)
      if (businessId && TENANT_TABLES.has(supabaseName)) {
        r = r.eq('businessId', businessId)
      }
      r = r.order('id', { ascending: true })
      const { data, error } = await r
      if (error) { failed += estimated; break }
      if (!data || data.length === 0) { hasMore = false; break }
      allData.push(...data)
      from += data.length
      if (data.length < pageSize) hasMore = false
      onProgress?.(supabaseName, allData.length)
    }

    if (allData.length === 0) return { success, failed }

    const table = db[name] as any
    const synced = getSyncedFingerprints()
    const newRows = allData.filter(row => synced[row.id] !== fingerprint(row))

    if (newRows.length > 0) {
      const mergedRows: any[] = []
      const entries: Record<string, string> = {}
      for (const row of newRows) {
        const local = await table.get(row.id)
        if (local && Array.isArray(local.photos) && local.photos.length > 0) {
          row.photos = mergePhotosForSync(local.photos, row.photos)
        }
        const mapped = mapCloudToLocal(supabaseName, row, local)
        mergedRows.push(mapped)
        entries[mapped.id] = fingerprint(mapped)
      }
      const batchSize = SMALL_TABLES.has(supabaseName) ? 500 : 100
      for (let i = 0; i < mergedRows.length; i += batchSize) {
        const batch = mergedRows.slice(i, i + batchSize)
        try {
          await table.bulkPut(batch)
          success += batch.length
        } catch {
          for (const row of batch) {
            try { await table.put(row); success++ } catch { failed++ }
          }
        }
      }
      setSyncedFingerprints(entries)
    }
  } catch {
    failed++
  }
  return { success, failed }
}

export async function pullFromSupabase(
  onProgress?: (table: string, count: number) => void
): Promise<{ success: number; failed: number }> {
  if (!isSupabaseConfigured() || !supabase) throw new Error('Supabase non configuré')
  useSyncStore.getState().setSyncing(true)

  const businessId = getCurrentBusinessId()
  let totalSuccess = 0
  let totalFailed = 0

  const BATCH_SIZE = 4
  for (let i = 0; i < TABLES.length; i += BATCH_SIZE) {
    const batch = TABLES.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(({ name, supabaseName }) =>
        pullTable(name, supabaseName, businessId, onProgress)
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        totalSuccess += r.value.success
        totalFailed += r.value.failed
      } else {
        totalFailed++
      }
    }
  }

  useSyncStore.getState().setSyncing(false)
  useSyncStore.getState().setLastSync(new Date().toISOString())
  return { success: totalSuccess, failed: totalFailed }
}

export async function syncAll(
  onProgress?: (table: string, count: number) => void
): Promise<{ pushed: { success: number; failed: number }; pulled: { success: number; failed: number } }> {
  const pushed = await pushToSupabase()
  const pulled = await pullFromSupabase(onProgress)
  return { pushed, pulled }
}

export async function queueOfflineOperation(
  table: TableName,
  operation: 'insert' | 'update' | 'delete',
  data: Record<string, unknown>
): Promise<void> {
  const queue: any[] = JSON.parse(localStorage.getItem('neox-sync-queue') || '[]')
  queue.push({
    id: crypto.randomUUID?.() || `${Date.now()}`,
    table, operation, data,
    createdAt: new Date().toISOString(),
    retries: 0,
  })
  localStorage.setItem('neox-sync-queue', JSON.stringify(queue))
}

export async function processSyncQueue(): Promise<void> {
  const queue: any[] = JSON.parse(localStorage.getItem('neox-sync-queue') || '[]')
  if (queue.length === 0 || !isSupabaseConfigured()) return

  const remaining: any[] = []
  const businessId = getCurrentBusinessId()
  for (const item of queue) {
    try {
      const { supabaseName } = TABLES.find(t => t.name === item.table) || { supabaseName: item.table }
      if (item.operation === 'delete') {
        await retryWithBackoff(async () => {
          let q = supabase!.from(supabaseName).delete().eq('id', item.data.id)
          if (businessId && TENANT_TABLES.has(supabaseName)) q = q.eq('businessId', businessId)
          const { error } = await q
          if (error) throw error
        })
      } else {
        await retryWithBackoff(async () => {
          const payload = { id: item.data.id, ...item.data }
          if (businessId && TENANT_TABLES.has(supabaseName) && !payload.businessId) {
            payload.businessId = businessId
          }
          const clean = await sanitizePayloadForSync(payload)
          const { error } = await supabase!.from(supabaseName).upsert(sanitizeForTable(supabaseName, clean), { onConflict: 'id' })
          if (error) throw error
        })
      }
    } catch {
      item.retries = (item.retries || 0) + 1
      if (item.retries < MAX_RETRIES) remaining.push(item)
    }
  }
  localStorage.setItem('neox-sync-queue', JSON.stringify(remaining))
}
