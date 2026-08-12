import { useState, useEffect } from 'react'
import { Card, Button, Input, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePermission } from '@/hooks/usePermission'
import db from '@/db'
import { generateId, formatDate, formatDateTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { softDelete } from '@/lib/softDelete'
import { Search, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Users, Shield, KeyRound, History, Check, X, MonitorSmartphone, Ban, Smartphone } from 'lucide-react'
import type { User, UserStatus, AuthSession } from '@/types'
import { SIMPLIFIED_PERMISSIONS, ROLE_PRESETS, getPermissionsFromSimplified, getSimplifiedFromPermissions, type RolePreset } from '@/lib/permissions'
import { USER_STATUSES, effectiveStatus, listUserSessions, revokeSession, revokeAllSessions, broadcastUserBlock } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase'

export default function UsersPage() {
  const businessId = useBusinessId()
  const { isAdmin: isAdminUser, user: currentUser } = usePermission()
  const users = useLiveQuery(() => db.users.where('businessId').equals(businessId).toArray(), [businessId])
  const auditLogs = useLiveQuery(() => db.auditLogs.where('businessId').equals(businessId).reverse().sortBy('createdAt').then(r => r.slice(0, 100)), [businessId])

  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState({
    name: '', email: '', phone: '', loginId: '', role: '',
    status: 'active' as UserStatus, password: '',
  })
  const [selectedPerms, setSelectedPerms] = useState<string[]>([])
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [resetPwdModal, setResetPwdModal] = useState(false)
  const [resetTargetId, setResetTargetId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [auditModalOpen, setAuditModalOpen] = useState(false)
  const [tab, setTab] = useState<'users' | 'audit'>('users')
  const [sessionsModalOpen, setSessionsModalOpen] = useState(false)
  const [sessionsTarget, setSessionsTarget] = useState<User | null>(null)
  const [sessions, setSessions] = useState<AuthSession[]>([])

  const isPrimaryAdmin = currentUser?.isPrimaryAdmin ?? false
  const hasStarPermission = currentUser?.permissions?.includes('*') ?? false

  useEffect(() => {
    if (hasStarPermission && !isPrimaryAdmin && users && businessId) {
      const hasAnyPrimary = users.some(u => u.isPrimaryAdmin)
      if (!hasAnyPrimary) {
        db.users.update(currentUser!.id, { isPrimaryAdmin: true })
        toast('Vous avez été promu Administrateur principal', 'success')
      }
    }
  }, [hasStarPermission, isPrimaryAdmin, users, businessId])

  const filtered = users?.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.loginId.toLowerCase().includes(search.toLowerCase())
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

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

  async function handleSave() {
    try {
      const permArray = selectedPerms.length > 0
        ? getPermissionsFromSimplified(selectedPerms)
        : []
      const isActive = form.status === 'active'
      const syncProfile = async (authUserId: string) => {
        if (isSupabaseConfigured()) {
          try {
            const { supabase } = await import('@/lib/supabase')
            await supabase.from('profiles').update({
              name: form.name,
              email: form.email,
              phone: form.phone || null,
              role: form.role || 'staff',
              permissions: permArray,
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
          name: form.name, email: form.email, phone: form.phone || '',
          loginId: form.loginId, role: form.role || 'personnel',
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
            email: form.email,
            loginId: form.loginId || form.email,
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
            name: form.name, email: form.email, phone: form.phone || '',
            loginId: form.loginId || form.email,
            passwordHash: hash, role: (form.role as any) || 'staff',
            permissions: permArray, isActive, isPrimaryAdmin: false,
            status: form.status,
            createdAt: new Date().toISOString(),
          })
          await db.auditLogs.add({
            id: generateId(), businessId, userId: currentUser?.id || '',
            action: 'user_created', entity: 'user', entityId: userId,
            details: JSON.stringify({ name: form.name, loginId: form.loginId, role: form.role, authUserId }),
            createdAt: new Date().toISOString(),
          })
          toast('Utilisateur créé', 'success')
        } else {
          await db.users.add({
            id: generateId(), businessId,
            name: form.name, email: form.email, phone: form.phone || '',
            loginId: form.loginId || form.email,
            passwordHash: hash, role: (form.role as any) || 'staff',
            permissions: permArray, isActive, isPrimaryAdmin: false,
            status: form.status,
            createdAt: new Date().toISOString(),
          })
          await db.auditLogs.add({
            id: generateId(), businessId, userId: currentUser?.id || '',
            action: 'user_created', entity: 'user', entityId: '',
            details: JSON.stringify({ name: form.name, loginId: form.loginId, role: form.role }),
            createdAt: new Date().toISOString(),
          })
          toast('Utilisateur créé', 'success')
        }
      }
      setModalOpen(false)
    } catch {
      toast("Erreur lors de l'enregistrement", 'error')
    }
  }

  async function handleDelete(id: string) {
    const target = users?.find(u => u.id === id)
    if (target?.isPrimaryAdmin) {
      toast("L'administrateur principal ne peut pas être supprimé", 'error')
      return
    }
    setDeleteTargetId(id)
    const confirmed = window.confirm(`Supprimer l'utilisateur ${target?.name} ?`)
    if (confirmed) {
      const target2 = users?.find(u => u.id === id)
      if (target2) await softDelete('users', id, target2 as any, target2.name)
      await db.users.delete(id)
      await db.auditLogs.add({
        id: generateId(), businessId, userId: currentUser?.id || '',
        action: 'user_deleted', entity: 'user', entityId: id,
        details: '',
        createdAt: new Date().toISOString(),
      })
      toast('Utilisateur supprimé', 'success')
    }
    setDeleteTargetId(null)
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

  if (!isPrimaryAdmin && !(hasStarPermission && users?.every(u => !u.isPrimaryAdmin))) {
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
          <h1 className="text-2xl font-bold text-surface-900">Gestion des utilisateurs</h1>
          <p className="text-surface-500 text-sm mt-1">{users?.length || 0} utilisateur(s)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAuditModalOpen(true)}>
            <History className="w-4 h-4" /> Journal
          </Button>
          <Button onClick={openCreate}><Plus className="w-4 h-4" /> Nouvel utilisateur</Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input type="text" placeholder="Rechercher..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('users')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'users' ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Utilisateurs</button>
          <button onClick={() => setTab('audit')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'audit' ? 'bg-primary-500 text-on-accent' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>Audit</button>
        </div>
      </div>

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

      {tab === 'audit' && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto responsive-table">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Date</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Action</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Entité</th>
                  <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {auditLogs?.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-50 transition-colors">
                    <td data-label="Date" className="px-6 py-4 text-sm text-surface-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td data-label="Action" className="px-6 py-4">
                      <Badge variant="info">{log.action}</Badge>
                    </td>
                    <td data-label="Entité" className="px-6 py-4 text-sm text-surface-600">{log.entity}</td>
                    <td data-label="Détails" className="px-6 py-4 text-sm text-surface-500 max-w-xs truncate">{log.details}</td>
                  </tr>
                ))}
                {(!auditLogs || auditLogs.length === 0) && (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-surface-400 text-sm">
                      <History className="w-12 h-12 mx-auto mb-3" />
                      Aucune activité
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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

      <Modal open={auditModalOpen} onClose={() => setAuditModalOpen(false)} title="Journal d'activité" size="lg">        <div className="p-6">
          {auditLogs && auditLogs.length > 0 ? (
            <div className="space-y-3">
              {auditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-surface-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                    <History className="w-4 h-4 text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-900">{log.action}</span>
                      <span className="text-xs text-surface-400">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="text-xs text-surface-500 mt-0.5">{log.entity} â€” {log.details}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-surface-400 text-sm">
              <History className="w-12 h-12 mx-auto mb-3" />
              Aucune activité
            </div>
          )}
        </div>
      </Modal>

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
