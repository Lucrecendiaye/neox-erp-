import { create } from 'zustand'
import db from '@/db'
import type { CompanySettings, User, Notification, Business } from '@/types'
import type { Session } from '@supabase/supabase-js'

interface AppState {
  initialized: boolean
  user: User | null
  session: Session | null
  settings: CompanySettings | null
  notifications: Notification[]
  sidebarOpen: boolean
  isOnline: boolean
  currentBusiness: Business | null

  init: () => Promise<void>
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setSettings: (settings: CompanySettings) => Promise<void>
  setSidebarOpen: (open: boolean) => void
  setIsOnline: (online: boolean) => void
  addNotification: (n: Notification) => Promise<void>
  markNotificationRead: (id: string) => Promise<void>
  unreadCount: () => number
  setCurrentBusiness: (biz: Business | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  user: null,
  session: null,
  settings: null,
  notifications: [],
  sidebarOpen: window.innerWidth >= 1024,
  isOnline: navigator.onLine,
  currentBusiness: null,

  init: async () => {
    const settings = await db.settings.get('default') || null
    const uid = localStorage.getItem('neox-user-id')
    let user: User | null = null
    if (uid) {
      user = (await db.users.get(uid)) || null
    }

    const businesses = await db.businesses.toArray()
    const userBizId = user?.businessId || ''
    const activeBiz = businesses.find(b => b.isActive) || businesses[0] || null
    const currentBizId = activeBiz?.id || userBizId

    let notifications: Notification[] = []
    if (currentBizId) {
      notifications = await db.notifications
        .where('businessId').equals(currentBizId)
        .reverse()
        .sortBy('createdAt')
      notifications = notifications.slice(0, 50)
    } else {
      notifications = await db.notifications
        .orderBy('createdAt')
        .reverse()
        .limit(50)
        .toArray()
    }

    let currentBiz = activeBiz

    if (!currentBiz && user?.businessId) {
      const savedBizId = localStorage.getItem('neox-current-business-id')
      if (savedBizId) {
        const savedBiz = businesses.find(b => b.id === savedBizId)
        if (savedBiz) currentBiz = savedBiz
      }
    }

    if (!currentBiz && user?.businessId) {
      const savedName = localStorage.getItem('neox-current-business-name')
      if (savedName) {
        const biz: Business = {
          id: user.businessId,
          name: savedName,
          currency: 'XOF',
          currencySymbol: 'FCFA',
          phone: user.phone || '',
          email: user.email || '',
          isActive: true,
          createdAt: new Date().toISOString(),
        }
        await db.businesses.add(biz)
        currentBiz = biz
      }
    }

    if (currentBiz?.id) {
      localStorage.setItem('neox-current-business-id', currentBiz.id)
      if (currentBiz.name) localStorage.setItem('neox-current-business-name', currentBiz.name)
    }

    if (settings && currentBiz?.name && (!settings.name || settings.name === 'Application')) {
      settings.name = currentBiz.name
      await db.settings.put(settings, 'default')
    }

    set({
      initialized: true,
      settings,
      notifications,
      currentBusiness: currentBiz,
      user,
    })
  },

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setSettings: async (settings) => {
    await db.settings.put(settings, 'default')
    set({ settings })
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setIsOnline: (online) => set({ isOnline: online }),
  setCurrentBusiness: (biz) => {
    if (biz?.id) {
      localStorage.setItem('neox-current-business-id', biz.id)
      if (biz.name) localStorage.setItem('neox-current-business-name', biz.name)
    } else {
      localStorage.removeItem('neox-current-business-id')
      localStorage.removeItem('neox-current-business-name')
    }
    set({ currentBusiness: biz })
  },

  addNotification: async (n) => {
    await db.notifications.add(n)
    set((s) => ({ notifications: [n, ...s.notifications].slice(0, 50) }))
  },

  markNotificationRead: async (id) => {
    await db.notifications.update(id, { read: true })
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }))
  },

  unreadCount: () => get().notifications.filter((n) => !n.read).length,
}))

interface SyncState {
  lastSync: string | null
  syncing: boolean
  setSyncing: (syncing: boolean) => void
  setLastSync: (date: string) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  lastSync: null,
  syncing: false,
  setSyncing: (syncing) => set({ syncing }),
  setLastSync: (date) => set({ lastSync: date }),
}))
