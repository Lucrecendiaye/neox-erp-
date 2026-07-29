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
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-30 h-screen flex flex-col bg-white border-r border-surface-200 shadow-sm',
          sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:w-64 lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-surface-100">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm">
              {settings?.name?.charAt(0) || 'N'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-surface-900 truncate">{settings?.name || 'NeoX ERP'}</p>
            {settings?.slogan && <p className="text-[10px] text-surface-400 truncate">{settings.slogan}</p>}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-none">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 min-h-[40px]',
                  isActive
                    ? 'bg-primary-50 text-primary-700 border border-primary-100'
                    : 'text-surface-600 hover:bg-surface-50 hover:text-surface-800'
                )
              }
            >
              <span className="shrink-0">
                {item.icon}
              </span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="p-3 border-t border-surface-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-surface-400 hover:text-surface-600 hover:bg-surface-50 transition-all min-h-[40px]"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span>Masquer</span>
          </button>
        </div>
      </aside>
    </>
  )
}
