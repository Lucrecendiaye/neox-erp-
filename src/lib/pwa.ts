import { registerSW as registerPWA } from 'virtual:pwa-register'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let listeners: Array<(installable: boolean) => void> = []

export function registerSW() {
  // registerType: 'autoUpdate' — le SW appelle skipWaiting() + clientsClaim()
  // et workbox nettoie les anciens precaches (cleanupOutdatedCaches) à l'activation.
  // Quand un nouveau SW s'active (nouveau déploiement), la page se recharge
  // automatiquement pour servir les nouveaux chunks (évite l'ancien code base64).
  registerPWA({
    immediate: true,
  })
}

export function listenInstallPrompt(callback: (installable: boolean) => void) {
  listeners.push(callback)
  if (deferredPrompt) callback(true)
  return () => {
    listeners = listeners.filter(l => l !== callback)
  }
}

export function isInstallable() {
  return deferredPrompt !== null
}

export async function installApp() {
  if (!deferredPrompt) return false
  try {
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      deferredPrompt = null
      listeners.forEach(l => l(false))
      return true
    }
    return false
  } catch {
    return false
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  listeners.forEach(l => l(true))
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  listeners.forEach(l => l(false))
})

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
}

export function generatePWAImages() {
  const canvas192 = document.createElement('canvas')
  canvas192.width = 192
  canvas192.height = 192
  const ctx192 = canvas192.getContext('2d')
  if (ctx192) {
    ctx192.fillStyle = '#7C3AED'
    ctx192.beginPath()
    ctx192.roundRect(0, 0, 192, 192, 32)
    ctx192.fill()
    ctx192.fillStyle = '#FFFFFF'
    ctx192.font = 'bold 80px sans-serif'
    ctx192.textAlign = 'center'
    ctx192.textBaseline = 'middle'
    ctx192.fillText('N', 96, 96)
    const link192 = document.querySelector('link[rel="icon"][sizes="192x192"]') as HTMLLinkElement
    if (link192) link192.href = canvas192.toDataURL()
    const link512 = document.querySelector('link[rel="icon"][sizes="512x512"]') as HTMLLinkElement
    const canvas512 = document.createElement('canvas')
    canvas512.width = 512
    canvas512.height = 512
    const ctx512 = canvas512.getContext('2d')
    if (ctx512 && link512) {
      ctx512.fillStyle = '#7C3AED'
      ctx512.beginPath()
      ctx512.roundRect(0, 0, 512, 512, 85)
      ctx512.fill()
      ctx512.fillStyle = '#FFFFFF'
      ctx512.font = 'bold 220px sans-serif'
      ctx512.textAlign = 'center'
      ctx512.textBaseline = 'middle'
      ctx512.fillText('N', 256, 256)
      link512.href = canvas512.toDataURL()
    }
  }
}
