import { useState } from 'react'
import { Modal, Button, Input } from '@/components/ui'
import { verifyPin, getStoredPinHash } from '@/lib/security'
import { Shield, Lock } from 'lucide-react'

interface PinConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title?: string
  description?: string
  actionLabel?: string
}

export default function PinConfirmModal({
  open, onClose, onConfirm, title = 'Confirmer',
  description = 'Entrez votre code PIN de sécurité pour confirmer cette action.',
  actionLabel = 'Confirmer',
}: PinConfirmModalProps) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const hash = getStoredPinHash()
    const valid = await verifyPin(pin, hash)
    if (!valid) {
      setError('Code PIN incorrect')
      setPin('')
      return
    }
    setLoading(true)
    try { await onConfirm() } catch {}
    setLoading(false)
    handleClose()
  }

  function handleClose() {
    setPin('')
    setError('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={title} size="sm">
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          <div className="bg-amber-500/15 rounded-xl p-4 text-center">
            <Shield className="w-10 h-10 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-surface-600">{description}</p>
          </div>
          <Input
            label="Code PIN de sécurité"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
            placeholder="Entrez votre code PIN"
            icon={<Lock className="w-4 h-4" />}
          />
          {error && <p className="text-sm text-danger text-center">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button type="button" variant="ghost" onClick={handleClose}>Annuler</Button>
          <Button type="submit" disabled={pin.length < 4 || loading}>
            {loading ? '...' : actionLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}