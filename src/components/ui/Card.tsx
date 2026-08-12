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
    <div onClick={(e) => onClick?.(e)} className={cn('premium-card', p[padding], onClick && 'cursor-pointer', className)}>
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
  primary: 'bg-primary-50 text-primary-400',
  success: 'bg-emerald-500/15 text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-400',
  danger: 'bg-red-500/15 text-red-400',
  info: 'bg-blue-500/15 text-blue-400',
}

export function StatCard({ title, value, icon, trend, color = 'primary' }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden group hover-lift">
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold gradient-text">{value}</p>
          {trend && (
            <p className={cn('text-xs flex items-center gap-1 font-medium', trend.positive ? 'text-success' : 'text-danger')}>
              <span>{trend.positive ? '↑' : '↓'}</span>
              {Math.abs(trend.value)}% vs mois dernier
            </p>
          )}
        </div>
        <div className={cn('p-3 rounded-2xl shadow-sm', statColors[color])}>
          {icon}
        </div>
      </div>
    </Card>
  )
}
