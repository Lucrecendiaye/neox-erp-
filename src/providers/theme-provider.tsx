import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type ThemeId = 'cafe' | 'noir'

export const THEMES: { id: ThemeId; label: string; tag: string; accent: string; bg1: string; bg2: string; swatches: string[] }[] = [
  {
    id: 'cafe',
    label: 'Café Profond',
    tag: 'Warm Executive',
    accent: '#d97706',
    bg1: '#121214',
    bg2: '#0a0e17',
    swatches: ['#1A1A1A', '#0D1117', '#D97706'],
  },
  {
    id: 'noir',
    label: 'Noir Gourmet',
    tag: 'Ultra-Minimaliste Slate',
    accent: '#10b981',
    bg1: '#000000',
    bg2: '#1e293b',
    swatches: ['#000000', '#1E293B', '#10B981'],
  },
]

const STORAGE_KEY = 'neox-theme'

type ThemeContextType = {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'cafe', setTheme: () => {} })

function readInitialTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'cafe' || stored === 'noir') return stored
  } catch { /* ignore */ }
  return 'cafe'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readInitialTheme)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    document.documentElement.classList.remove('theme-nexus', 'theme-cafe', 'theme-noir')
    document.documentElement.classList.add(`theme-${theme}`)
    setMounted(true)
  }, [theme])

  const setTheme = useCallback((next: ThemeId) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch { /* ignore */ }
    setThemeState(next)
  }, [])

  if (!mounted) return <>{children}</>

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
