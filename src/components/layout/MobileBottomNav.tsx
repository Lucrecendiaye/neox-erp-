import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, ShoppingCart, Receipt, Package,
  Building2, Truck, Settings, Plus
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'

interface NavItem {
  to: string
  label: string
  module: string
  icon: React.ReactNode
}

const items: NavItem[] = [
  { to: '/', label: 'Board', module: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { to: '/pos', label: 'Vente', module: 'pos', icon: <ShoppingCart className="w-5 h-5" /> },
  { to: '/sales', label: 'Ventes', module: 'sales', icon: <Receipt className="w-5 h-5" /> },
  { to: '/products', label: 'Produits', module: 'products', icon: <Package className="w-5 h-5" /> },
  { to: '/depots', label: 'Dépôts', module: 'depots', icon: <Building2 className="w-5 h-5" /> },
  { to: '/suppliers', label: 'Fournisseurs', module: 'suppliers', icon: <Truck className="w-5 h-5" /> },
]

export default function MobileBottomNav() {
  const { canAny, isAdmin } = usePermission()
  const location = useLocation()

  const visible = items.filter(i =>
    isAdmin() || canAny(i.module as any)
  )

  return (
    <nav className="mobile-bottom-nav lg:hidden safe-area-bottom">
      {visible.map(item => {
        const isActive = location.pathname === item.to || 
          (item.to !== '/' && location.pathname.startsWith(item.to))
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
