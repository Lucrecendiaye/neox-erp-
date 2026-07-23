import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore, useSyncStore } from '@/stores/appStore'
import { formatDateTime } from '@/lib/utils'
import SearchDialog from '@/components/ui/SearchDialog'
import db from '@/db'
import { signOut } from '@/lib/auth'
import type { Business } from '@/types'
import { LogOut, Settings, User } from 'lucide-react'

export default function Header() {
  const navigate = useNavigate()
  const { sidebarOpen, setSidebarOpen, settings, unreadCount, currentBusiness, setCurrentBusiness } = useAppStore()
  const { lastSync } = useSyncStore()
  const [searchOpen, setSearchOpen] = useState(false)
  const [bizDropdown, setBizDropdown] = useState(false)
  const [userDropdown, setUserDropdown] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    await signOut()
    window.location.href = '/login'
  }

  const businesses: Business[] = []

  async function switchBusiness(biz: Business) {
    await db.businesses.toArray().then(all => {
      all.forEach(b => db.businesses.update(b.id, { isActive: b.id === biz.id }))
    })
    setCurrentBusiness(biz)
    setBizDropdown(false)
    window.location.reload()
  }

  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-surface-200 h-16">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl hover:bg-surface-100 text-surface-500 transition-colors lg:hidden"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="relative">
            <button
              onClick={() => setBizDropdown(!bizDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-surface-100 text-sm font-medium text-surface-700 transition-colors"
            >
              <div className="w-6 h-6 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 text-xs font-bold">
                {currentBusiness?.name?.charAt(0) || 'E'}
              </div>
              <span className="hidden sm:inline">{currentBusiness?.name || 'Entreprise'}</span>
              <svg className="w-3.5 h-3.5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {bizDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-lg border border-surface-200 py-1 min-w-[200px] animate-fade-in">
                {businesses.map(biz => (
                  <button
                    key={biz.id}
                    onClick={() => switchBusiness(biz)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-50 flex items-center gap-3 ${biz.id === currentBusiness?.id ? 'text-primary-600 font-medium bg-primary-50' : 'text-surface-700'}`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-surface-100 flex items-center justify-center text-xs font-bold">
                      {biz.name.charAt(0)}
                    </div>
                    <span>{biz.name}</span>
                    {biz.id === currentBusiness?.id && (
                      <svg className="w-4 h-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
                <div className="border-t border-surface-200 mt-1 pt-1">
                  <button onClick={() => { setBizDropdown(false); navigate('/businesses') }} className="w-full text-left px-4 py-2.5 text-sm text-surface-500 hover:bg-surface-50 flex items-center gap-3">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Gérer les sociétés
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-100 hover:bg-surface-200 text-surface-400 text-sm transition-colors min-w-[200px]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Rechercher...</span>
            <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-surface-200/50 text-surface-400 font-mono">Ctrl+K</kbd>
          </button>
          <div className="hidden sm:flex items-center gap-2 text-xs text-surface-400">
            {lastSync && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Synchro: {formatDateTime(lastSync)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/notifications')} className="relative p-2 rounded-xl hover:bg-surface-100 text-surface-500 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount() > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount()}
              </span>
            )}
          </button>

          <div className="relative" ref={userRef}>
            <button onClick={() => setUserDropdown(!userDropdown)} className="flex items-center gap-2 pl-2 border-l border-surface-200 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-semibold">
                A
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-surface-900">Admin</p>
                <p className="text-xs text-surface-400">{settings?.name || 'Entreprise'}</p>
              </div>
            </button>
            {userDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border border-surface-200 py-1 animate-fade-in z-50">
                <button onClick={() => { setUserDropdown(false); navigate('/settings') }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50">
                  <Settings className="w-4 h-4 text-surface-400" /> Paramètres
                </button>
                <button onClick={() => { setUserDropdown(false); navigate('/users') }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50">
                  <User className="w-4 h-4 text-surface-400" /> Mon compte
                </button>
                <div className="border-t border-surface-200 my-1" />
                <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-red-50">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  )
}
