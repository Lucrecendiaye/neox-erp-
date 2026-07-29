const PIN_HASH_KEY = 'neox-pin-hash'
const DEFAULT_PIN = '0000'

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin + 'neox-salt-v1')
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyPin(pin: string, storedHash?: string | null): Promise<boolean> {
  const hash = await hashPin(pin)
  const targetHash = storedHash || await hashPin(DEFAULT_PIN)
  return hash === targetHash
}

export function isPinEnabled(): boolean {
  return true
}

export function getStoredPinHash(): string | null {
  return localStorage.getItem(PIN_HASH_KEY)
}

export async function setPin(pin: string): Promise<void> {
  const hash = await hashPin(pin)
  localStorage.setItem(PIN_HASH_KEY, hash)
}

export function resetPinToDefault(): void {
  localStorage.removeItem(PIN_HASH_KEY)
}

export function getOfflineSession(): { userId: string; name: string; expiresAt: string } | null {
  try {
    const raw = localStorage.getItem('neox-offline-session')
    if (!raw) return null
    const session = JSON.parse(raw)
    if (new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem('neox-offline-session')
      return null
    }
    return session
  } catch {
    return null
  }
}

export function setOfflineSession(userId: string, name: string, days = 7): void {
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  localStorage.setItem('neox-offline-session', JSON.stringify({ userId, name, expiresAt }))
}

export function clearOfflineSession(): void {
  localStorage.removeItem('neox-offline-session')
}