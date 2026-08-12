import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signUp, setSession } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import db from '@/db'
import { useAppStore } from '@/stores/appStore'
import { toast } from '@/lib/toast'
import { UserPlus, Mail, Lock, User, Phone, Eye, EyeOff, AtSign } from 'lucide-react'

export default function RegisterPage() {
  const navigate = useNavigate()
  const settings = useAppStore(s => s.settings)
  const currentBusiness = useAppStore(s => s.currentBusiness)
  const logoUrl = settings?.logo || currentBusiness?.logo || ''
  const [form, setForm] = useState({ name: '', email: '', phone: '', loginId: '', password: '', confirm: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) { toast('Nom, email et mot de passe requis', 'warning'); return }
    if (form.password.length < 4) { toast('Mot de passe : minimum 4 caractères', 'warning'); return }
    if (form.password !== form.confirm) { toast('Les mots de passe ne correspondent pas', 'error'); return }

    setLoading(true)
    try {
      const result = await signUp(form.email, form.password, { name: form.name, phone: form.phone, loginId: form.loginId })
      if (isSupabaseConfigured()) {
        if (result.user) {
          toast('Compte créé ! Vérifiez votre email pour confirmer', 'success')
          navigate('/login')
        }
      } else {
        const userId = (result as any).user?.id
        if (userId) {
          setSession(userId)
          const user = await db.users.get(userId)
          if (user) {
            const biz = await db.businesses.get(user.businessId)
            if (biz) useAppStore.getState().setCurrentBusiness(biz)
          }
          toast(`Bienvenue ${form.name} !`, 'success')
          navigate('/')
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de la création du compte'
      toast(msg, 'error')
    }
    setLoading(false)
  }

  const inputClass = 'w-full pl-10 pr-4 py-3 rounded-xl border border-surface-300 bg-surface-100 text-base focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-surface-100/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-10 h-10 object-contain" />
            ) : (
              <span className="text-3xl font-bold text-white">{(settings?.name || 'C')[0]}</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Créer un compte</h1>
          <p className="text-primary-200 text-sm mt-1">{settings?.name || 'NeoX ERP'}</p>
        </div>

        <form onSubmit={handleRegister} className="bg-surface-100 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Nom complet</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input type="text" inputMode="text" autoComplete="name"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Votre nom" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input type="email" inputMode="email" autoComplete="email"
                value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="email@exemple.com" className={inputClass} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Identifiant de connexion (unique)</label>
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input type="text" inputMode="text" autoComplete="username"
                value={form.loginId} onChange={e => setForm({ ...form, loginId: e.target.value })}
                placeholder="ex: user@shop ou mon-id" className={inputClass} />
            </div>
            <p className="text-xs text-surface-400 mt-1">Si vide, votre email sera utilisé.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Téléphone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input type="tel" inputMode="tel" autoComplete="tel"
                value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+226 XX XX XX" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                  value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••" className="w-full pl-10 pr-10 py-3 rounded-xl border border-surface-300 bg-surface-100 text-base focus:outline-none focus:ring-2 focus:ring-primary-500" />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Confirmer</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                <input type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                  value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })}
                  placeholder="••••••••" className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-300 bg-surface-100 text-base focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full min-h-[48px] py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-on-accent font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-200 active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>

          <p className="text-center text-sm text-surface-400">
            Déjà un compte ?{' '}
            <button type="button" onClick={() => navigate('/login')} className="text-primary-400 hover:text-primary-300 font-medium min-h-[44px] inline-flex items-center">
              Se connecter
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
