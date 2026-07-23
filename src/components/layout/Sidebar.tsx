import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/appStore'
import { LayoutDashboard, Package, ClipboardList, ShoppingCart, Users, Truck, ArrowDownToLine, CreditCard, Landmark, BookOpen, FileText, Bell, BarChart3, History, Wallet, UserCheck, MessageSquare, Lock, Building2, UsersRound, Target } from 'lucide-react'

const iconMap: Record<string, React.ReactNode> = {
  '/': <LayoutDashboard className="w-5 h-5" />,
  '/products': <Package className="w-5 h-5" />,
  '/stock': <ClipboardList className="w-5 h-5" />,
  '/pos': <ShoppingCart className="w-5 h-5" />,
  '/customers': <Users className="w-5 h-5" />,
  '/suppliers': <Truck className="w-5 h-5" />,
  '/purchases': <ArrowDownToLine className="w-5 h-5" />,
  '/payments': <CreditCard className="w-5 h-5" />,
  '/accounting': <Landmark className="w-5 h-5" />,
  '/credit': <BookOpen className="w-5 h-5" />,
  '/invoices': <FileText className="w-5 h-5" />,
  '/notifications': <Bell className="w-5 h-5" />,
  '/reports': <BarChart3 className="w-5 h-5" />,
  '/audit': <History className="w-5 h-5" />,
  '/cashbook': <Wallet className="w-5 h-5" />,
  '/payroll': <UserCheck className="w-5 h-5" />,
  '/payroll/employees': <UserCheck className="w-5 h-5" />,
  '/payroll/attendance': <UserCheck className="w-5 h-5" />,
  '/crm': <Target className="w-5 h-5" />,
  '/sms': <MessageSquare className="w-5 h-5" />,
  '/billbook': <FileText className="w-5 h-5" />,
  '/users': <UsersRound className="w-5 h-5" />,
  '/lock': <Lock className="w-5 h-5" />,
  '/businesses': <Building2 className="w-5 h-5" />,
}

const navItems = [
  { to: '/', label: 'Tableau de bord' },
  { to: '/pos', label: 'Point de Vente' },
  { to: '/products', label: 'Produits' },
  { to: '/stock', label: 'Stock' },
  { to: '/customers', label: 'Clients' },
  { to: '/suppliers', label: 'Fournisseurs' },
  { to: '/purchases', label: 'Achats' },
  { to: '/invoices', label: 'Factures' },
  { to: '/payments', label: 'Paiements' },
  { to: '/credit', label: 'Crédit' },
  { to: '/cashbook', label: 'Caisse' },
  { to: '/accounting', label: 'Comptabilité' },
  { to: '/payroll', label: 'Paie' },
  { to: '/payroll/employees', label: 'Employés' },
  { to: '/payroll/attendance', label: 'Présences' },
  { to: '/crm', label: 'CRM' },
  { to: '/sms', label: 'Rappels SMS' },
  { to: '/billbook', label: 'Facturier' },
  { to: '/reports', label: 'Rapports' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/audit', label: 'Audit' },
  { to: '/users', label: 'Utilisateurs' },
  { to: '/businesses', label: 'Sociétés' },
  { to: '/lock', label: 'Verrouillage' },
]

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore()

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-30 h-full bg-surface-900 text-white transition-all duration-300 flex flex-col',
          sidebarOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:w-20 lg:translate-x-0'
        )}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-surface-700/50">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center font-bold text-sm">N</div>
          {sidebarOpen && (
            <div>
              <p className="font-semibold text-sm">NeoX ERP</p>
              <p className="text-xs text-surface-400">Nouvelle Génération</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                  isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-surface-300 hover:bg-surface-800 hover:text-white'
                )
              }
            >
              <span className="shrink-0">{iconMap[item.to]}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-surface-700/50">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-surface-400 hover:bg-surface-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {sidebarOpen && <span>Masquer</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
