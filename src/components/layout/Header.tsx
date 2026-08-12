import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore, useSyncStore } from '@/stores/appStore'
import { formatDateTime, cn } from '@/lib/utils'
import SearchDialog from '@/components/ui/SearchDialog'
import SyncIndicator from '@/components/ui/SyncIndicator'
import { signOut } from '@/lib/auth'
import { LogOut, Settings, User, Palette } from 'lucide-react'
import { useTheme, THEMES } from '@/providers/theme-provider'

export default function Header() {
  const navigate = useNavigate()
  const { sidebarOpen, setSidebarOpen, settings, currentBusiness, user } = useAppStore()
  const { lastSync } = useSyncStore()
  const { theme, setTheme } = useTheme()
  const [searchOpen, setSearchOpen] = useState(false)
  const [userDropdown, setUserDropdown] = useState(false)
  const [themeDropdown, setThemeDropdown] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserDropdown(false)
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleLogout() {
    await signOut()
    window.location.href = '/login'
  }

  return (
    <header className="sticky top-0 z-10 glass border-b border-surface-200/50 h-16">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-1.5 sm:gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-surface-100 text-surface-500 transition-colors lg:hidden"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-surface-700">
            <div className="w-7 h-7 bg-primary-100 rounded-lg flex items-center justify-center text-primary-400 text-xs font-bold">
              {currentBusiness?.name?.charAt(0) || 'E'}
            </div>
            <span className="hidden sm:inline">{currentBusiness?.name || 'Entreprise'}</span>
          </div>

          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-surface-100 text-surface-400 transition-colors sm:relative sm:w-auto sm:h-auto sm:gap-2 sm:px-3 sm:py-2 sm:bg-surface-100 sm:hover:bg-surface-200 sm:min-w-[200px]"
          >
            <svg className="w-5 h-5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="hidden sm:inline">Rechercher...</span>
            <kbd className="hidden sm:inline ml-auto text-[10px] px-1.5 py-0.5 rounded-md bg-surface-200/50 text-surface-400 font-mono">Ctrl+K</kbd>
          </button>
          <div className="hidden sm:flex items-center gap-2">
            <SyncIndicator />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative" ref={themeRef}>
            <button onClick={() => setThemeDropdown(!themeDropdown)}
              className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-surface-100 text-surface-400 hover:text-primary-400 transition-colors"
              title="Changer de thème">
              <Palette className="w-5 h-5" />
            </button>
            {themeDropdown && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-surface-100 rounded-xl shadow-lg border border-surface-200 p-2 animate-fade-in z-50">
                <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-surface-400">Thème de l'application</p>
                {THEMES.map((t) => (
                  <button key={t.id}
                    onClick={() => { setTheme(t.id); setThemeDropdown(false) }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                      theme === t.id ? 'bg-primary-50 text-surface-800' : 'text-surface-600 hover:bg-surface-50'
                    )}>
                    <span className="flex -space-x-1.5 shrink-0">
                      {t.swatches.map((c, i) => (
                        <span key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="flex flex-col items-start">
                      <span className="font-semibold text-surface-800">{t.label}</span>
                      <span className="text-[10px] text-surface-400">{t.tag}</span>
                    </span>
                    {theme === t.id && <span className="ml-auto text-xs font-bold text-primary-400">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={userRef}>
            <button onClick={() => setUserDropdown(!userDropdown)} className="flex items-center gap-2 pl-2 border-l border-surface-200 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 bg-primary-100 text-primary-400 rounded-full flex items-center justify-center text-sm font-semibold">
                {user?.name?.charAt(0)?.toUpperCase() || 'A'}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium text-surface-900">{user?.name || 'Utilisateur'}</p>
                <p className="text-xs text-surface-400">{currentBusiness?.name || settings?.name || 'Boutique'}</p>
              </div>
            </button>
            {userDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-surface-100 rounded-xl shadow-lg border border-surface-200 py-1 animate-fade-in z-50">
                <button onClick={() => { setUserDropdown(false); navigate('/settings') }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50">
                  <Settings className="w-4 h-4 text-surface-400" /> Paramètres
                </button>
                <button onClick={() => { setUserDropdown(false); navigate('/users') }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-surface-700 hover:bg-surface-50">
                  <User className="w-4 h-4 text-surface-400" /> Mon compte
                </button>
                <div className="border-t border-surface-200 my-1" />
                <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-red-500/15">
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
