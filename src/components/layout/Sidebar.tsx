import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/appStore'
import { usePermission } from '@/hooks/usePermission'
import {
  LayoutDashboard, ShoppingCart, Receipt, Building2, Package,
  ClipboardList, Users, Truck, ArrowDownToLine, FileText, CreditCard,
  BookOpen, BarChart3, UsersRound, Settings, Trash2,
} from 'lucide-react'

interface NavItem {
  to: string
  label: string
  module: string
  icon: React.ReactNode
}

const allNavItems: NavItem[] = [
  { to: '/', label: 'Tableau de bord', module: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { to: '/pos', label: 'Caisse POS', module: 'pos', icon: <ShoppingCart className="w-5 h-5" /> },
  { to: '/products', label: 'Produits', module: 'products', icon: <Package className="w-5 h-5" /> },
  { to: '/sales', label: 'Ventes', module: 'sales', icon: <Receipt className="w-5 h-5" /> },
  { to: '/credit', label: 'Crédits', module: 'credit', icon: <BookOpen className="w-5 h-5" /> },
  { to: '/customers', label: 'Clients', module: 'customers', icon: <Users className="w-5 h-5" /> },
  { to: '/suppliers', label: 'Fournisseurs', module: 'suppliers', icon: <Truck className="w-5 h-5" /> },
  { to: '/purchases', label: 'Dépenses', module: 'purchases', icon: <ArrowDownToLine className="w-5 h-5" /> },
  { to: '/invoices', label: 'Comptabilité', module: 'invoices', icon: <FileText className="w-5 h-5" /> },
  { to: '/reports', label: 'Rapports', module: 'reports', icon: <BarChart3 className="w-5 h-5" /> },
  { to: '/depots', label: 'Dépôts', module: 'depots', icon: <Building2 className="w-5 h-5" /> },
  { to: '/stock', label: 'Stock', module: 'stock', icon: <ClipboardList className="w-5 h-5" /> },
  { to: '/payments', label: 'Paiements', module: 'payments', icon: <CreditCard className="w-5 h-5" /> },
  { to: '/users', label: 'Utilisateurs', module: 'users', icon: <UsersRound className="w-5 h-5" /> },
  { to: '/settings', label: 'Paramètres', module: 'settings', icon: <Settings className="w-5 h-5" /> },
  { to: '/trash', label: 'Corbeille', module: 'trash', icon: <Trash2 className="w-5 h-5" /> },
]

function AGSLogo({ expanded }: { expanded: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 h-16 shrink-0">
      <div className="logo-ags-icon shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </div>
      {expanded && (
        <div className="min-w-0">
          <div className="logo-ags-text text-lg">AGS</div>
          <div className="logo-ags-subtitle">ABDALLAH GROSSISTE SLIPS</div>
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, settings } = useAppStore()
  const { canAny, isAdmin } = usePermission()

  const visibleItems = allNavItems.filter(item =>
    isAdmin() || canAny(item.module as any)
  )

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'sidebar-ags fixed top-0 left-0 z-30 h-screen flex flex-col',
          sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:w-64 lg:translate-x-0'
        )}
      >
        <AGSLogo expanded={sidebarOpen} />

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-none">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'sidebar-item-ags',
                  isActive && 'sidebar-item-ags-active'
                )
              }
            >
              <span className="icon-3d shrink-0">
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
              <span className="sidebar-arrow">›</span>
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-white/5">
          <div className="flex items-center gap-2 mb-1">
            <div className="logo-ags-icon w-7 h-7">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-white/30 font-medium">Marché Sandaga Rue Fleurus</p>
              <p className="text-[9px] text-white/20">angle pôle Haule</p>
            </div>
          </div>
          <p className="text-[10px] text-white/25 mt-1">Tel: +221 767612865 - 785999584</p>
        </div>
      </aside>
    </>
  )
}
