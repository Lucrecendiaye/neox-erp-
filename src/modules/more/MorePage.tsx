import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { signOut } from '@/lib/auth'
import SyncIndicator from '@/components/ui/SyncIndicator'
import {
  Receipt, Truck, Building2, Users, UsersRound, Trash2,
  LogOut, ChevronRight, ChevronDown, User as UserIcon, ScrollText, Bell,
  MessageSquareText, Wallet, Coins, FileText, BellRing,
} from 'lucide-react'

interface MoreItem {
  to: string
  label: string
  desc: string
  module: string
  icon: React.ReactNode
}

const items: MoreItem[] = [
  { to: '/sales', label: 'Ventes', desc: 'Historique et factures', module: 'sales', icon: <Receipt className="w-6 h-6" /> },
  { to: '/purchases', label: 'Achats', desc: 'Approvisionnements', module: 'purchases', icon: <Truck className="w-6 h-6" /> },
  { to: '/depots', label: 'Dépôts', desc: 'Multi-boutiques et entrepôts', module: 'depots', icon: <Building2 className="w-6 h-6" /> },
  { to: '/customers', label: 'Clients', desc: 'Carnet de clients', module: 'customers', icon: <Users className="w-6 h-6" /> },
  { to: '/suppliers', label: 'Fournisseurs', desc: 'Carnet de fournisseurs', module: 'suppliers', icon: <UsersRound className="w-6 h-6" /> },
  { to: '/invoices', label: 'Factures', desc: 'Factures et notes de crédit', module: 'invoices', icon: <FileText className="w-6 h-6" /> },
  { to: '/cashbook', label: 'Caisse', desc: 'Journal de caisse', module: 'cashbook', icon: <Wallet className="w-6 h-6" /> },
  { to: '/cash', label: 'Cash', desc: 'Opérations de trésorerie externe', module: 'cash', icon: <Coins className="w-6 h-6" /> },
  { to: '/treasury', label: 'Trésorerie', desc: 'Tous les mouvements d’argent', module: 'cash', icon: <Wallet className="w-6 h-6" /> },
  { to: '/reminders', label: 'Rappels', desc: 'Rappels et relances de paiement', module: 'sales', icon: <BellRing className="w-6 h-6" /> },
  { to: '/sms', label: 'Rappels SMS', desc: 'Rappels de crédits', module: 'sms', icon: <MessageSquareText className="w-6 h-6" /> },
  { to: '/notifications', label: 'Notifications', desc: 'Alertes et rappels', module: 'notifications', icon: <Bell className="w-6 h-6" /> },
  { to: '/audit', label: 'Journal', desc: "Journal d'audit", module: 'audit', icon: <ScrollText className="w-6 h-6" /> },
  { to: '/users', label: 'Utilisateurs', desc: 'Équipe et permissions', module: 'users', icon: <UsersRound className="w-6 h-6" /> },
  { to: '/trash', label: 'Corbeille', desc: 'Éléments supprimés', module: 'trash', icon: <Trash2 className="w-6 h-6" /> },
]

export default function MorePage() {
  const navigate = useNavigate()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { settings, currentBusiness, user } = useAppStore()
  const { canAny, isAdmin } = usePermission()

  const visible = items.filter(i =>
    isAdmin() || canAny(i.module as any)
  )
  const primary = visible.filter(i => ['/sales', '/customers', '/treasury'].includes(i.to))
  const advanced = visible.filter(i => !primary.includes(i))

  async function handleLogout() {
    await signOut()
    window.location.href = '/login'
  }

  return (
    <div className="w-full h-full flex flex-col gap-5">
      {/* Profil */}
      <div className="flex items-center gap-4 p-4 bg-surface-100 rounded-2xl border border-surface-200 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-400 text-xl font-bold shrink-0">
          {user?.name?.charAt(0)?.toUpperCase() || <UserIcon className="w-7 h-7" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-surface-900 text-base truncate">{user?.name || 'Utilisateur'}</p>
          <p className="text-sm text-surface-500 truncate">{currentBusiness?.name || settings?.name || 'Boutique'}</p>
        </div>
        <div className="flex items-center gap-1">
          <SyncIndicator />
        </div>
      </div>

      {/* Accès principaux */}
      <div className="grid grid-cols-2 gap-3">
        {primary.map(item => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="flex items-center gap-3 p-4 rounded-2xl bg-surface-100 border border-surface-200 shadow-sm active:scale-[0.98] transition-all text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-primary-400 shrink-0">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-surface-900 text-sm">{item.label}</p>
              <p className="text-[11px] text-surface-500 truncate">{item.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-surface-400 shrink-0" />
          </button>
        ))}
      </div>

      {/* Fonctions avancées masquées par défaut sur mobile */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="lg:hidden flex items-center justify-between px-4 py-3 rounded-2xl bg-surface-100 border border-surface-200 text-sm font-semibold text-surface-700"
      >
        <span>{showAdvanced ? 'Masquer les fonctions avancées' : `Afficher les fonctions avancées (${advanced.length})`}</span>
        <ChevronDown className={cn('w-4 h-4 transition-transform', showAdvanced && 'rotate-180')} />
      </button>

      <div className={cn('grid grid-cols-2 gap-3', !showAdvanced && 'hidden lg:grid')}>
        {advanced.map(item => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className="flex items-center gap-3 p-4 rounded-2xl bg-surface-100 border border-surface-200 shadow-sm active:scale-[0.98] transition-all text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-primary-400 shrink-0">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-surface-900 text-sm">{item.label}</p>
              <p className="text-[11px] text-surface-500 truncate">{item.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-surface-400 shrink-0" />
          </button>
        ))}
      </div>

      <button
        onClick={handleLogout}
        className={cn(
          'mt-auto flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base',
          'bg-red-500/10 text-red-400 border border-red-500/30 active:scale-[0.98] transition-all'
        )}
      >
        <LogOut className="w-5 h-5" /> Se déconnecter
      </button>
    </div>
  )
}
