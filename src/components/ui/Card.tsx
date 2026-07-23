import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
  onClick?: (e: React.MouseEvent) => void
}

export function Card({ children, className, padding = 'md', onClick }: CardProps) {
  const p = { sm: 'p-4', md: 'p-6', lg: 'p-8' }
  return (
    <div onClick={(e) => onClick?.(e)} className={cn('bg-white rounded-2xl border border-surface-200 shadow-sm', p[padding], onClick && 'cursor-pointer', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-between mb-4', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-lg font-semibold text-surface-900', className)}>{children}</h3>
}

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: { value: number; positive: boolean }
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

const statColors = {
  primary: 'bg-primary-50 text-primary-600',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
  info: 'bg-blue-50 text-blue-600',
}

export function StatCard({ title, value, icon, trend, color = 'primary' }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-surface-500">{title}</p>
          <p className="text-2xl font-bold text-surface-900">{value}</p>
          {trend && (
            <p className={cn('text-xs flex items-center gap-1', trend.positive ? 'text-success' : 'text-danger')}>
              <span>{trend.positive ? '↑' : '↓'}</span>
              {Math.abs(trend.value)}% vs mois dernier
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-2xl', statColors[color])}>
          {icon}
        </div>
      </div>
    </Card>
  )
}
