import { supabase, isSupabaseConfigured } from './supabase'
import db from '@/db'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'
import type { User, UserStatus, AuthSession } from '@/types'

const SESSION_KEY = 'neox-session-ready'
const SESSION_ID_KEY = 'neox-session-id'

export const USER_STATUSES: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Actif' },
  { value: 'blocked', label: 'Bloqué' },
  { value: 'suspended', label: 'Suspendu' },
  { value: 'deleted', label: 'Supprimé' },
]

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function effectiveStatus(u: { status?: UserStatus; isActive?: boolean }): UserStatus {
  if (u.status && u.status !== 'active') return u.status
  return u.isActive === false ? 'blocked' : 'active'
}

export function canSignIn(u: { status?: UserStatus; isActive?: boolean }): { ok: boolean; reason?: string } {
  const st = effectiveStatus(u)
  if (st === 'active') return { ok: true }
  if (st === 'blocked') return { ok: false, reason: 'Ce compte est bloqué. Contactez votre administrateur.' }
  if (st === 'suspended') return { ok: false, reason: 'Ce compte est suspendu temporairement.' }
  return { ok: false, reason: 'Ce compte a été supprimé.' }
}

function isPhoneIdentifier(identifier: string): boolean {
  return /^[\d\s\+\-\(\)]{6,}$/.test(identifier)
}

function shortDevice(): string {
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad/i.test(ua)) return 'iOS'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac/i.test(ua)) return 'MacOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Appareil'
}

function profileToUser(profile: any): User {
  const status: UserStatus = profile.status || (profile.is_active === false ? 'blocked' : 'active')
  return {
    id: profile.auth_user_id,
    businessId: profile.business_id || profile.businessId || '',
    name: profile.name,
    email: profile.email || '',
    phone: profile.phone || undefined,
    loginId: profile.login_id || profile.email || '',
    passwordHash: '',
    role: (profile.role || 'staff') as User['role'],
    permissions: profile.permissions?.length ? profile.permissions : ['*'],
    isActive: profile.is_active ?? true,
    isPrimaryAdmin: profile.is_primary_admin ?? false,
    status,
    createdAt: profile.created_at || new Date().toISOString(),
    lastLogin: profile.last_login || undefined,
  }
}

export async function findUserByIdentifier(identifier: string): Promise<{ user?: User; email?: string }> {
  const id = (identifier || '').trim().toLowerCase()
  if (!id) return {}
  if (isSupabaseConfigured()) {
    const { data: profile } = await supabase.rpc('public_lookup_profile', { p_identifier: id })
    if (profile) return { user: profileToUser(profile), email: profile.email || id }
    let email = id
    if (isPhoneIdentifier(id)) {
      const { data } = await supabase.rpc('public_lookup_email_by_phone', { phone: id })
      if (data && data.length > 0) email = data[0].email
    }
    return { email }
  }
  const users = await db.users
    .filter(u =>
      u.loginId.toLowerCase() === id ||
      u.email.toLowerCase() === id ||
      (u.phone || '').toLowerCase() === id
    )
    .toArray()
  return { user: users[0] }
}

async function createSessionRecord(user: User): Promise<AuthSession> {
  const session: AuthSession = {
    id: crypto.randomUUID(),
    userId: user.id,
    businessId: user.businessId,
    token: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    device: shortDevice(),
    revoked: false,
  }
  await db.sessions.add(session)
  localStorage.setItem(SESSION_ID_KEY, session.id)
  return session
}

export async function establishLocalSession(user: User) {
  await createSessionRecord(user)
  setSession(user.id)
  await db.users.update(user.id, { lastLogin: new Date().toISOString() })
  const { useAppStore } = await import('@/stores/appStore')
  useAppStore.getState().setUser(user)
  const biz = await db.businesses.get(user.businessId)
  if (biz) useAppStore.getState().setCurrentBusiness(biz)
}

export interface LoginResult {
  status: 'ok' | 'blocked'
  user?: User
  reason?: string
}

