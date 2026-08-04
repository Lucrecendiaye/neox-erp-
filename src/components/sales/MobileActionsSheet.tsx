import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Eye, FileText, Send, Mail, Edit2, Trash2 } from 'lucide-react'

interface Action {
  key: string
  label: string
  icon: React.ReactNode
  variant?: 'default' | 'danger'
  onClick: () => void
}

export default function MobileActionsSheet({
  open,
  onClose,
  actions,
}: {
  open: boolean
  onClose: () => void
  actions: Action[]
}) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: TouchEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('touchstart', handler, { passive: true })
    return () => document.removeEventListener('touchstart', handler)
  }, [open, onClose])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose}>
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl pb-safe-bottom animate-slide-up"
      >
        {actions.map((a, i) => (
          <button
            key={a.key}
            onClick={() => { a.onClick(); onClose() }}
            className={cn(
              'w-full flex items-center gap-4 px-5 py-4 text-sm font-medium border-b border-surface-100 last:border-b-0 active:bg-surface-50 transition-colors',
              a.variant === 'danger' ? 'text-red-600' : 'text-surface-800'
            )}
          >
            <span className="w-5 h-5 shrink-0">{a.icon}</span>
            {a.label}
          </button>
        ))}
        <button
          onClick={onClose}
          className="w-full text-center py-4 text-sm font-semibold text-surface-500 border-t border-surface-200 active:bg-surface-50"
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
