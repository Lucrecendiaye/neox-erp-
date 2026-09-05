import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '@/components/ui'
import { formatCurrency, getProductUnits, getUnitMinQty, getUnitPrice, getUnitStep } from '@/lib/utils'
import type { Product } from '@/types'

export interface SaleStockOption {
  locationId: string
  locationName: string
  quantity: number
  isShop?: boolean
}

export interface ProductSaleSelection {
  unitName: string
  quantity: number
  unitPrice: number
  locationId: string
}

interface ProductSaleModalProps {
  open: boolean
  product: Product | null
  stockOptions: SaleStockOption[]
  initialUnitName?: string
  priceMode: 'detail' | 'gros'
  onConfirm: (selection: ProductSaleSelection) => void
  onClose: () => void
}

function roundQuantity(value: number) {
  return Number(value.toFixed(2))
}

export default function ProductSaleModal({
  open,
  product,
  stockOptions,
  initialUnitName,
  priceMode,
  onConfirm,
  onClose,
}: ProductSaleModalProps) {
  const units = useMemo(() => product ? getProductUnits(product) : [], [product])
  const [unitName, setUnitName] = useState('Pièce')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState(0)
  const [locationId, setLocationId] = useState('')

  const unit = units.find(item => item.name === unitName) || units[0]
  const selectedStock = stockOptions.find(item => item.locationId === locationId)
  const sourceMax = unit && selectedStock
    ? Math.floor((selectedStock.quantity / unit.quantity + 0.000001) / getUnitStep(unit.name)) * getUnitStep(unit.name)
    : 0

  useEffect(() => {
    if (!open || !product || units.length === 0) return
    const nextUnitName = units.some(item => item.name === initialUnitName)
      ? initialUnitName!
      : units[0].name
    const nextUnit = units.find(item => item.name === nextUnitName) || units[0]
    const preferredLocation = stockOptions.find(item => item.isShop) || stockOptions[0]
    setUnitName(nextUnit.name)
    setQuantity(getUnitMinQty(nextUnit.name))
    setUnitPrice(priceMode === 'gros'
      ? (product.wholesalePrice || getUnitPrice(product, nextUnit.name))
      : getUnitPrice(product, nextUnit.name))
    setLocationId(preferredLocation?.locationId || '')
  }, [open, product, initialUnitName, priceMode, stockOptions, units])

  function handleUnitChange(nextUnitName: string) {
    if (!product) return
    const nextUnit = units.find(item => item.name === nextUnitName)
    if (!nextUnit) return
    setUnitName(nextUnitName)
    setQuantity(getUnitMinQty(nextUnitName))
    setUnitPrice(priceMode === 'gros'
      ? (product.wholesalePrice || getUnitPrice(product, nextUnitName))
      : getUnitPrice(product, nextUnitName))
  }

  if (!product) return null

  return (
    <Modal open={open} onClose={onClose} title={`Ajouter ${product.name}`}>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm text-surface-700">
            <span className="block font-medium mb-1.5">Unité</span>
            <select
              value={unitName}
              onChange={(event) => handleUnitChange(event.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-3 py-3 text-sm min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {units.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-sm text-surface-700">
            <span className="block font-medium mb-1.5">Source du stock</span>
            <select
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-3 py-3 text-sm min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {stockOptions.map(item => (
                <option key={item.locationId} value={item.locationId}>
                  {item.locationName} ({item.quantity} pcs)
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block text-sm text-surface-700">
            <span className="block font-medium mb-1.5">Quantité</span>
            <input
              type="number"
              min={getUnitMinQty(unit?.name || 'Pièce')}
              step={getUnitStep(unit?.name || 'Pièce')}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(getUnitMinQty(unit?.name || 'Pièce'), Number(event.target.value) || getUnitMinQty(unit?.name || 'Pièce')))}
              inputMode="decimal"
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-3 py-3 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
          <label className="block text-sm text-surface-700">
            <span className="block font-medium mb-1.5">Prix unitaire</span>
            <input
              type="number"
              min="0"
              step="1"
              value={unitPrice}
              onChange={(event) => setUnitPrice(Math.max(0, Number(event.target.value) || 0))}
              inputMode="numeric"
              className="w-full rounded-xl border border-surface-300 bg-surface-100 px-3 py-3 text-base min-h-[48px] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </label>
        </div>

        <div className="rounded-xl bg-surface-50 border border-surface-200 p-3 text-sm space-y-1">
          <div className="flex justify-between gap-3">
            <span className="text-surface-500">Total ligne</span>
            <strong className="text-primary-500">{formatCurrency(quantity * unitPrice)}</strong>
          </div>
          <div className="flex justify-between gap-3 text-xs">
            <span className="text-surface-500">Disponible dans la source</span>
            <span className="text-surface-700">{sourceMax} {unit?.name || 'Pièce'}</span>
          </div>
          {unit && selectedStock && quantity > sourceMax && (
            <p className="text-xs text-amber-600 pt-1">
              Le complément sera choisi dans un autre dépôt.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} className="flex-1 min-h-[48px]">Annuler</Button>
          <Button
            onClick={() => {
              if (!locationId || !unit) return
              onConfirm({ unitName: unit.name, quantity: roundQuantity(quantity), unitPrice, locationId })
            }}
            disabled={!locationId || !unit || quantity <= 0}
            className="flex-1 min-h-[48px]"
          >
            Ajouter au panier
          </Button>
        </div>
      </div>
    </Modal>
  )
}
