import { useEffect, useState } from 'react'
import { isStandalone } from '@/lib/pwa'
import { Smartphone } from 'lucide-react'

export default function PWAStatus() {
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    setStandalone(isStandalone())
    const mq = window.matchMedia('(display-mode: standalone)')
    const handler = (e: MediaQueryListEvent) => setStandalone(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  if (!standalone) return null

  return (
    <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-primary-400 bg-primary-50/50 px-2 py-1 rounded-lg">
      <Smartphone className="w-3 h-3" />
      <span>App installée</span>
    </div>
  )
}
