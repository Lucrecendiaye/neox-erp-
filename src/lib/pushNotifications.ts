import { isSupabaseConfigured, supabase } from './supabase'
import { generateId } from './utils'

const VAPID_PUBLIC_KEY = 'BAlF_yhUib7hY3RcMaNdx0DklZ2hQz7Jz8Gxk_zFxkB0QRoQgP5Vib4J6Ym7ZZpAxXQe_T4n-Qf5XZCgZoGt9cM'

export async function subscribeToPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const registration = await navigator.serviceWorker.ready
    const existingSubscription = await registration.pushManager.getSubscription()

    if (existingSubscription) {
      return true
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
    })

    if (isSupabaseConfigured() && supabase) {
      await supabase.from('push_subscriptions').upsert({
        id: generateId(),
        user_id: localStorage.getItem('neox-user-id') || '',
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
        created_at: new Date().toISOString(),
      } as any)
    }

    localStorage.setItem('neox-push-subscribed', 'true')
    return true
  } catch {
    return false
  }
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
    }
    localStorage.removeItem('neox-push-subscribed')
    return true
  } catch {
    return false
  }
}

export function isPushSubscribed(): boolean {
  return localStorage.getItem('neox-push-subscribed') === 'true'
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function showLocalNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  navigator.serviceWorker.ready.then(registration => {
    registration.showNotification(title, {
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      ...options,
    })
  })
}
