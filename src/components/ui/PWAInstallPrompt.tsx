import { useState, useEffect } from 'react'
import { listenInstallPrompt, installApp, isStandalone } from '@/lib/pwa'
import { Download, X } from 'lucide-react'

export default function PWAInstallPrompt() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    const unsub = listenInstallPrompt((installable) => {
      if (installable && !localStorage.getItem('pwa-install-dismissed')) {
        setShow(true)
      }
    })
    return unsub
  }, [])

  if (!show || dismissed) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 lg:bottom-6 lg:left-auto lg:right-6 lg:w-80 animate-slide-up">
      <div className="glass-dark rounded-2xl p-4 shadow-2xl border border-white/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Installer NeoX ERP</p>
            <p className="text-xs text-white/60 mt-0.5">Installez l'application pour un accès rapide</p>
          </div>
          <button
            onClick={() => { setDismissed(true); localStorage.setItem('pwa-install-dismissed', 'true') }}
            className="p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={async () => {
            const ok = await installApp()
            if (ok) setShow(false)
          }}
          className="mt-3 w-full py-2.5 bg-primary-500 hover:bg-primary-400 text-white font-semibold rounded-xl text-sm transition-colors active:scale-[0.98]"
        >
          Installer
        </button>
      </div>
    </div>
  )
}
