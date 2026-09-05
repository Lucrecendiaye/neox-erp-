import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@/components/ui'
import type { ProductUnit } from '@/types'

export interface QuickProductLocation {
  id: string
  name: string
}

export interface QuickProductValues {
  name: string
  purchasePrice: number
  sellingPrice: number
  wholesalePrice: number
  unit: ProductUnit
  packSize: number
  stock: number
  locationId?: string
}

interface QuickProductModalProps {
  open: boolean
  locations?: QuickProductLocation[]
  defaultLocationId?: string
  onClose: () => void
  onCreate: (values: QuickProductValues) => Promise<void>
}

const EMPTY_FORM: QuickProductValues = {
  name: '',
  purchasePrice: 0,
  sellingPrice: 0,
  wholesalePrice: 0,
  unit: 'piece',
  packSize: 0,
  stock: 0,
}

export default function QuickProductModal({ open, locations = [], defaultLocationId, onClose, onCreate }: QuickProductModalProps) {
  const [form, setForm] = useState<QuickProductValues>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY_FORM, locationId: defaultLocationId || locations[0]?.id })
    setSaving(false)
  }, [open, defaultLocationId, locations])

  function update(field: keyof QuickProductValues, value: string | number) {
    setForm(previous => ({ ...previous, [field]: value }))
  }

  async function handleCreate() {
    if (!form.name.trim() || (form.unit === 'pack' && form.packSize <= 0)) return
    setSaving(true)
    try {
      await onCreate({
        ...form,
        name: form.name.trim(),
        purchasePrice: Math.max(0, form.purchasePrice),
        sellingPrice: Math.max(0, form.sellingPrice),
        wholesalePrice: Math.max(0, form.wholesalePrice),
        packSize: form.unit === 'pack' ? Math.max(0, form.packSize) : 0,
        stock: Math.max(0, form.stock),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouveau produit">
      <div className="p-5 space-y-4">
        <p className="text-sm text-surface-500">Créez le produit sans quitter la vente. Il sera ajouté au panier automatiquement si un stock initial est saisi.</p>
        <Input label="Nom du produit" value={form.name} onChange={(event) => update('name', event.target.value)} autoFocus />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Prix d'achat (pièce)" type="number" min="0" value={form.purchasePrice} onChange={(event) => update('purchasePrice', Number(event.target.value) || 0)} inputMode="numeric" />
          <Input label="Prix de vente (pièce)" type="number" min="0" value={form.sellingPrice} onChange={(event) => update('sellingPrice', Number(event.target.value) || 0)} inputMode="numeric" />
          <Input label="Prix de gros" type="number" min="0" value={form.wholesalePrice} onChange={(event) => update('wholesalePrice', Number(event.target.value) || 0)} inputMode="numeric" />
          <label className="block text-sm text-surface-700">
            <span className="block font-medium mb-1.5">Unité principale</span>
            <select value={form.unit} onChange={(event) => update('unit', event.target.value as ProductUnit)} className="premium-input min-h-[44px]">
              <option value="piece">Pièce</option>
              <option value="dozen">Douzaine</option>
              <option value="pack">Paquet</option>
            </select>
          </label>
        </div>
        {form.unit === 'pack' && (
          <Input label="Pièces par paquet" type="number" min="1" value={form.packSize || ''} onChange={(event) => update('packSize', Number(event.target.value) || 0)} inputMode="numeric" />
        )}
        {locations.length > 0 && (
          <label className="block text-sm text-surface-700">
            <span className="block font-medium mb-1.5">Stock à utiliser</span>
            <select value={form.locationId || ''} onChange={(event) => update('locationId', event.target.value)} className="premium-input min-h-[44px]">
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        )}
        <Input label="Stock initial (pièces)" type="number" min="0" value={form.stock || ''} onChange={(event) => update('stock', Number(event.target.value) || 0)} inputMode="numeric" />
        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} className="flex-1 min-h-[48px]">Annuler</Button>
          <Button onClick={handleCreate} disabled={saving || !form.name.trim() || (form.unit === 'pack' && form.packSize <= 0)} className="flex-1 min-h-[48px]">
            {saving ? 'Création...' : 'Créer et ajouter'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
