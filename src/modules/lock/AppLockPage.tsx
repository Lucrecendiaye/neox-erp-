import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Modal } from '@/components/ui'
import { toast } from '@/lib/toast'
import { Lock, Unlock, Smartphone, Shield } from 'lucide-react'

export default function AppLockPage() {
  const [enabled, setEnabled] = useState(() => !!localStorage.getItem('neox_pin'))
  const [showSetPin, setShowSetPin] = useState(false)
  const [showChangePin, setShowChangePin] = useState(false)
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [oldPin, setOldPin] = useState('')
  const [pinError, setPinError] = useState('')

  useEffect(() => {
    if (!enabled) {
      localStorage.removeItem('neox_pin')
    }
  }, [enabled])

  function handleSetPin() {
    if (newPin.length < 4 || newPin.length > 6) {
      setPinError('Le PIN doit contenir 4 à 6 chiffres')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('Les codes PIN ne correspondent pas')
      return
    }
    localStorage.setItem('neox_pin', newPin)
    setEnabled(true)
    setShowSetPin(false)
    setNewPin('')
    setConfirmPin('')
    setPinError('')
    toast('PIN défini avec succès', 'success')
  }

  function handleChangePin() {
    if (oldPin !== localStorage.getItem('neox_pin')) {
      setPinError('Ancien PIN incorrect')
      return
    }
    if (newPin.length < 4 || newPin.length > 6) {
      setPinError('Le nouveau PIN doit contenir 4 à 6 chiffres')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('Les nouveaux codes PIN ne correspondent pas')
      return
    }
    localStorage.setItem('neox_pin', newPin)
    setShowChangePin(false)
    setOldPin('')
    setNewPin('')
    setConfirmPin('')
    setPinError('')
    toast('PIN modifié avec succès', 'success')
  }

  function handleRemovePin() {
    if (!confirm('Voulez-vous vraiment supprimer le verrouillage PIN ?')) return
    localStorage.removeItem('neox_pin')
    setEnabled(false)
    toast('PIN supprimé', 'success')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Verrouillage de l'application</h1>
        <p className="text-surface-500 text-sm mt-1">Sécurisez l'accès à votre application avec un code PIN</p>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center text-primary-600">
              {enabled ? <Lock className="w-6 h-6" /> : <Unlock className="w-6 h-6" />}
            </div>
            <div>
              <p className="font-semibold text-surface-900">Verrouillage PIN</p>
              <p className="text-xs text-surface-500">{enabled ? 'Activé' : 'Désactivé'}</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                if (!e.target.checked) {
                  handleRemovePin()
                } else {
                  setShowSetPin(true)
                }
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-300 rounded-full peer peer-checked:bg-primary-600 peer-focus:ring-2 peer-focus:ring-primary-300 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>
      </Card>

      {enabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:border-primary-300 transition-colors" onClick={() => { setShowChangePin(true); setPinError('') }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-surface-900">Changer le PIN</p>
                <p className="text-xs text-surface-500">Modifier votre code de verrouillage</p>
              </div>
            </div>
          </Card>

          <Card className="cursor-pointer hover:border-danger/30 transition-colors" onClick={handleRemovePin}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-danger">
                <Unlock className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-surface-900">Supprimer le PIN</p>
                <p className="text-xs text-surface-500">Désactiver la sécurité</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Card className="opacity-60 pointer-events-none">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <Smartphone className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold text-surface-900">Authentification biométrique</p>
            <p className="text-xs text-surface-500">Empreinte digitale / Visage (Bientôt disponible)</p>
          </div>
        </div>
      </Card>

      <Modal open={showSetPin} onClose={() => setShowSetPin(false)} title="Définir un code PIN" size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-surface-500">Choisissez un code PIN à 4 à 6 chiffres</p>
          <Input
            type="password" inputMode="numeric" maxLength={6}
            label="Nouveau PIN" value={newPin}
            onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
            icon={<Lock className="w-4 h-4" />}
          />
          <Input
            type="password" inputMode="numeric" maxLength={6}
            label="Confirmer le PIN" value={confirmPin}
            onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
            icon={<Lock className="w-4 h-4" />}
          />
          {pinError && <p className="text-sm text-danger">{pinError}</p>}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setShowSetPin(false)}>Annuler</Button>
          <Button onClick={handleSetPin}>Définir le PIN</Button>
        </div>
      </Modal>

      <Modal open={showChangePin} onClose={() => setShowChangePin(false)} title="Changer le code PIN" size="sm">
        <div className="p-6 space-y-4">
          <Input
            type="password" inputMode="numeric" maxLength={6}
            label="Ancien PIN" value={oldPin}
            onChange={(e) => { setOldPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
            icon={<Lock className="w-4 h-4" />}
          />
          <Input
            type="password" inputMode="numeric" maxLength={6}
            label="Nouveau PIN" value={newPin}
            onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
            icon={<Lock className="w-4 h-4" />}
          />
          <Input
            type="password" inputMode="numeric" maxLength={6}
            label="Confirmer le nouveau PIN" value={confirmPin}
            onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '')); setPinError('') }}
            icon={<Lock className="w-4 h-4" />}
          />
          {pinError && <p className="text-sm text-danger">{pinError}</p>}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setShowChangePin(false)}>Annuler</Button>
          <Button onClick={handleChangePin}>Changer le PIN</Button>
        </div>
      </Modal>
    </div>
  )
}
