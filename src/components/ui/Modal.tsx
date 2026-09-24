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
        : 'sm:w-[90%] md:w-[640px] max-w-[640px]'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className={cn(
        'relative w-full',
        widthCls,
        'max-h-[100dvh] sm:max-h-[95vh] md:max-h-[820px]',
        'bg-surface-100 sm:rounded-[20px] shadow-2xl',
        'flex flex-col overflow-hidden',
        'animate-scale-in',
        'overscroll-contain',
        className
      )}>
        {title && (
          <div className="flex items-center justify-between px-5 sm:px-6 pt-5 sm:pt-6 pb-0 shrink-0">
            <h2 className="text-lg font-semibold text-surface-900 leading-snug">{title}</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors touch-target-sm">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto -webkit-overflow-scrolling-touch overscroll-contain">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 flex justify-end gap-3 p-5 sm:p-6 border-t border-surface-200 bg-surface-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
