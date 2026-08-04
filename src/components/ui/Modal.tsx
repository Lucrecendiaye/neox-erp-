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
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className={cn(
        'relative w-[95%] sm:w-[90%] md:w-[640px] max-w-[640px]',
        'max-h-[95vh] md:max-h-[820px]',
        'bg-white rounded-[20px] shadow-2xl',
        'flex flex-col overflow-hidden',
        'animate-scale-in',
        className
      )}>
        {title && (
          <div className="flex items-center justify-between px-6 pt-6 pb-0 shrink-0">
            <h2 className="text-lg font-semibold text-surface-900">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
