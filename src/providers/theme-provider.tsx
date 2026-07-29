import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type ThemeContextType = {
  theme: string
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'nexus' })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('theme-nexus')
    setMounted(true)
  }, [])

  if (!mounted) return <>{children}</>

  return (
    <ThemeContext.Provider value={{ theme: 'nexus' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
