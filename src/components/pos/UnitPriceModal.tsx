import { useState } from 'react'
import { Modal, Button } from '@/components/ui'
import { formatCurrency } from '@/lib/utils'

interface UnitPriceModalProps {
  open: boolean
  productName: string
  unitName: string
  suggestedPrice: number
  onConfirm: (price: number) => void
  onClose: () => void
}

export default function UnitPriceModal({ open, productName, unitName, suggestedPrice, onConfirm, onClose }: UnitPriceModalProps) {
  const [price, setPrice] = useState('')

  function handleConfirm() {
    const val = Number(price)
    if (!val || val <= 0) return
    onConfirm(val)
    setPrice('')
  }

  return (
    <Modal open={open} onClose={() => { setPrice(''); onClose() }} title={`Définir le prix ${unitName.toLowerCase()}`}>
      <div className="p-6 space-y-4">
        <p className="text-sm text-surface-600">
          Le produit <span className="font-semibold text-surface-900">{productName}</span> n'a pas encore de prix en{' '}
          <span className="font-semibold">{unitName}</span>. Indiquez le prix de vente de 1 {unitName.toLowerCase()} :
        </p>
        <div className="space-y-2">
          {suggestedPrice > 0 && (
            <button
              onClick={() => setPrice(String(suggestedPrice))}
              className="w-full text-left px-4 py-2 rounded-xl border border-dashed border-primary-300 bg-primary-50 text-primary-700 text-sm hover:bg-primary-100 transition-colors"
            >
              Suggestion : {formatCurrency(suggestedPrice)}
            </button>
          )}
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={`Prix de 1 ${unitName.toLowerCase()}`}
            className="w-full rounded-xl border border-surface-300 px-4 py-3 text-lg font-bold text-right focus:outline-none focus:ring-2 focus:ring-primary-500"
            min={0}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={() => { setPrice(''); onClose() }}>Annuler</Button>
          <Button onClick={handleConfirm} disabled={!price || Number(price) <= 0}>
            Confirmer et ajouter
          </Button>
        </div>
      </div>
    </Modal>
  )
}
