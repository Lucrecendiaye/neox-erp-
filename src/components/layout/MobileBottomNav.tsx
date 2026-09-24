import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  Landmark, ShoppingCart, Users, Package, MoreHorizontal
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'

interface NavItem {
  to: string
  label: string
  module: string
  icon: React.ReactNode
}

const items: NavItem[] = [
  { to: '/treasury', label: 'Trésorerie', module: 'cash', icon: <Landmark className="w-6 h-6" /> },
  { to: '/pos', label: 'Vente', module: 'pos', icon: <ShoppingCart className="w-6 h-6" /> },
  { to: '/customers', label: 'Clients', module: 'customers', icon: <Users className="w-6 h-6" /> },
  { to: '/products', label: 'Stock', module: 'products', icon: <Package className="w-6 h-6" /> },
  { to: '/more', label: 'Plus', module: '', icon: <MoreHorizontal className="w-6 h-6" /> },
]

export default function MobileBottomNav() {
  const { canAny, isAdmin } = usePermission()
  const location = useLocation()

  const visible = items.filter(i =>
    i.module === '' || isAdmin() || canAny(i.module as any)
  )

  return (
    <nav className="mobile-bottom-nav lg:hidden safe-area-bottom">
      {visible.map(item => {
        const isActive = location.pathname === item.to ||
          (item.to !== '/' && item.to !== '/settings' && location.pathname.startsWith(item.to))
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(isActive && 'active')}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
