import { useAppStore } from '@/stores/appStore'
import { isStandalone } from '@/lib/pwa'
import { WifiOff, Wifi, Download } from 'lucide-react'

export default function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline)

  if (isOnline) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up lg:bottom-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="bg-amber-500 text-white text-xs text-center py-3 px-4 flex items-center justify-center gap-2 font-medium">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>Mode hors ligne — Les modifications seront synchronisées automatiquement.</span>
      </div>
    </div>
  )
}
