import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Truck, ArrowDownToLine, CreditCard } from 'lucide-react'

const tabs = [
  { to: '/suppliers', label: 'Fournisseurs', icon: <Truck className="w-4 h-4" />, end: true },
  { to: '/purchases', label: 'Achats', icon: <ArrowDownToLine className="w-4 h-4" /> },
  { to: '/payments', label: 'Paiements', icon: <CreditCard className="w-4 h-4" /> },
]

export default function SupplierTabs() {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-100 border border-surface-200 w-fit">
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            isActive
              ? 'bg-white shadow-sm text-primary-600'
              : 'text-surface-500 hover:text-surface-800'
          )}
        >
          {tab.icon}
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
