import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
  size?: string
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, className, size = 'md', footer }: ModalProps) {
  const widthCls =
    size === 'full'
      ? 'sm:w-[96%] lg:w-[72%] max-w-[1200px]'
      : size === 'lg'
        ? 'sm:w-[92%] md:w-[900px] max-w-[900px]'
        : size === 'sm'
          ? 'sm:w-[90%] md:w-[440px] max-w-[440px]'
          : 'sm:w-[90%] md:w-[640px] max-w-[640px]'
  // Les grands formulaires (lg/full) prennent tout l'écran sur mobile (bottom-sheet propre).
  // Les petits modals (sm/md) restent une carte centrée.
  const sheetOnMobile = size === 'lg' || size === 'full'
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className={cn('fixed inset-0 z-50 flex justify-center animate-fade-in', sheetOnMobile ? 'items-stretch sm:items-center sm:p-4' : 'items-center p-4')} role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className={cn(
        'relative w-full',
        widthCls,
        sheetOnMobile
          ? 'h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[92dvh] md:max-h-[820px]'
          : 'max-h-[92dvh] sm:max-h-[90dvh]',
        'bg-surface-100 sm:rounded-[20px] shadow-2xl',
        'flex flex-col overflow-hidden',
        'animate-scale-in',
        'overscroll-contain',
        className
      )}>
        {title && (
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-surface-200 shrink-0">
            <h2 className="text-base sm:text-lg font-semibold text-surface-900 leading-snug truncate">{title}</h2>
            <button onClick={onClose} className="p-2 -mr-1 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors shrink-0 touch-target-sm" aria-label="Fermer">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto -webkit-overflow-scrolling-touch overscroll-contain min-h-0">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 flex justify-end gap-3 px-5 sm:px-6 py-4 border-t border-surface-200 bg-surface-100 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
