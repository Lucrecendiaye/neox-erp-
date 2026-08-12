import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ShoppingCart, HandCoins, Package, BarChart3, Settings
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'

interface NavItem {
  to: string
  label: string
  module: string
  icon: React.ReactNode
}

const items: NavItem[] = [
  { to: '/', label: 'Accueil', module: 'dashboard', icon: <LayoutDashboard className="w-6 h-6" /> },
  { to: '/pos', label: 'Caisse', module: 'pos', icon: <ShoppingCart className="w-6 h-6" /> },
  { to: '/credits', label: 'Crédits', module: 'sales', icon: <HandCoins className="w-6 h-6" /> },
  { to: '/products', label: 'Stock', module: 'products', icon: <Package className="w-6 h-6" /> },
  { to: '/reports', label: 'Rapports', module: 'reports', icon: <BarChart3 className="w-6 h-6" /> },
  { to: '/settings', label: 'Paramètres', module: '', icon: <Settings className="w-6 h-6" /> },
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
