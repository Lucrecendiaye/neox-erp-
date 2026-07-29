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
  badge?: string
}

const allNavItems: NavItem[] = [
  { to: '/', label: 'Tableau de bord', module: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { to: '/pos', label: 'Point de Vente', module: 'pos', icon: <ShoppingCart className="w-5 h-5" /> },
  { to: '/sales', label: 'Ventes', module: 'sales', icon: <Receipt className="w-5 h-5" /> },
  { to: '/depots', label: 'Dépôts', module: 'depots', icon: <Building2 className="w-5 h-5" /> },
  { to: '/products', label: 'Produits', module: 'products', icon: <Package className="w-5 h-5" /> },
  { to: '/stock', label: 'Stock', module: 'stock', icon: <ClipboardList className="w-5 h-5" /> },
  { to: '/customers', label: 'Clients', module: 'customers', icon: <Users className="w-5 h-5" /> },
  { to: '/suppliers', label: 'Fournisseurs', module: 'suppliers', icon: <Truck className="w-5 h-5" /> },
  { to: '/purchases', label: 'Achats', module: 'purchases', icon: <ArrowDownToLine className="w-5 h-5" /> },
  { to: '/invoices', label: 'Factures', module: 'invoices', icon: <FileText className="w-5 h-5" /> },
  { to: '/payments', label: 'Paiements', module: 'payments', icon: <CreditCard className="w-5 h-5" /> },
  { to: '/credit', label: 'Crédit', module: 'credit', icon: <BookOpen className="w-5 h-5" /> },
  { to: '/reports', label: 'Rapports', module: 'reports', icon: <BarChart3 className="w-5 h-5" /> },
  { to: '/users', label: 'Utilisateurs', module: 'users', icon: <UsersRound className="w-5 h-5" /> },
  { to: '/settings', label: 'Paramètres', module: 'settings', icon: <Settings className="w-5 h-5" /> },
  { to: '/trash', label: 'Corbeille', module: 'trash', icon: <Trash2 className="w-5 h-5" /> },
]

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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'sidebar-glass fixed top-0 left-0 z-30 h-screen flex flex-col',
          sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:w-20 lg:translate-x-0'
        )}
      >
        {/* Premium Logo */}
        <div className="flex items-center gap-3 px-4 lg:px-4 h-16 shrink-0">
          <div className="logo-premium w-10 h-10 flex items-center justify-center shrink-0">
            {settings?.logo ? (
              <img src={settings.logo} alt="" className="w-7 h-7 object-contain" />
            ) : (
              <span className="text-white font-bold text-base drop-shadow-sm">
                {(settings?.name || 'N')[0]}
              </span>
            )}
          </div>
          {sidebarOpen && (
            <div className="min-w-0">
              <p className="font-semibold text-sm text-white truncate drop-shadow-sm">{settings?.name || 'NeoX ERP'}</p>
              {settings?.slogan && <p className="text-[10px] text-white/50 truncate">{settings.slogan}</p>}
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 scrollbar-none">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'sidebar-item flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-150 min-h-[44px]',
                  isActive
                    ? 'sidebar-item-active text-white'
                    : 'text-white/60 hover:text-white/90'
                )
              }
            >
              <span className={cn(
                'icon-3d shrink-0',
              )}>
                {item.icon}
              </span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom toggle */}
        <div className="p-3 border-t border-white/5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all min-h-[44px]"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {sidebarOpen && <span>Masquer</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
