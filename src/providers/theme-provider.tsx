import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export type ThemeId = 'cafe' | 'noir'

export const THEMES: { id: ThemeId; label: string; tag: string; accent: string; bg1: string; bg2: string; swatches: string[] }[] = [
  {
    id: 'cafe',
    label: 'Café Profond',
    tag: 'Warm Executive',
    accent: '#d97706',
    bg1: '#ffffff',
    bg2: '#f8fafc',
    swatches: ['#ffffff', '#f8fafc', '#b45309'],
  },
  {
    id: 'noir',
    label: 'Noir Gourmet',
    tag: 'Ultra-Minimaliste Slate',
    accent: '#10b981',
    bg1: '#ffffff',
    bg2: '#f8fafc',
    swatches: ['#ffffff', '#f8fafc', '#047857'],
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
