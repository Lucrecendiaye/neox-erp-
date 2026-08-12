import { cn, formatCurrency, getProductUnits, getUnitMinQty, getUnitStep } from '@/lib/utils'
import { X, Minus, Plus, Trash2, ShoppingCart, Package, ChevronRight } from 'lucide-react'
import type { Product } from '@/types'

export interface CartSheetItem {
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  total?: number
  unitName?: string
  locationId?: string
  locationName?: string
}

function cartItemKey(i: CartSheetItem) {
  return `${i.productId}::${i.unitName || 'Pièce'}${i.locationId ? `::${i.locationId}` : ''}`
}

interface MobileCartSheetProps {
  open: boolean
  onClose: () => void
  cart: CartSheetItem[]
  products: Product[]
  subtotal: number
  discount: number
  setDiscount: (v: number) => void
  total: number
  updateQuantity: (key: string, delta: number) => void
  setQuantity: (key: string, value: number) => void
  updateCartUnit: (key: string, unit: string) => void
  updateCartPrice: (key: string, price: number) => void
  removeFromCart: (key: string) => void
  clearCart: () => void
  canEditPrice: boolean
  onCheckout: () => void
}

export default function MobileCartSheet(props: MobileCartSheetProps) {
  const { open, onClose, cart, products, subtotal, discount, setDiscount, total } = props

  return (
    <div className={cn('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')}>
      {open && <div className="absolute inset-0 bg-black/50" onClick={onClose} />}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 bg-surface-50 rounded-t-3xl flex flex-col shadow-2xl transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ maxHeight: '92vh' }}
      >
        {/* Handle */}
        <div className="pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-surface-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary-500" />
            <h2 className="text-lg font-bold text-surface-900">Panier ({cart.length})</h2>
          </div>
          <div className="flex items-center gap-1">
            {cart.length > 0 && (
              <button onClick={props.clearCart} className="touch-target rounded-xl text-surface-400 hover:text-danger transition-colors" title="Vider">
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="touch-target rounded-xl text-surface-400 hover:text-surface-700 transition-colors" title="Fermer">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3">
          {cart.map((item) => {
            const key = cartItemKey(item)
            const product = products.find(p => p.id === item.productId)
            const units = product ? getProductUnits(product) : []
            return (
              <div key={key} className="bg-surface-100 border border-surface-200 rounded-2xl p-3 shadow-sm">
                <div className="flex gap-3 items-start">
                  <div className="w-14 h-14 rounded-xl bg-surface-50 flex items-center justify-center overflow-hidden shrink-0 border border-surface-100">
                    {product?.photos?.[0] ? (
                      <img loading="lazy" src={product.photos[0]} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-7 h-7 text-surface-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-surface-900 text-sm leading-tight">{item.productName}</p>
                      <button onClick={() => props.removeFromCart(key)} className="touch-target-sm rounded-lg text-surface-400 hover:text-danger transition-colors shrink-0 -mr-1 -mt-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {(item as CartSheetItem).locationName && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-400 text-[10px] font-medium">
                        {(item as CartSheetItem).locationName}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        value={item.unitName || 'Pièce'}
                        onChange={(e) => props.updateCartUnit(key, e.target.value)}
                        className="text-xs rounded-lg border border-surface-200 bg-surface-50 px-2 py-1.5 text-surface-700 focus:outline-none min-h-[36px]"
                      >
                        {units.map(u => (<option key={u.name} value={u.name}>{u.name}</option>))}
                      </select>
                      {props.canEditPrice && (
                        <input
                          type="number" min="0" step="1" value={item.unitPrice}
                          onChange={(e) => props.updateCartPrice(key, Math.max(0, Number(e.target.value) || 0))}
                          className="w-20 text-xs rounded-lg border border-surface-200 bg-surface-50 px-2 py-1.5 text-surface-900 text-right focus:outline-none min-h-[36px]"
                          inputMode="numeric"
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => props.updateQuantity(key, -1)}
                    className="w-12 h-12 rounded-xl bg-surface-50 border border-surface-200 flex items-center justify-center text-surface-700 active:bg-surface-200 transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <input
                    type="number"
                    min={getUnitMinQty(item.unitName || 'Pièce')}
                    step={getUnitStep(item.unitName || 'Pièce')}
                    value={item.quantity}
                    onChange={(e) => props.setQuantity(key, Number(e.target.value))}
                    inputMode="decimal"
                    className="w-20 h-12 text-center text-lg font-bold text-surface-900 bg-surface-50 border border-surface-200 rounded-xl px-1 focus:outline-none focus:ring-2 focus:ring-primary-200"
                  />
                  <button
                    onClick={() => props.updateQuantity(key, 1)}
                    className="w-12 h-12 rounded-xl bg-primary-500 text-on-accent flex items-center justify-center active:scale-[0.96] transition-transform shadow shadow-primary-200"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <span className="ml-auto text-xl font-bold text-primary-500">{formatCurrency(item.total ?? item.quantity * item.unitPrice)}</span>
                </div>
              </div>
            )
          })}
          {cart.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-400">
              <ShoppingCart className="w-14 h-14 mb-4 text-surface-500" />
              <p className="text-sm font-medium text-surface-900">Panier vide</p>
              <p className="text-xs text-surface-500 mt-1">Cliquez sur un produit pour l'ajouter</p>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="shrink-0 border-t border-surface-200 bg-surface-100 rounded-t-2xl px-4 pt-3 pb-3 safe-area-bottom">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-surface-500">Sous-total</span>
              <span className="text-surface-900 font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-sm">
              <span className="text-surface-500">Remise</span>
              <input
                type="number" min="0" value={discount || ''}
                onChange={(e) => props.setDiscount(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0"
                className="w-24 text-right rounded-lg border border-surface-200 bg-surface-50 px-2 py-1.5 text-surface-900 focus:outline-none min-h-[36px]"
                inputMode="numeric"
              />
            </div>
            <div className="flex justify-between items-baseline pt-1">
              <span className="text-base font-semibold text-surface-900">Total à payer</span>
              <span className="text-2xl font-extrabold text-primary-500">{formatCurrency(total)}</span>
            </div>
          </div>
          <button
            onClick={props.onCheckout}
            disabled={cart.length === 0}
            className={cn(
              'w-full mt-3 py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
              cart.length > 0
                ? 'bg-primary-500 text-on-accent shadow-lg shadow-primary-200'
                : 'bg-surface-100 text-surface-400'
            )}
          >
            Passer au paiement <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
