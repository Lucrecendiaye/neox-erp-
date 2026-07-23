import { useState, useEffect, useRef } from 'react'
import { Shield, Lock, Unlock } from 'lucide-react'

interface LockScreenProps {
  onUnlock: () => void
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const storedPin = localStorage.getItem('neox_pin')

  useEffect(() => {
    if (!storedPin) {
      onUnlock()
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (pin === storedPin) {
      onUnlock()
    } else {
      setError('Code PIN incorrect')
      setShake(true)
      setPin('')
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-surface-900 to-surface-800 flex items-center justify-center p-4 animate-fade-in">
      <div className={`w-full max-w-sm ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-primary-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-xl shadow-primary-900/30">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">NeoX ERP</h1>
          <p className="text-surface-400 text-sm mt-2">Entrez votre code PIN pour déverrouiller</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError('') }}
              placeholder="Code PIN"
              className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-surface-700/50 border border-surface-600 text-white text-lg text-center tracking-[0.5em] placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-danger text-sm text-center animate-fade-in">{error}</p>
          )}

          <button
            type="submit"
            disabled={pin.length < 4}
            className="w-full py-3.5 rounded-2xl bg-primary-600 text-white font-semibold text-sm hover:bg-primary-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] shadow-lg shadow-primary-900/30"
          >
            <Unlock className="w-4 h-4 inline mr-2" />
            Déverrouiller
          </button>
        </form>

        <p className="text-center mt-8">
          <button
            onClick={() => { localStorage.removeItem('neox_pin'); onUnlock() }}
            className="text-sm text-surface-500 hover:text-surface-300 transition-colors"
          >
            PIN oublié ? Réinitialiser
          </button>
        </p>
      </div>
    </div>
  )
}
