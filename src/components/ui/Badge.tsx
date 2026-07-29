import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}

const badgeVariants = {
  default: 'premium-badge-default',
  success: 'premium-badge-success',
  warning: 'premium-badge-warning',
  danger: 'premium-badge-danger',
  info: 'premium-badge-info',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span className={cn(
      'premium-badge',
      badgeVariants[variant],
      className
    )}>
      {children}
    </span>
  )
}
