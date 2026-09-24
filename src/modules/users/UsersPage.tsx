import { useState, useEffect, useMemo } from 'react'
import { Card, CardTitle, Button, Input, Select, Badge, Modal, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePermission } from '@/hooks/usePermission'
import { useAppStore } from '@/stores/appStore'
import db from '@/db'
import { generateId, formatDate, formatDateTime, formatCurrency } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { softDelete } from '@/lib/softDelete'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { Search, Plus, Edit2, Trash2, ToggleRight, Users, Shield, KeyRound, History, Check, X, MonitorSmartphone, Ban, Smartphone, TrendingUp, Wallet, ShoppingCart, CalendarDays, Download, Filter, Activity, UserRound, ChevronRight } from 'lucide-react'
import type { User, UserStatus, AuthSession, AuditLog, Sale } from '@/types'
import { SIMPLIFIED_PERMISSIONS, ROLE_PRESETS, getPermissionsFromSimplified, getSimplifiedFromPermissions, type RolePreset } from '@/lib/permissions'
import { USER_STATUSES, effectiveStatus, listUserSessions, revokeSession, revokeAllSessions, broadcastUserBlock } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { PERIOD_OPTIONS, getPeriodBounds, type PeriodKey } from '@/engine/dashboardStats'
import {
  computeUserStats, filterSalesByUsers, periodSalesOf, buildUserSeries, filterAuditLogs,
  auditMeta, entityLabel, extractOldNew, resolveUser, type UserGranularity,
} from '@/engine/userStats'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler)

type Tab = 'supervision' | 'users' | 'journal'

function downloadCSV(filename: string, rows: string[][]) {
  const csv = '\uFEFF' + rows.map(r => r.map(c => {
    const s = String(c ?? '')
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }).join(';')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface SeriesChartProps {
  data: { label: string; revenue: number; grossProfit: number; count: number }[]
  title?: string
}

function SeriesChart({ data, title }: SeriesChartProps) {
  const chartData = {
    labels: data.map(d => d.label),
    datasets: [
      { label: 'CA', data: data.map(d => d.revenue), borderColor: 'var(--accent)', backgroundColor: 'rgba(var(--accent-rgb),0.12)', fill: true, tension: 0.4, pointRadius: 3 },
      { label: 'Marge brute', data: data.map(d => d.grossProfit), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.4, pointRadius: 3 },
    ],
  }
  return (
    <div className="mt-4 h-60 sm:h-72">
      <Line data={chartData} options={{
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12, font: { size: 11 } } }, title: title ? { display: true, text: title, font: { size: 13 } } : undefined },
        scales: { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' }, beginAtZero: true } },
      }} />
    </div>
  )
}

