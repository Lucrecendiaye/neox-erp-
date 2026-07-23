import { supabase, isSupabaseConfigured } from './supabase'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'

const SESSION_KEY = 'neox-session-ready'

export async function signIn(email: string, password: string) {
  if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  localStorage.setItem(SESSION_KEY, 'true')
  return data
}

export async function signUp(email: string, password: string, userData?: { name?: string; phone?: string }) {
  if (!isSupabaseConfigured()) throw new Error('Supabase non configuré')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: userData || {} },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  localStorage.removeItem(SESSION_KEY)
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
  localStorage.removeItem('neox-user-id')
  supabase.auth.signOut()
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
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