export async function signIn(identifier: string, password: string): Promise<LoginResult> {
  if (!isSupabaseConfigured()) {
    const { user } = await findUserByIdentifier(identifier)
    if (!user) return { status: 'blocked', reason: 'Identifiant ou mot de passe incorrect' }
    const check = canSignIn(user)
    if (!check.ok) return { status: 'blocked', reason: check.reason }
    const hash = await hashPassword(password)
    if (user.passwordHash !== hash) return { status: 'blocked', reason: 'Identifiant ou mot de passe incorrect' }
    await establishLocalSession(user)
    return { status: 'ok', user }
  }

  const { user, email } = await findUserByIdentifier(identifier)
  if (!user || !email) return { status: 'blocked', reason: 'Identifiant ou mot de passe incorrect' }
  const check = canSignIn(user)
  if (!check.ok) return { status: 'blocked', reason: check.reason }

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { status: 'blocked', reason: 'Identifiant ou mot de passe incorrect' }

  await establishSupabaseSession(user, email)
  return { status: 'ok', user }
}

async function establishSupabaseSession(user: User, email: string) {
  await createSessionRecord(user)
  localStorage.setItem(SESSION_KEY, 'true')
  const { useAppStore } = await import('@/stores/appStore')
  useAppStore.getState().setUser(user)
  if (isSupabaseConfigured()) {
    const { data } = await supabase.from('profiles').select('*, businesses(*)').eq('email', email).maybeSingle()
    if (data?.businesses) {
      const b = data.businesses
      useAppStore.getState().setCurrentBusiness({
        id: b.id,
        name: b.name,
        currency: b.currency,
        currencySymbol: b.currency_symbol,
        phone: b.phone,
        email: b.email,
        address: b.address,
        taxId: b.tax_id,
        isActive: b.is_active,
        createdAt: b.created_at,
        logo: b.logo || undefined,
      })
    }
  }
}

export async function signUp(email: string, password: string, userData?: { name?: string; phone?: string; loginId?: string }) {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: userData || {} },
    })
    if (error) throw error
    return data
  }
  const id = (userData?.loginId || email).trim()
  const existing = await db.users.filter(u => u.loginId.toLowerCase() === id.toLowerCase() || u.email.toLowerCase() === email.toLowerCase()).toArray()
  if (existing.length > 0) {
    const err = new Error('Cet identifiant ou email est déjà utilisé')
    err.name = 'Duplicate'
    throw err
  }
  const hash = await hashPassword(password)
  const now = new Date().toISOString()
  const bizId = `biz-${Date.now()}`
  const userId = `user-${Date.now()}`

  await db.businesses.add({
    id: bizId,
    name: `${userData?.name || 'Mon'}'s Shop`,
    currency: 'XOF',
    currencySymbol: 'FCFA',
    phone: userData?.phone || '',
    email,
    isActive: true,
    createdAt: now,
  })

  await db.locations.bulkAdd([
    { id: `loc-shop-${bizId}`, businessId: bizId, name: 'Boutique Principale', type: 'shop', address: '', phone: userData?.phone || '', isActive: true, createdAt: now, updatedAt: now },
    { id: `loc-warehouse-${bizId}`, businessId: bizId, name: 'Dépôt Principal', type: 'warehouse', address: '', phone: '', isActive: true, createdAt: now, updatedAt: now },
  ])

  await db.users.add({
    id: userId,
    businessId: bizId,
    name: userData?.name || email.split('@')[0],
    email,
    loginId: id,
    phone: userData?.phone || undefined,
    passwordHash: hash,
    role: 'admin',
    permissions: ['*'],
    isActive: true,
    isPrimaryAdmin: true,
    status: 'active',
    createdAt: now,
  })
  return { user: { id: userId } }
}

export async function signOut() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_ID_KEY)
  if (isSupabaseConfigured()) {
    await supabase.auth.signOut()
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(callback: (session: Session | null) => void) {
  if (!supabase) {
    callback(null)
    return { data: { subscription: { unsubscribe: () => {} } } }
  }
  return supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
    if (session) {
      localStorage.setItem(SESSION_KEY, 'true')
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
    callback(session)
  })
}

