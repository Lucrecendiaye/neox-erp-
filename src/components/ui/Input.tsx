import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url' | 'search' | 'none'
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, id, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-surface-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-surface-400">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'premium-input',
            'disabled:bg-surface-50 disabled:text-surface-500 disabled:cursor-not-allowed',
            icon && 'pl-10',
            error && '!border-danger !ring-danger',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
)

Input.displayName = 'Input'
export default Input
