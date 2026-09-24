import { useState } from 'react'
import { Modal, Button } from '@/components/ui'

interface UnitPriceModalProps {
  open: boolean
  productName: string
  unitName: string
  initialQuantity?: number
  onConfirm: (price: number, quantity: number) => void
  onClose: () => void
}

export default function UnitPriceModal({ open, productName, unitName, initialQuantity = 1, onConfirm, onClose }: UnitPriceModalProps) {
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState(String(initialQuantity))

  function handleConfirm() {
    const val = Number(price)
    const qty = Number(quantity)
    if (!val || val <= 0 || !qty || qty <= 0) return
    onConfirm(val, qty)
    setPrice(''); setQuantity(String(initialQuantity))
  }

  return (
    <Modal open={open} onClose={() => { setPrice(''); setQuantity(String(initialQuantity)); onClose() }} title={`Définir le prix ${unitName.toLowerCase()}`}>
      <div className="p-6 space-y-4">
        <p className="text-sm text-surface-600">
          Saisissez le prix de vente du produit <span className="font-semibold text-surface-900">{productName}</span> pour{' '}
          <span className="font-semibold">1 {unitName.toLowerCase()}</span>.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">Quantité</span>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Quantité"
              className="w-full rounded-xl border border-surface-300 px-4 py-3 text-lg font-bold text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
              min={0.1}
              step="any"
              autoFocus
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-surface-700">Prix unitaire</span>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={`Prix de 1 ${unitName.toLowerCase()}`}
            className="w-full rounded-xl border border-surface-300 px-4 py-3 text-lg font-bold text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
            min={0}
          />
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => { setPrice(''); setQuantity(String(initialQuantity)); onClose() }}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={!price || Number(price) <= 0 || !quantity || Number(quantity) <= 0}>
            Confirmer
          </Button>
        </div>
      </div>
    </Modal>
  )
}
