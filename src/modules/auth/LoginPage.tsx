import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '@/lib/auth'
import { toast } from '@/lib/toast'
import { useAppStore } from '@/stores/appStore'
import { LogIn, Mail, Lock, Eye, EyeOff, ArrowLeft, User } from 'lucide-react'

type Step = 'identifier' | 'password'

export default function LoginPage() {
  const navigate = useNavigate()
  const settings = useAppStore(s => s.settings)
  const currentBusiness = useAppStore(s => s.currentBusiness)
  const logoUrl = settings?.logo || currentBusiness?.logo || ''
  const [step, setStep] = useState<Step>('identifier')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  function resetFlow() {
    setStep('identifier')
    setPassword('')
    setLoading(false)
  }

  async function finishLogin(result: { status: string; reason?: string }, welcomeName?: string) {
    if (result.status !== 'ok') {
      toast(result.reason || 'Erreur de connexion', 'error')
      setLoading(false)
      return
    }
    toast(welcomeName ? `Bonjour ${welcomeName}` : 'Connexion réussie', 'success')
    resetFlow()
    navigate('/')
  }

  async function handleIdentifier(e: React.FormEvent) {
    e.preventDefault()
    if (!identifier.trim()) { toast('Entrez votre email, téléphone ou identifiant', 'warning'); return }
    setStep('password')
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!password) { toast('Mot de passe requis', 'warning'); return }
    setLoading(true)
    try {
      const result = await signIn(identifier, password)
      await finishLogin(result, result.user?.name)
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erreur de connexion', 'error')
      setLoading(false)
    }
  }

  const inputClass = 'w-full pl-10 pr-4 py-3 rounded-xl border border-surface-300 bg-surface-100 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all'

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-surface-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-surface-100/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="w-10 h-10 object-contain" />
            ) : (
              <span className="text-3xl font-bold text-white">{(settings?.name || 'N')[0]}</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{settings?.name || 'NeoX ERP'}</h1>
          <p className="text-primary-200 text-sm mt-1">
            {step === 'identifier' ? 'Connectez-vous à votre compte' : 'Entrez votre mot de passe'}
          </p>
        </div>

        <form
          onSubmit={step === 'password' ? handlePassword : handleIdentifier}
          className="bg-surface-100 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-5"
        >
          {step !== 'identifier' && (
            <button type="button" onClick={resetFlow}
              className="flex items-center gap-1.5 text-sm text-surface-400 hover:text-primary-400 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Retour
            </button>
          )}

          {step === 'identifier' && (
            <>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Email, Téléphone ou Identifiant</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    type="text" inputMode="email" autoComplete="username"
                    value={identifier} onChange={e => setIdentifier(e.target.value)}
                    placeholder="exemple@email.com"
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full min-h-[48px] py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-on-accent font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-200 active:scale-[0.98]"
              >
                <Mail className="w-4 h-4" />
                Continuer
              </button>
            </>
          )}

          {step === 'password' && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-50 border border-surface-200">
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary-400" />
                </div>
                <span className="text-sm font-medium text-surface-700 truncate">{identifier}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-surface-700 mb-1.5">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
                  <input
                    type={showPwd ? 'text' : 'password'} autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 rounded-xl border border-surface-300 bg-surface-100 text-base focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full min-h-[48px] py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-on-accent font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary-200 active:scale-[0.98]"
              >
                <LogIn className="w-4 h-4" />
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </>
          )}

          <p className="text-center text-sm text-surface-400">
            Pas encore de compte ?{' '}
            <button type="button" onClick={() => navigate('/register')} className="text-primary-400 hover:text-primary-300 font-medium min-h-[44px] inline-flex items-center">
              Créer un compte
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
