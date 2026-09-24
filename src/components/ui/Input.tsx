import { type ChangeEvent, type FocusEvent, type InputHTMLAttributes, forwardRef, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
  inputMode?: 'text' | 'numeric' | 'decimal' | 'email' | 'tel' | 'url' | 'search' | 'none'
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, id, type, ...props }, ref) => {
    const input = (
      type === 'number'
        ? <NumericInput ref={ref} className={className} id={id} icon={Boolean(icon)} error={Boolean(error)} {...props} />
        : <input
            ref={ref}
            id={id}
            type={type}
            className={cn(
              'premium-input',
              'disabled:bg-surface-50 disabled:text-surface-500 disabled:cursor-not-allowed',
              icon && 'pl-10',
              error && '!border-danger !ring-danger',
              className
            )}
            {...props}
          />
    )

    return (
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
          {input}
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    )
  }
)

type NumericInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  icon?: boolean
  error?: boolean
}

/** Keeps the editing text independent from the numeric value supplied by a parent. */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ className, value, min, onChange, onFocus, onBlur, icon, error, ...props }, ref) => {
    const [draft, setDraft] = useState(value == null ? '' : String(value))
    const focused = useRef(false)

    useEffect(() => {
      if (!focused.current) setDraft(value == null ? '' : String(value))
    }, [value])

    function handleFocus(event: FocusEvent<HTMLInputElement>) {
      focused.current = true
      event.currentTarget.select()
      onFocus?.(event)
    }

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      setDraft(event.target.value)
      // Do not push an empty or incomplete value into numeric parent state.
      if (event.target.value.trim() !== '' && Number.isFinite(Number(event.target.value))) {
        onChange?.(event)
      }
    }

    function handleBlur(event: FocusEvent<HTMLInputElement>) {
      focused.current = false
      const parsed = Number(draft)
      if (draft.trim() === '' || !Number.isFinite(parsed)) {
        const minimum = Number(min)
        const fallback = Number.isFinite(minimum) ? minimum : 0
        setDraft(String(fallback))
        onChange?.({ ...event, target: { ...event.target, value: String(fallback) } } as ChangeEvent<HTMLInputElement>)
      }
      onBlur?.(event)
    }

    return (
      <input
        ref={ref}
        type="text"
        inputMode={props.inputMode || 'decimal'}
        value={draft}
        min={min}
        className={cn(
          'premium-input',
          'disabled:bg-surface-50 disabled:text-surface-500 disabled:cursor-not-allowed',
          icon && 'pl-10',
          error && '!border-danger !ring-danger',
          className
        )}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)

NumericInput.displayName = 'NumericInput'

Input.displayName = 'Input'
export default Input