export default function UsersPage() {
  const businessId = useBusinessId()
  const { user: currentUser } = usePermission()
  const users = useLiveQuery(() => db.users.where('businessId').equals(businessId).toArray(), [businessId])
  const auditLogs = useLiveQuery(() => db.auditLogs.where('businessId').equals(businessId).reverse().sortBy('createdAt'), [businessId])
  const allSales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).toArray(), [businessId])
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', loginId: '', role: '',
    status: 'active' as UserStatus, password: '',
  })
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [resetPwdModal, setResetPwdModal] = useState(false)
  const [resetTargetId, setResetTargetId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [tab, setTab] = useState<Tab>('supervision')
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false)
  const [sessionsTarget, setSessionsTarget] = useState<User | null>(null)
  const [sessions, setSessions] = useState<AuthSession[]>([])

  const [superPeriod, setSuperPeriod] = useState<PeriodKey>('month')
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().split('T')[0])
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0])
  const [userFilter, setUserFilter] = useState<string[]>([])
  const [granularity, setGranularity] = useState<UserGranularity>('day')

  const [journalPeriod, setJournalPeriod] = useState<PeriodKey>('month')
  const [journalUser, setJournalUser] = useState('')
  const [journalAction, setJournalAction] = useState('')
  const [journalEntity, setJournalEntity] = useState('')
  const [journalSearch, setJournalSearch] = useState('')
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)
  const [profileUser, setProfileUser] = useState<User | null>(null)

  const isPrimaryAdmin = currentUser?.isPrimaryAdmin ?? false
  const hasStarPermission = currentUser?.permissions?.includes('*') ?? false

  useEffect(() => {
    if (hasStarPermission && !isPrimaryAdmin && users && businessId && currentUser) {
      const hasAnyPrimary = users.some(u => u.isPrimaryAdmin)
      if (!hasAnyPrimary) {
        db.users.update(currentUser.id, { isPrimaryAdmin: true })
        useAppStore.getState().setUser({ ...currentUser, isPrimaryAdmin: true })
        toast('Vous avez été promu Administrateur principal', 'success')
        if (isSupabaseConfigured()) {
          try {
            import('@/lib/supabase').then(({ supabase }) => {
              supabase.from('profiles').update({ is_primary_admin: true })
                .eq('auth_user_id', currentUser.id)
                .catch(() => {})
            }).catch(() => {})
          } catch {
            // best effort
          }
        }
      }
    }
  }, [hasStarPermission, isPrimaryAdmin, users, businessId, currentUser])

  useEffect(() => {
    if (isSupabaseConfigured()) {
      import('@/lib/syncEngine').then(m => m.syncAll().catch(() => {})).catch(() => {})
    }
  }, [businessId])

  const filtered = users?.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.loginId.toLowerCase().includes(search.toLowerCase())
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  const superBounds = useMemo(() => {
    if (superPeriod === 'custom') return getPeriodBounds('custom', new Date(), { start: customStart, end: customEnd })
    return getPeriodBounds(superPeriod)
  }, [superPeriod, customStart, customEnd])

  const journalBounds = useMemo(() => {
    if (journalPeriod === 'custom') return getPeriodBounds('custom', new Date(), { start: customStart, end: customEnd })
    return getPeriodBounds(journalPeriod)
  }, [journalPeriod, customStart, customEnd])

  const superSales = useMemo(() => {
    const scoped = filterSalesByUsers(allSales, userFilter.length > 0 ? userFilter : null)
    return periodSalesOf(scoped, superBounds.start, superBounds.end)
  }, [allSales, userFilter, superBounds])

  const userStats = useMemo(() => computeUserStats(superSales, products || [], users || []), [superSales, products, users])

  const superKpi = useMemo(() => {
    const salesCount = userStats.reduce((s, r) => s + r.salesCount, 0)
    const revenue = userStats.reduce((s, r) => s + r.revenue, 0)
    const grossProfit = userStats.reduce((s, r) => s + r.grossProfit, 0)
    return {
      salesCount,
      revenue,
      grossProfit,
      avgBasket: salesCount > 0 ? revenue / salesCount : 0,
      activeSellers: userStats.filter(s => s.salesCount > 0).length,
    }
  }, [userStats])

  const superSeries = useMemo(() => buildUserSeries(superSales, products || [], superBounds, granularity), [superSales, products, superBounds, granularity])

  const actionOptions = useMemo(() => {
    const s = new Set((auditLogs || []).map(l => l.action))
    return [...s].sort()
  }, [auditLogs])

  const entityOptions = useMemo(() => {
    const s = new Set((auditLogs || []).map(l => l.entity))
    return [...s].sort()
  }, [auditLogs])

  const journalUserIds = useMemo(() => (journalUser ? [journalUser] : null), [journalUser])
  const journalFiltered = useMemo(() =>
    filterAuditLogs(auditLogs, {
      userIds: journalUserIds,
      actions: journalAction ? [journalAction] : null,
      entities: journalEntity ? [journalEntity] : null,
      search: journalSearch,
      start: journalBounds.start,
      end: journalBounds.end,
    }),
    [auditLogs, journalUserIds, journalAction, journalEntity, journalSearch, journalBounds]
  )

  const { paginatedItems: journalPage, ...journalPag } = usePagination(journalFiltered, 20)

  const periodLabel = PERIOD_OPTIONS.find(o => o.value === superPeriod)?.label || superPeriod

  function openCreate() {
    setEditing(null)
    setForm({ name: '', email: '', phone: '', loginId: '', role: '', status: 'active', password: '' })
    setSelectedPerms([])
    setModalOpen(true)
  }

  function openEdit(user: User) {
    setEditing(user)
    setForm({
      name: user.name, email: user.email, phone: user.phone || '',
      loginId: user.loginId, role: user.role,
      status: effectiveStatus(user), password: '',
    })
    setSelectedPerms(getSimplifiedFromPermissions(user.permissions))
    setModalOpen(true)
  }

  function applyPreset(preset: RolePreset) {
    setSelectedPerms([...preset.permissionIds])
    setForm(f => ({ ...f, role: preset.label }))
  }

  function togglePerm(id: string) {
    setSelectedPerms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  function selectAll() {
    setSelectedPerms(SIMPLIFIED_PERMISSIONS.map(p => p.id))
  }

  function deselectAll() {
    setSelectedPerms([])
  }

  function getPermissionLabel(ids: string[]): string {
    if (!ids || ids.length === 0) return 'Aucune'
    const count = ids.length
    const total = SIMPLIFIED_PERMISSIONS.length
    if (count >= total) return 'Toutes les permissions'
    return `${count} permission(s)`
  }

  function toggleUserFilter(id: string) {
    setUserFilter(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  function exportStatsCSV() {
    const rows: string[][] = [
      ['Utilisateur', 'Ventes', 'CA (FCFA)', 'Marge brute (FCFA)', 'Panier moyen (FCFA)', 'Dernière activité'],
      ...userStats.map(s => [s.userName || s.userId, String(s.salesCount), String(s.revenue), String(s.grossProfit), String(Math.round(s.avgBasket)), s.lastActivity ? formatDateTime(s.lastActivity) : '']),
    ]
    downloadCSV(`performances_vendeurs_${periodLabel.replace(/\s+/g, '_')}.csv`, rows)
  }

  function exportJournalCSV() {
    const rows: string[][] = [
      ['Date', 'Action', 'Entité', 'Référence', 'Utilisateur', 'Détails'],
      ...journalFiltered.map(l => [formatDateTime(l.createdAt), l.action, entityLabel(l.entity), l.entityId, l.userName || l.userId, l.details || '']),
    ]
    downloadCSV(`journal_activite_${Date.now()}.csv`, rows)
  }

  async function handleSave() {
    try {
      const permArray = selectedPerms.length > 0
        ? getPermissionsFromSimplified(selectedPerms)
        : []
      if (!form.name.trim()) throw new Error('Le nom complet est requis')
      if (!form.loginId.trim()) throw new Error("L'identifiant de connexion est requis")
      const email = form.email.trim() || form.loginId.trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new Error("Adresse email invalide — saisissez un email ou un identifiant au format email (ex: user@shop)")
      }
      const loginId = form.loginId.trim()
      const isActive = form.status === 'active'
      const syncProfile = async (authUserId: string) => {
        if (isSupabaseConfigured()) {
          try {
            const { supabase } = await import('@/lib/supabase')
            await supabase.from('profiles').update({
              name: form.name,
              email,
              phone: form.phone || null,
              role: form.role || 'staff',
              permissions: permArray,
              login_id: loginId,
              is_active: isActive,
              updatedAt: new Date().toISOString(),
            }).eq('auth_user_id', authUserId)
          } catch {
            // best effort
          }
        }
      }
      if (editing) {
        const updateData: any = {
          name: form.name, email, phone: form.phone || '',
          loginId, role: form.role || 'personnel',
          status: form.status, isActive,
          permissions: permArray,
        }
        if (form.password) {
          const { hashPassword } = await import('@/lib/auth')
          updateData.passwordHash = await hashPassword(form.password)
        }
        await db.users.update(editing.id, updateData)
        await syncProfile(editing.id)
        if (form.status !== 'active') {
          broadcastUserBlock(editing.id)
          toast(`Utilisateur ${form.status === 'blocked' ? 'bloqué' : form.status === 'suspended' ? 'suspendu' : 'supprimé'} — déconnecté`, 'warning')
        }
        await db.auditLogs.add({
          id: generateId(), businessId, userId: currentUser?.id || '',
          action: 'user_updated', entity: 'user', entityId: editing.id,
          details: JSON.stringify({ name: form.name, role: form.role, status: form.status, permissions: permArray }),
          createdAt: new Date().toISOString(),
        })
        toast('Utilisateur mis à jour', 'success')
      } else {
        const { hashPassword } = await import('@/lib/auth')
        const pwd = form.password || 'default123'
        const hash = await hashPassword(pwd)

        if (isSupabaseConfigured()) {
          const { supabase } = await import('@/lib/supabase')
          const { data: authUserId, error } = await supabase.rpc('admin_create_user', {
            businessId,
            name: form.name,
            email,
            loginId,
            password: pwd,
            role: (form.role as any) || 'staff',
            permissions: permArray,
            status: form.status,
            phone: form.phone || '',
          })
          if (error) throw new Error(error.message)
          const userId = authUserId || generateId()
          await db.users.add({
            id: userId, businessId,
            name: form.name, email, phone: form.phone || '',
            loginId,
            passwordHash: hash, role: (form.role as any) || 'staff',
            permissions: permArray, isActive, isPrimaryAdmin: false,
            status: form.status,
            createdAt: new Date().toISOString(),
          })
          await db.auditLogs.add({
            id: generateId(), businessId, userId: currentUser?.id || '',
            action: 'user_created', entity: 'user', entityId: userId,
            details: JSON.stringify({ name: form.name, loginId, role: form.role, authUserId }),
            createdAt: new Date().toISOString(),
          })
          toast('Utilisateur créé', 'success')
        } else {
          await db.users.add({
            id: generateId(), businessId,
            name: form.name, email, phone: form.phone || '',
            loginId,
            passwordHash: hash, role: (form.role as any) || 'staff',
            permissions: permArray, isActive, isPrimaryAdmin: false,
            status: form.status,
            createdAt: new Date().toISOString(),
          })
          await db.auditLogs.add({
            id: generateId(), businessId, userId: currentUser?.id || '',
            action: 'user_created', entity: 'user', entityId: '',
            details: JSON.stringify({ name: form.name, loginId, role: form.role }),
            createdAt: new Date().toISOString(),
          })
          toast('Utilisateur créé', 'success')
        }
      }
      setModalOpen(false)
    } catch (e: any) {
      toast(e?.message || "Erreur lors de l'enregistrement", 'error')
    }
  }

  async function handleDelete(id: string) {
    const target = users?.find(u => u.id === id)
    if (target?.isPrimaryAdmin) {
      toast("L'administrateur principal ne peut pas être supprimé", 'error')
      return
    }
    const confirmed = window.confirm(`Supprimer l'utilisateur ${target?.name} ?`)
    if (confirmed) {
      const target2 = users?.find(u => u.id === id)
      if (target2) await softDelete('users', id, target2 as any, target2.name)
      await db.users.delete(id)
      if (isSupabaseConfigured()) {
        try {
          const { supabase } = await import('@/lib/supabase')
          const { error } = await supabase.rpc('admin_delete_user', { p_auth_user_id: id })
          if (error) throw error
        } catch {
          try {
            const { supabase } = await import('@/lib/supabase')
            await supabase.from('profiles').delete().eq('id', id)
          } catch {
            // best effort
          }
        }
      }
      await db.auditLogs.add({
        id: generateId(), businessId, userId: currentUser?.id || '',
        action: 'user_deleted', entity: 'user', entityId: id,
        details: '',
        createdAt: new Date().toISOString(),
      })
      toast('Utilisateur supprimé', 'success')
    }
  }

  async function toggleActive(user: User) {
    if (user.isPrimaryAdmin) {
      toast("L'administrateur principal ne peut pas être désactivé", 'error')
      return
    }
    const wasActive = effectiveStatus(user) === 'active'
    const newStatus: UserStatus = wasActive ? 'blocked' : 'active'
    await db.users.update(user.id, { status: newStatus, isActive: newStatus === 'active' })
    if (!wasActive) broadcastUserBlock(user.id)
    if (isSupabaseConfigured()) {
      try {
        const { supabase } = await import('@/lib/supabase')
        await supabase.from('profiles').update({ status: newStatus, is_active: newStatus === 'active' }).eq('auth_user_id', user.id)
      } catch {
        // best effort
      }
    }
    await db.auditLogs.add({
      id: generateId(), businessId, userId: currentUser?.id || '',
      action: wasActive ? 'user_disabled' : 'user_enabled', entity: 'user', entityId: user.id,
      details: JSON.stringify({ name: user.name, status: newStatus }),
      createdAt: new Date().toISOString(),
    })
    toast(wasActive ? 'Utilisateur bloqué' : 'Utilisateur activé', 'success')
  }

  async function openSessions(user: User) {
    setSessionsTarget(user)
    setSessions(await listUserSessions(user.id))
    setSessionsModalOpen(true)
  }

  async function refreshSessions() {
    if (!sessionsTarget) return
    setSessions(await listUserSessions(sessionsTarget.id))
  }

  async function handleRevokeSession(sessionId: string) {
    await revokeSession(sessionId)
    await refreshSessions()
    toast('Session révoquée', 'success')
  }

  async function handleRevokeAll() {
    if (!sessionsTarget) return
    await revokeAllSessions(sessionsTarget.id)
    await refreshSessions()
    toast('Toutes les sessions ont été révoquées', 'success')
  }

  async function handleResetPassword() {
    if (!resetTargetId || !newPassword) return
    const { hashPassword } = await import('@/lib/auth')
    const hash = await hashPassword(newPassword)
    await db.users.update(resetTargetId, { passwordHash: hash })
    if (isSupabaseConfigured()) {
      const target = users?.find(u => u.id === resetTargetId)
      if (target?.email) {
        try {
          const { supabase } = await import('@/lib/supabase')
          const { error } = await supabase.rpc('admin_reset_password', {
            p_email: target.email,
            p_password: newPassword,
          })
          if (error) throw error
        } catch {
          toast("Mot de passe local réinitialisé, mais échec de la mise à jour du compte cloud", 'warning')
        }
      }
    }
    await db.auditLogs.add({
      id: generateId(), businessId, userId: currentUser?.id || '',
      action: 'password_reset', entity: 'user', entityId: resetTargetId,
      details: '',
      createdAt: new Date().toISOString(),
    })
    toast('Mot de passe réinitialisé', 'success')
    setResetPwdModal(false)
    setResetTargetId(null)
    setNewPassword('')
  }

  if (!isPrimaryAdmin && !hasStarPermission) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-surface-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-surface-400">Accès réservé</h2>
          <p className="text-surface-400 mt-2">Seul l'Administrateur principal peut gérer les utilisateurs.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Utilisateurs & activité</h1>
          <p className="text-surface-500 text-sm mt-1">{users?.length || 0} utilisateur(s) · supervision des vendeurs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setTab('journal'); setJournalPeriod(superPeriod) }}>
            <History className="w-4 h-4" /> Journal
          </Button>
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouvel utilisateur</Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          <button onClick={() => setTab('supervision')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'supervision' ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Supervision</button>
          <button onClick={() => setTab('users')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'users' ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Utilisateurs</button>
          <button onClick={() => setTab('journal')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'journal' ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Journal</button>
        </div>
        {tab === 'users' && (
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input type="text" placeholder="Rechercher un utilisateur..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
        )}
        {tab !== 'users' && (
          <div className="flex items-center gap-1.5 bg-surface-100 rounded-xl px-2 py-1.5">
            <CalendarDays className="w-4 h-4 text-surface-400 shrink-0" />
            <div className="flex gap-1 overflow-x-auto scrollbar-none">
              {PERIOD_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => (tab === 'journal' ? setJournalPeriod(o.value) : setSuperPeriod(o.value))}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${(tab === 'journal' ? journalPeriod : superPeriod) === o.value ? 'bg-primary-500 text-on-accent shadow-sm' : 'text-surface-600 hover:text-surface-900'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab !== 'users' && (tab === 'journal' ? journalPeriod : superPeriod) === 'custom' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-surface-100 border border-surface-200 rounded-xl p-3">
          <label className="text-xs font-medium text-surface-500 flex items-center gap-1">
            Du <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border border-surface-300 bg-surface-100 text-sm" />
          </label>
          <label className="text-xs font-medium text-surface-500 flex items-center gap-1">
            au <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="ml-1 px-2 py-1.5 rounded-lg border border-surface-300 bg-surface-100 text-sm" />
          </label>
        </div>
      )}

      {tab === 'supervision' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-on-accent shadow-lg shadow-primary-200">
              <p className="text-xs font-medium text-on-accent/80 flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" /> Ventes ({periodLabel.toLowerCase()})</p>
              <p className="text-xl sm:text-2xl font-extrabold mt-1 tracking-tight">{superKpi.salesCount}</p>
              <p className="text-[10px] text-on-accent/70 mt-1">{superKpi.activeSellers} vendeur(s) actif(s)</p>
            </div>
            <div className="p-4 rounded-2xl bg-success/10 border border-success/20">
              <p className="text-xs text-surface-400 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-success" /> Chiffre d'affaires</p>
              <p className="text-xl sm:text-2xl font-extrabold mt-1 text-success">{formatCurrency(superKpi.revenue)}</p>
              <p className="text-[10px] text-surface-400 mt-1">Ventes réelles de la période</p>
            </div>
            <div className="p-4 rounded-2xl bg-info/10 border border-info/20">
              <p className="text-xs text-surface-400 flex items-center gap-1"><Wallet className="w-3.5 h-3.5 text-info" /> Marge brute</p>
              <p className="text-xl sm:text-2xl font-extrabold mt-1 text-info">{formatCurrency(superKpi.grossProfit)}</p>
              <p className="text-[10px] text-surface-400 mt-1">CA − coût des marchandises</p>
            </div>
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-surface-400 flex items-center gap-1"><Activity className="w-3.5 h-3.5 text-warning" /> Panier moyen</p>
              <p className="text-xl sm:text-2xl font-extrabold mt-1 text-warning">{formatCurrency(superKpi.avgBasket)}</p>
              <p className="text-[10px] text-surface-400 mt-1">{superKpi.salesCount} vente(s)</p>
            </div>
          </div>

          <Card>
            <CardTitle>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2"><UserRound className="w-5 h-5 text-primary-500" />Performances vendeurs</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1.5 max-w-md">
                    {(users || []).length > 1 && (
                      <button
                        onClick={() => setUserFilter([])}
                        className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${userFilter.length === 0 ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
                      >
                        Tous
                      </button>
                    )}
                    {(users || []).map(u => {
                      const effId = u.authUserId || u.id
                      return (
                        <button
                          key={u.id}
                          onClick={() => toggleUserFilter(effId)}
                          className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${userFilter.includes(effId) ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
                        >
                          {u.name.split(' ')[0]}
                        </button>
                      )
                    })}
                  </div>
                  <Button variant="outline" size="sm" onClick={exportStatsCSV}><Download className="w-4 h-4" /> CSV</Button>
                </div>
              </div>
            </CardTitle>
            <div className="mt-4 overflow-x-auto responsive-table">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-3">Vendeur</th>
                    <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-3">Ventes</th>
                    <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-3">CA</th>
                    <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-3">Marge brute</th>
                    <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-3">Panier moyen</th>
                    <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-3">Statut</th>
                    <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-3">Profil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {userStats.map(s => {
                    const u = resolveUser(users, s.userId)
                    return (
                      <tr key={s.userId} className="hover:bg-surface-50 transition-colors">
                        <td data-label="Vendeur" className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-primary-50 flex items-center justify-center text-primary-400 font-bold text-sm">
                              {(s.userName || u?.name || s.userId).charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-surface-900">{s.userName || u?.name || 'Utilisateur inconnu'}</p>
                              <p className="text-xs text-surface-400">{u?.loginId || s.userId.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td data-label="Ventes" className="px-6 py-3 text-center text-sm font-semibold text-surface-900">{s.salesCount}</td>
                        <td data-label="CA" className="px-6 py-3 text-center text-sm font-semibold text-surface-900">{formatCurrency(s.revenue)}</td>
                        <td data-label="Marge brute" className={`px-6 py-3 text-center text-sm font-semibold ${s.grossProfit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(s.grossProfit)}</td>
                        <td data-label="Panier moyen" className="px-6 py-3 text-center text-sm text-surface-600">{formatCurrency(s.avgBasket)}</td>
                        <td data-label="Statut" className="px-6 py-3">
                          <div className="flex justify-center">
                            {u ? (
                              <Badge variant={effectiveStatus(u) === 'active' ? 'success' : effectiveStatus(u) === 'suspended' ? 'warning' : 'danger'}>
                                {USER_STATUSES.find(x => x.value === effectiveStatus(u))?.label || 'Actif'}
                              </Badge>
                            ) : (
                              <Badge variant="default">Ancien</Badge>
                            )}
                          </div>
                        </td>
                        <td data-label="Profil" className="px-6 py-3 text-center">
                          <button
                            onClick={() => setProfileUser(u || { id: s.userId, businessId, name: s.userName || 'Utilisateur inconnu', email: '', loginId: s.userId } as any)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-100 text-primary-600 hover:bg-primary-50 transition-colors"
                          >
                            Voir <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {userStats.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-surface-400 text-sm">
                        <Users className="w-12 h-12 mx-auto mb-3" />
                        Aucun utilisateur
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardTitle>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary-500" />CA & marge par période</div>
                <div className="flex gap-1 bg-surface-100 rounded-xl p-1">
                  {(['day', 'month', 'semester'] as UserGranularity[]).map(g => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${granularity === g ? 'bg-surface-100 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}
                    >
                      {g === 'day' ? 'Journalière' : g === 'month' ? 'Mensuelle' : 'Semestrielle'}
                    </button>
                  ))}
                </div>
              </div>
            </CardTitle>
            <SeriesChart data={superSeries} title={userFilter.length > 0 ? `Période ${periodLabel.toLowerCase()} — vendeurs sélectionnés` : `Période ${periodLabel.toLowerCase()} — tous vendeurs`} />
            {superSeries.length < 2 && <p className="text-sm text-surface-400 text-center py-3 -mt-2">Données regroupées sur {superSeries.length} période(s)</p>}
          </Card>
        </>
      )}

      {tab === 'users' && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto responsive-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Utilisateur</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Identifiant</th>
                  <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Rôle</th>
                  <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Permissions</th>
                  <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Statut</th>
                  <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Admin</th>
                  <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {paginatedItems?.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-50 transition-colors">
                    <td data-label="Utilisateur" className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-400 font-bold text-sm">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-surface-900">{u.name}</p>
                          <p className="text-xs text-surface-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td data-label="Identifiant" className="px-6 py-4 text-sm text-surface-600 font-mono">{u.loginId}</td>
                    <td data-label="Rôle" className="px-6 py-4">
                      <div className="flex justify-center">
                        <Badge variant={u.isPrimaryAdmin ? 'danger' : 'info'}>
                          <Shield className="w-3 h-3 mr-1" />
                          {u.isPrimaryAdmin ? 'Administrateur principal' : (u.role || 'Personnel')}
                        </Badge>
                      </div>
                    </td>
                    <td data-label="Permissions" className="px-6 py-4 text-center text-sm text-surface-500">
                      {getPermissionLabel(
                        u.permissions?.includes('*')
                          ? SIMPLIFIED_PERMISSIONS.map(p => p.id)
                          : getSimplifiedFromPermissions(u.permissions)
                      )}
                    </td>
                    <td data-label="Statut" className="px-6 py-4">
                      <div className="flex justify-center">
                        <Badge variant={
                          effectiveStatus(u) === 'active' ? 'success'
                          : effectiveStatus(u) === 'suspended' ? 'warning'
                          : 'danger'
                        }>
                          {USER_STATUSES.find(s => s.value === effectiveStatus(u))?.label || 'Actif'}
                        </Badge>
                      </div>
                    </td>
                    <td data-label="Admin" className="px-6 py-4 text-center">
                      {u.isPrimaryAdmin ? (
                        <Check className="w-5 h-5 inline text-success" />
                      ) : (
                        <X className="w-5 h-5 inline text-surface-500" />
                      )}
                    </td>
                    <td data-label="Actions" className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        {!u.isPrimaryAdmin && (
                          <>
                            <button onClick={() => toggleActive(u)}
                              className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors"
                              title={effectiveStatus(u) === 'active' ? 'Bloquer' : 'Activer'}>
                              {effectiveStatus(u) === 'active' ? <ToggleRight className="w-4 h-4 text-success" /> : <Ban className="w-4 h-4 text-danger" />}
                            </button>
                            <button onClick={() => openSessions(u)}
                              className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors" title="Sessions actives">
                              <MonitorSmartphone className="w-4 h-4" />
                            </button>
                            <button onClick={() => { setResetTargetId(u.id); setNewPassword(''); setResetPwdModal(true) }}
                              className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors" title="Réinitialiser mot de passe">
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button onClick={() => openEdit(u)} className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors" title="Modifier">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(u.id)} className="p-2 rounded-lg hover:bg-red-500/15 text-surface-400 hover:text-danger transition-colors" title="Supprimer">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!filtered || filtered.length === 0) && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-surface-400 text-sm">
                      <Users className="w-12 h-12 mx-auto mb-3" />
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
        </Card>
      )}

      {tab === 'journal' && (
        <Card className="overflow-hidden p-0">
          <div className="p-4 sm:p-5 border-b border-surface-200 flex flex-col lg:flex-row lg:items-center gap-3 flex-wrap">
            <div className="relative w-full lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input type="text" placeholder="Rechercher dans le journal..." value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-surface-400 flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Filtres</span>
              <Select value={journalUser} onChange={(e) => setJournalUser(e.target.value)} options={[
                { value: '', label: 'Tous les utilisateurs' },
                ...(users || []).map(u => ({ value: u.authUserId || u.id, label: u.name })),
              ]} />
              <Select value={journalAction} onChange={(e) => setJournalAction(e.target.value)} options={[
                { value: '', label: 'Toutes les actions' },
                ...actionOptions.map(a => ({ value: a, label: a })),
              ]} />
              <Select value={journalEntity} onChange={(e) => setJournalEntity(e.target.value)} options={[
                { value: '', label: 'Tous les modules' },
                ...entityOptions.map(e => ({ value: e, label: entityLabel(e) })),
              ]} />
              <Button variant="outline" size="sm" onClick={() => { setJournalUser(''); setJournalAction(''); setJournalEntity(''); setJournalSearch('') }}>Réinitialiser</Button>
              <Button variant="outline" size="sm" onClick={exportJournalCSV}><Download className="w-4 h-4" /> CSV</Button>
            </div>
          </div>
          <div className="overflow-x-auto responsive-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Date</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Action</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Entité</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Utilisateur</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Détails</th>
                  <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Détail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {journalPage?.map((log) => {
                  const meta = auditMeta(log.action)
                  return (
                    <tr key={log.id} className="hover:bg-surface-50 transition-colors">
                      <td data-label="Date" className="px-6 py-4 text-sm text-surface-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td data-label="Action" className="px-6 py-4">
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </td>
                      <td data-label="Entité" className="px-6 py-4 text-sm text-surface-600">{entityLabel(log.entity)}</td>
                      <td data-label="Utilisateur" className="px-6 py-4 text-sm text-surface-600">{log.userName || resolveUser(users, log.userId)?.name || '—'}</td>
                      <td data-label="Détails" className="px-6 py-4 text-sm text-surface-500 max-w-xs truncate">{log.details}</td>
                      <td data-label="Détail" className="px-6 py-4 text-right">
                        <button onClick={() => setDetailLog(log)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface-100 text-primary-600 hover:bg-primary-50 transition-colors">
                          Voir
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {(!journalFiltered || journalFiltered.length === 0) && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-surface-400 text-sm">
                      <History className="w-12 h-12 mx-auto mb-3" />
                      Aucune activité sur cette période
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={journalPag.page} totalPages={journalPag.totalPages} totalItems={journalPag.totalItems} onPageChange={journalPag.setPage} />
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Modifier l'utilisateur" : 'Nouvel utilisateur'} size="lg">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input label="Nom complet" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="Identifiant de connexion" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} placeholder="ex: user@shop" required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Fonction / Rôle" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="ex: Vendeur, Caissier, ..." />
            <Input label="Mot de passe" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editing ? 'Laisser vide pour conserver' : 'Défaut: default123'} />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Statut du compte</label>
              <div className="flex flex-wrap gap-2">
                {USER_STATUSES.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm({ ...form, status: s.value })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      form.status === s.value
                        ? 'bg-primary-500 text-on-accent'
                        : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-surface-900">Permissions</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAll}>Tout sélectionner</Button>
                <Button size="sm" variant="outline" onClick={deselectAll}>Tout désélectionner</Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs text-surface-500 font-medium mr-1 self-center">Préréglages :</span>
              {ROLE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-100 text-surface-600 hover:bg-primary-50 hover:text-primary-300 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {SIMPLIFIED_PERMISSIONS.map(sp => (
                <label
                  key={sp.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedPerms.includes(sp.id)
                      ? 'border-primary-300 bg-primary-50'
                      : 'border-surface-200 hover:border-surface-300 bg-surface-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(sp.id)}
                    onChange={() => togglePerm(sp.id)}
                    className="w-4 h-4 rounded border-surface-300 text-primary-400 focus:ring-primary-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-surface-800">{sp.label}</p>
                    {sp.description && (
                      <p className="text-xs text-surface-400">{sp.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={!form.name || !form.loginId}>
            {editing ? 'Mettre à jour' : "Créer l'utilisateur"}
          </Button>
        </div>
      </Modal>

      <Modal open={resetPwdModal} onClose={() => { setResetPwdModal(false); setResetTargetId(null); setNewPassword('') }}
        title="Réinitialiser le mot de passe" size="sm">
        <div className="p-6 space-y-4">
          <Input label="Nouveau mot de passe" type="password" value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 6 caractères" />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => { setResetPwdModal(false); setResetTargetId(null); setNewPassword('') }}>Annuler</Button>
          <Button disabled={newPassword.length < 4} onClick={handleResetPassword}>Réinitialiser</Button>
        </div>
      </Modal>

      <Modal open={!!detailLog} onClose={() => setDetailLog(null)} title="Détail de l'action" size="lg">
        {detailLog && (
          <div className="p-6">
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Badge variant={auditMeta(detailLog.action).variant}>{auditMeta(detailLog.action).label}</Badge>
              <Badge variant="default">{entityLabel(detailLog.entity)}</Badge>
              {detailLog.entityId && <span className="text-xs text-surface-400 font-mono">{detailLog.entityId}</span>}
              <span className="text-xs text-surface-400 ml-auto">{formatDateTime(detailLog.createdAt)}</span>
            </div>
            <p className="text-sm text-surface-500 mb-4 whitespace-pre-wrap break-words">{detailLog.details}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(() => {
                const diff = extractOldNew(detailLog)
                return (
                  <>
                    <div className="p-3 rounded-xl bg-surface-50 border border-surface-200">
                      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Ancienne valeur</p>
                      {diff.old ? (
                        <div className="space-y-1">
                          {Object.entries(diff.old).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2 text-sm">
                              <span className="text-surface-400 whitespace-nowrap">{k}</span>
                              <span className="text-surface-700 text-right font-medium break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-surface-400">Non disponible</p>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-surface-50 border border-surface-200">
                      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Nouvelle valeur</p>
                      {diff.new ? (
                        <div className="space-y-1">
                          {Object.entries(diff.new).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2 text-sm">
                              <span className="text-surface-400 whitespace-nowrap">{k}</span>
                              <span className="text-surface-700 text-right font-medium break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-surface-400">Non disponible</p>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </Modal>

      {profileUser && (
        <ProfileModal
          user={profileUser}
          allUsers={users || []}
          periods={superPeriod}
          customStart={customStart}
          customEnd={customEnd}
          sales={allSales || []}
          products={products || []}
          auditLogs={auditLogs || []}
          onClose={() => setProfileUser(null)}
        />
      )}

      <Modal open={sessionsModalOpen} onClose={() => setSessionsModalOpen(false)} title={`Sessions actives — ${sessionsTarget?.name || ''}`} size="lg">
        <div className="p-6">
          {sessions.length === 0 ? (
            <div className="text-center py-10 text-surface-400 text-sm">
              <MonitorSmartphone className="w-12 h-12 mx-auto mb-3" />
              Aucune session active
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-surface-50 rounded-xl">
                  <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4 text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-900">{s.device || 'Appareil'}</span>
                      <Badge variant="success">En ligne</Badge>
                    </div>
                    <p className="text-xs text-surface-400 mt-0.5">
                      Dernière activité : {formatDateTime(s.lastSeenAt)}
                    </p>
                  </div>
                  <button onClick={() => handleRevokeSession(s.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 text-danger hover:bg-red-500/25 transition-colors">
                    Révoquer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        {sessions.length > 0 && (
          <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
            <Button variant="outline" onClick={() => { setSessionsModalOpen(false); }}>Fermer</Button>
            <Button onClick={handleRevokeAll}>Tout révoquer</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

interface ProfileModalProps {
  user: User
  allUsers: User[]
  periods: PeriodKey
  customStart: string
  customEnd: string
  sales: Sale[]
  products: import('@/types').Product[]
  auditLogs: AuditLog[]
  onClose: () => void
}

function ProfileModal({ user, allUsers, periods, customStart, customEnd, sales, products, auditLogs, onClose }: ProfileModalProps) {
  const [granularity, setGranularity] = useState<UserGranularity>('day')
  const [journalSearch, setJournalSearch] = useState('')
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null)

  const bounds = useMemo(() => {
    if (periods === 'custom') return getPeriodBounds('custom', new Date(), { start: customStart, end: customEnd })
    return getPeriodBounds(periods)
  }, [periods, customStart, customEnd])

  const userRefIds = useMemo(() => {
    const ids = [user.id]
    if (user.authUserId) ids.push(user.authUserId)
    return ids
  }, [user.id, user.authUserId])

  const ownSales = useMemo(() => {
    const scoped = filterSalesByUsers(sales, userRefIds)
    return periodSalesOf(scoped, bounds.start, bounds.end)
  }, [sales, userRefIds, bounds])

  const stat = useMemo(() => {
    const rows = computeUserStats(sales || [], products || [], allUsers || [])
    return rows.find(r => r.userId === user.id) || rows.find(r => r.userId === user.authUserId) || { userId: user.id, userName: user.name, salesCount: 0, revenue: 0, cogs: 0, grossProfit: 0, avgBasket: 0, lastActivity: '' }
  }, [sales, products, allUsers, user.id, user.authUserId, user.name])

  const series = useMemo(() => {
    const scoped = filterSalesByUsers(sales, userRefIds)
    return buildUserSeries(scoped, products || [], bounds, granularity)
  }, [sales, products, userRefIds, bounds, granularity])

  const logs = useMemo(() =>
    filterAuditLogs(auditLogs, { userIds: userRefIds, search: journalSearch }),
    [auditLogs, userRefIds, journalSearch]
  )
  const { paginatedItems: logPage, ...logPag } = usePagination(logs, 10)

  const effective = effectiveStatus(user)

  return (
    <Modal open onClose={onClose} title={`Profil — ${user.name}`} size="lg" className="!max-w-3xl">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-500 flex items-center justify-center text-on-accent font-bold text-xl">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-surface-900">{user.name}</h3>
              <Badge variant={effective === 'active' ? 'success' : effective === 'suspended' ? 'warning' : 'danger'}>
                {USER_STATUSES.find(s => s.value === effective)?.label || 'Actif'}
              </Badge>
            </div>
            <p className="text-sm text-surface-500 mt-0.5">{user.role || 'Personnel'} · {user.email || user.loginId}</p>
            <p className="text-xs text-surface-400 mt-0.5">Créé le {formatDate(user.createdAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-surface-50 border border-surface-100">
            <p className="text-xs text-surface-400">Ventes (période)</p>
            <p className="text-lg font-bold text-surface-900">{ownSales.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-50 border border-surface-100">
            <p className="text-xs text-surface-400">CA (période)</p>
            <p className="text-lg font-bold text-success">{formatCurrency(ownSales.reduce((s, x) => s + (x.total || 0), 0))}</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-50 border border-surface-100">
            <p className="text-xs text-surface-400">Marge brute</p>
            <p className="text-lg font-bold text-info">{formatCurrency(stat.grossProfit)}</p>
          </div>
          <div className="p-3 rounded-xl bg-surface-50 border border-surface-100">
            <p className="text-xs text-surface-400">Panier moyen</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(stat.avgBasket)}</p>
          </div>
        </div>

        <Card className="!bg-transparent !shadow-none !border-0">
          <CardTitle>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary-500" />Évolution ({periods === 'custom' ? 'personnalisée' : PERIOD_OPTIONS.find(o => o.value === periods)?.label.toLowerCase()})</div>
              <div className="flex gap-1 bg-surface-100 rounded-xl p-1">
                {(['day', 'month', 'semester'] as UserGranularity[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${granularity === g ? 'bg-surface-100 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}
                  >
                    {g === 'day' ? 'Jour' : g === 'month' ? 'Mois' : 'Semestre'}
                  </button>
                ))}
              </div>
            </div>
          </CardTitle>
          <SeriesChart data={series} />
        </Card>

        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="text-sm font-semibold text-surface-900 flex items-center gap-1.5"><History className="w-4 h-4 text-primary-500" />Journal d'activité — {user.name}</h3>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input type="text" placeholder="Rechercher..." value={journalSearch}
                onChange={(e) => setJournalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
          <div className="space-y-2">
            {logPage.map(log => {
              const meta = auditMeta(log.action)
              return (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-surface-50 rounded-xl cursor-pointer hover:bg-surface-100 transition-colors" onClick={() => setDetailLog(log)}>
                  <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                    <History className="w-4 h-4 text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      <span className="text-xs text-surface-400">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="text-xs text-surface-500 mt-1 truncate">{entityLabel(log.entity)} — {log.details}</p>
                  </div>
                </div>
              )
            })}
            {logs.length === 0 && (
              <p className="text-sm text-surface-400 text-center py-6">Aucune activité pour ce vendeur</p>
            )}
          </div>
          <Pagination page={logPag.page} totalPages={logPag.totalPages} totalItems={logPag.totalItems} onPageChange={logPag.setPage} />
        </div>
      </div>

      <Modal open={!!detailLog} onClose={() => setDetailLog(null)} title="Détail de l'action" size="lg">
        {detailLog && (
          <div className="p-6">
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Badge variant={auditMeta(detailLog.action).variant}>{auditMeta(detailLog.action).label}</Badge>
              <Badge variant="default">{entityLabel(detailLog.entity)}</Badge>
              {detailLog.entityId && <span className="text-xs text-surface-400 font-mono">{detailLog.entityId}</span>}
              <span className="text-xs text-surface-400 ml-auto">{formatDateTime(detailLog.createdAt)}</span>
            </div>
            <p className="text-sm text-surface-500 mb-4 whitespace-pre-wrap break-words">{detailLog.details}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(() => {
                const diff = extractOldNew(detailLog)
                return (
                  <>
                    <div className="p-3 rounded-xl bg-surface-50 border border-surface-200">
                      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Ancienne valeur</p>
                      {diff.old ? (
                        <div className="space-y-1">
                          {Object.entries(diff.old).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2 text-sm">
                              <span className="text-surface-400 whitespace-nowrap">{k}</span>
                              <span className="text-surface-700 text-right font-medium break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-surface-400">Non disponible</p>
                      )}
                    </div>
                    <div className="p-3 rounded-xl bg-surface-50 border border-surface-200">
                      <p className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Nouvelle valeur</p>
                      {diff.new ? (
                        <div className="space-y-1">
                          {Object.entries(diff.new).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2 text-sm">
                              <span className="text-surface-400 whitespace-nowrap">{k}</span>
                              <span className="text-surface-700 text-right font-medium break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-surface-400">Non disponible</p>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </Modal>
    </Modal>
  )
}