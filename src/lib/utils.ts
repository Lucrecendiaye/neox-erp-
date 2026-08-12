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
  const text = message ? `?text=${encodeURIComponent(message)}` : ''
  if (clean) {
    window.open(`https://wa.me/${clean}${text}`, '_blank')
  } else if (text) {
    window.open(`https://wa.me/${text}`, '_blank')
  } else {
    window.open('https://wa.me', '_blank')
  }
}

export interface ContactInfo {
  name: string
  tel: string
}

export async function pickContact(): Promise<ContactInfo | null> {
  const { canUseContactPicker, pickNativeContact, promptContactManual } = await import('@/lib/contactModal')
  const native = await pickNativeContact()
  if (native) return native
  if (!canUseContactPicker()) {
    const manual = await promptContactManual()
    if (manual && (manual.name || manual.tel)) return manual
    return null
  }
  return null
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function convertToMainUnit(qty: number, unitQuantity: number): number {
  return qty * unitQuantity
}

export function convertFromMainUnit(mainQty: number, unitQuantity: number): { units: number; remainder: number } {
  return {
    units: Math.floor(mainQty / unitQuantity),
    remainder: mainQty % unitQuantity,
  }
}

export interface UnitInfo {
  name: string
  quantity: number
}

export function getProductUnits(product: { unit: string; packSize?: number }): UnitInfo[] {
  const units: UnitInfo[] = [{ name: 'Pièce', quantity: 1 }]
  units.push({ name: 'Demi-douzaine', quantity: 6 })
  units.push({ name: 'Douzaine', quantity: 12 })
  if (product.packSize && product.packSize > 0) {
    units.push({ name: 'Demi-paquet', quantity: product.packSize / 2 })
    units.push({ name: 'Paquet', quantity: product.packSize })
  }
  return units
}

export function getProductUnitInfo(product: { unit: string; packSize?: number }): UnitInfo {
  if (product.unit === 'dozen') return { name: 'Douzaine', quantity: 12 }
  if (product.unit === 'pack') return { name: 'Paquet', quantity: product.packSize || 1 }
  return { name: 'Pièce', quantity: 1 }
}

export function getPurchaseUnits(product: { unit: string; packSize?: number }): UnitInfo[] {
  return [
    { name: 'Pièce', quantity: 1 },
    { name: 'Douzaine', quantity: 12 },
    { name: 'Paquet', quantity: product.packSize || 10 },
  ]
}

export function getUnitPrice(product: { sellingPrice: number; priceDozen?: number; pricePack?: number }, unitName: string): number {
  if (unitName === 'Douzaine' && product.priceDozen) return product.priceDozen
  if (unitName === 'Demi-douzaine' && product.priceDozen) return product.priceDozen / 2
  if (unitName === 'Paquet' && product.pricePack) return product.pricePack
  if (unitName === 'Demi-paquet' && product.pricePack) return product.pricePack / 2
  return product.sellingPrice
}

export function getUnitStep(unitName: string): number {
  if (unitName === 'Douzaine' || unitName === 'Paquet') return 0.5
  return 1
}

export function getUnitMinQty(unitName: string): number {
  if (unitName === 'Douzaine' || unitName === 'Paquet') return 0.5
  return 1
}

export function formatUnitQty(qty: number, unitName: string): string {
  const display = Number.isInteger(qty) ? qty.toString() : qty.toFixed(1).replace('.', ',')
  const u = unitName || 'Pièce'
  if (qty >= 0 && qty < 2 && u === 'Douzaine') return `${display} douzaine`
  if (qty >= 2 && u === 'Douzaine') return `${display} douzaines`
  if (qty >= 0 && qty < 2 && u === 'Demi-douzaine') return `${display} demi-douzaine`
  if (qty >= 2 && u === 'Demi-douzaine') return `${display} demi-douzaines`
  if (qty >= 0 && qty < 2 && u === 'Paquet') return `${display} paquet`
  if (qty >= 2 && u === 'Paquet') return `${display} paquets`
  if (qty >= 0 && qty < 2 && u === 'Demi-paquet') return `${display} demi-paquet`
  if (qty >= 2 && u === 'Demi-paquet') return `${display} demi-paquets`
  if (qty >= 0 && qty < 2) return `${display} pièce`
  if (qty >= 2) return `${display} pièces`
  return `${display} ${u.toLowerCase()}`
}
