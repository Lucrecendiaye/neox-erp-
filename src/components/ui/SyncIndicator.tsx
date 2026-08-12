import { useSyncStore } from '@/stores/appStore'
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'

export default function SyncIndicator() {
  const { syncing, lastSync } = useSyncStore()

  if (!lastSync && !syncing) return null

  return (
    <div className={cn(
      'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors',
      syncing ? 'bg-blue-500/15 text-blue-400' : lastSync ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-100 text-surface-400'
    )}>
      {syncing ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : lastSync ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <AlertCircle className="w-3 h-3" />
      )}
      <span className="hidden sm:inline">
        {syncing ? 'Synchronisation...' : lastSync ? `Sync: ${formatDateTime(lastSync)}` : 'Sync en attente'}
      </span>
    </div>
  )
}