export function isLoggedIn(): boolean {
  if (isSupabaseConfigured()) {
    return localStorage.getItem(SESSION_KEY) === 'true'
  }
  return !!localStorage.getItem('neox-user-id')
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(SESSION_ID_KEY)
  localStorage.removeItem('neox-user-id')
  if (isSupabaseConfigured()) supabase.auth.signOut().catch(() => {})
}

export function getCurrentUserId(): string | null {
  return localStorage.getItem('neox-user-id')
}

export function setSession(userId: string) {
  localStorage.setItem('neox-user-id', userId)
  localStorage.setItem('neox-session-start', new Date().toISOString())
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = 'neox-salt-v1'
  const data = encoder.encode(password + salt)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function listUserSessions(userId: string): Promise<AuthSession[]> {
  const all = await db.sessions.where('userId').equals(userId).toArray()
  const now = Date.now()
  const active = all.filter(s => !s.revoked && new Date(s.expiresAt).getTime() > now)
  const stale = all.filter(s => s.revoked || new Date(s.expiresAt).getTime() <= now)
  for (const s of stale) {
    if (!s.revoked) await db.sessions.update(s.id, { revoked: true })
  }
  return active.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
}

export function getCurrentSessionId(): string | null {
  return localStorage.getItem(SESSION_ID_KEY)
}

export async function revokeSession(sessionId: string) {
  await db.sessions.update(sessionId, { revoked: true })
  if (getCurrentSessionId() === sessionId) {
    await signOut()
  }
}

export async function revokeAllSessions(userId: string) {
  const all = await db.sessions.where('userId').equals(userId).toArray()
  for (const s of all) {
    if (!s.revoked) await db.sessions.update(s.id, { revoked: true })
  }
  if (getCurrentUserId() === userId) {
    await signOut()
  }
}

const BLOCK_CHANNEL = 'neox-auth-guard'
let blockChannel: BroadcastChannel | null = null

export function broadcastUserBlock(userId: string) {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      if (!blockChannel) blockChannel = new BroadcastChannel(BLOCK_CHANNEL)
      blockChannel.postMessage({ type: 'block', userId })
    }
    localStorage.setItem('neox-block:' + userId, new Date().toISOString())
  } catch {
    // ignore
  }
}

export function startAuthGuard(callback: () => void): () => void {
  let unsubSupabase: (() => void) | null = null

  const onBlock = () => {
    clearSession()
    callback()
  }

  const handleStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith('neox-block:')) {
      const uid = localStorage.getItem('neox-user-id')
      if (uid && e.key === 'neox-block:' + uid) onBlock()
    }
  }
  window.addEventListener('storage', handleStorage)

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      if (!blockChannel) blockChannel = new BroadcastChannel(BLOCK_CHANNEL)
      blockChannel.onmessage = (e: MessageEvent) => {
        const data = e.data || {}
        if (data.type === 'block' && data.userId === localStorage.getItem('neox-user-id')) {
          onBlock()
        }
      }
    }
  } catch {
    // ignore
  }

  if (isSupabaseConfigured() && supabase) {
    ;(async () => {
      let uid: string | null | undefined = localStorage.getItem('neox-user-id')
      if (!uid) {
        const res = await supabase.auth.getUser().catch(() => null)
        uid = res?.data?.user?.id || null
      }
      if (!uid) return
      const channel = supabase
        .channel(`auth-guard-${crypto.randomUUID()}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `auth_user_id=eq.${uid}` },
          (payload: { new: any }) => {
            const st = payload.new?.status || (payload.new?.is_active === false ? 'blocked' : 'active')
            if (st !== 'active') onBlock()
          })
        .subscribe()
      unsubSupabase = () => { supabase.removeChannel(channel) }
    })()
  }

  return () => {
    window.removeEventListener('storage', handleStorage)
    if (blockChannel) blockChannel.onmessage = null
    unsubSupabase?.()
  }
}
