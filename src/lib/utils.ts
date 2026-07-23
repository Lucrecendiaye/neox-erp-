import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const currencySymbols: Record<string, string> = {
  PKR: 'Rs',
  USD: '$',
  EUR: '€',
  GBP: '£',
  XAF: 'FCFA',
  XOF: 'FCFA',
}

export function formatCurrency(amount: number, currencyOrSymbol?: string): string {
  const sym = currencyOrSymbol ? (currencySymbols[currencyOrSymbol] || currencyOrSymbol) : ''
  return `${sym} ${amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatCurrencyWithCode(amount: number, currency: string): string {
  const sym = currencySymbols[currency] || currency
  return `${sym} ${amount.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export function formatDate(date: string | Date, locale = 'fr-FR'): string {
  return new Date(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(date: string | Date, locale = 'fr-FR'): string {
  return new Date(date).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function generateId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function generateInvoiceNumber(prefix: string, num: number): string {
  return `${prefix}${String(num).padStart(5, '0')}`
}

export function calculateMargin(purchase: number, selling: number): number {
  if (purchase === 0) return 0
  return ((selling - purchase) / purchase) * 100
}

export function calculateTax(amount: number, rate: number): number {
  return (amount * rate) / 100
}

export function openWhatsApp(phone: string, message?: string) {
  const clean = phone.replace(/[^0-9]/g, '')
  if (!clean) return
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  window.open(`https://wa.me/${clean}${text}`, '_blank')
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
