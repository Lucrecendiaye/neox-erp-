import { useAppStore } from '@/stores/appStore'
import { WifiOff, Wifi } from 'lucide-react'

export default function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline)

  if (isOnline) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="bg-amber-500 text-white text-xs text-center py-2 px-4 flex items-center justify-center gap-2">
        <WifiOff className="w-3.5 h-3.5" />
        <span>Vous êtes hors ligne. Les données seront synchronisées automatiquement.</span>
      </div>
    </div>
  )
}
