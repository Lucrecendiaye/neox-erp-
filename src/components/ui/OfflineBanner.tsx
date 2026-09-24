import { useAppStore } from '@/stores/appStore'
import { WifiOff, Wifi, CloudOff } from 'lucide-react'

export default function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline)
  const cloudStatus = useAppStore((s) => s.cloudStatus)

  const cloudDown = isOnline && cloudStatus === 'down'

  if (isOnline && !cloudDown) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {!isOnline ? (
        <div className="bg-amber-500 text-white text-xs text-center py-3 px-4 flex items-center justify-center gap-2 font-medium">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Mode hors ligne — Les modifications seront synchronisées automatiquement.</span>
        </div>
      ) : (
        <div className="bg-red-500 text-white text-xs text-center py-3 px-4 flex items-center justify-center gap-2 font-medium">
          <CloudOff className="w-4 h-4 shrink-0" />
          <span>Synchronisation cloud indisponible — Vos données restent enregistrées sur cet appareil.</span>
        </div>
      )}
    </div>
  )
}
