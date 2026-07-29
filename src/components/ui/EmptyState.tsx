import { cn } from '@/lib/utils'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in',
      className
    )}>
      <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-4 text-surface-400">
        {icon || <Inbox className="w-8 h-8" />}
      </div>
      <h3 className="text-lg font-semibold text-surface-900">{title}</h3>
      {description && (
        <p className="text-sm text-surface-500 mt-1 max-w-sm">{description}</p>
      )}
      {action && (
        <div className="mt-6">{action}</div>
      )}
    </div>
  )
}
