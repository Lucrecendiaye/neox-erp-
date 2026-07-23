import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, hashPassword, setSession } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import db from '@/db'
import { toast } from '@/lib/toast'
import { LogIn, Mail, Lock, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { toast('Email et mot de passe requis', 'warning'); return }
    setLoading(true)
    try {
      if (isSupabaseConfigured()) {
        await signIn(email, password)
        toast('Connexion réussie', 'success')
        navigate('/')
      } else {
        const hash = await hashPassword(password)
        const users = await db.users
          .filter(u => (u.email === email || u.phone === email) && u.passwordHash === hash && u.isActive)
          .toArray()
        if (users.length === 0) {
          toast('Email/téléphone ou mot de passe incorrect', 'error')
          setLoading(false)
          return
        }
        const user = users[0]
        setSession(user.id)
        await db.users.update(user.id, { lastLogin: new Date().toISOString() })
        toast(`Bonjour ${user.name}`, 'success')
        navigate('/')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion'
      toast(msg, 'error')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl font-bold text-white">N</span>
          </div>
          <h1 className="text-2xl font-bold text-white">NeoX ERP</h1>
          <p className="text-primary-200 text-sm mt-1">Connectez-vous à votre compte</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Email ou Téléphone</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="text" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="exemple@email.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">Mot de passe</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
              />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-200"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>

          <p className="text-center text-sm text-surface-400">
            Pas encore de compte ?{' '}
            <button type="button" onClick={() => navigate('/register')} className="text-primary-600 hover:text-primary-700 font-medium">
              Créer un compte
            </button>
          </p>
          {!isSupabaseConfigured() && (
            <p className="text-center text-xs text-surface-300">
              Première utilisation ? <strong>admin@neoxerp.com</strong> / <strong>admin123</strong>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
