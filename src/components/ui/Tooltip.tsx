import { useState, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: string
  children: ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ content, children, position = 'top', className }: TooltipProps) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleEnter() {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setShow(true), 300)
  }

  function handleLeave() {
    clearTimeout(timeoutRef.current)
    setShow(false)
  }

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }

  const arrows = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-surface-800 border-x-transparent border-x-4 border-t-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-surface-800 border-x-transparent border-x-4 border-b-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-surface-800 border-y-transparent border-y-4 border-l-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-surface-800 border-y-transparent border-y-4 border-r-4',
  }

  return (
    <div className={cn('relative inline-flex', className)} onMouseEnter={handleEnter} onMouseLeave={handleLeave} onFocus={handleEnter} onBlur={handleLeave}>
      {children}
      {show && (
        <div className={cn('absolute z-50 pointer-events-none animate-fade-in', positions[position])}>
          <div className="bg-surface-950 text-white text-xs rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap max-w-xs">
            {content}
          </div>
          <div className={cn('absolute w-0 h-0', arrows[position])} />
        </div>
      )}
    </div>
  )
}
