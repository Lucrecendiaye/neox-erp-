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
  locked: boolean
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
  setLocked: (locked: boolean) => void
  setCurrentBusiness: (biz: Business | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  initialized: false,
  user: null,
  session: null,
  settings: null,
  notifications: [],
  sidebarOpen: true,
  isOnline: navigator.onLine,
  locked: false,
  currentBusiness: null,

  init: async () => {
    const settings = await db.settings.get('default') || null
    const notifications = await db.notifications
      .orderBy('createdAt')
      .reverse()
      .limit(50)
      .toArray()
    const businesses = await db.businesses.toArray()
    const currentBiz = businesses.find(b => b.isActive) || businesses[0] || null

    set({
      initialized: true,
      settings,
      notifications,
      currentBusiness: currentBiz,
      user: { id: 'admin', businessId: currentBiz?.id || 'biz-default', name: 'Admin', email: 'admin@neoxerp.com', passwordHash: '', role: 'admin', permissions: ['*'], isActive: true, createdAt: new Date().toISOString() },
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
  setLocked: (locked) => set({ locked }),
  setCurrentBusiness: (biz) => set({ currentBusiness: biz }),

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
