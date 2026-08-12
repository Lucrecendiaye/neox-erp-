import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { Save, LogOut, Bell, Shield, Globe, Printer, Plus, Trash2, CheckCircle, Database, KeyRound, Lock, Camera, Image, X, Palette } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useBusinessId } from '@/hooks/useBusinessId'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { printBarcodeLabels } from '@/lib/barcodePrint'
import { isSupabaseConfigured } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { setPin as setSecurityPin, resetPinToDefault, verifyPin, getStoredPinHash } from '@/lib/security'
import { hashPassword } from '@/lib/auth'
import { subscribeToPushNotifications, unsubscribeFromPushNotifications, isPushSubscribed } from '@/lib/pushNotifications'
import { compressImage, uploadImage, syncBusinessLogo } from '@/lib/imageStorage'
import PushSubscription from '@/components/ui/PushSubscription'
import { useTheme, THEMES } from '@/providers/theme-provider'
import type { CurrencyRate } from '@/types'

export default function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('default'), [])
  const businessId = useBusinessId()
  const products = useLiveQuery(() => db.products.where('businessId').equals(businessId).toArray(), [businessId])
  const { theme, setTheme } = useTheme()
  const logoRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '', slogan: '', currency: 'XOF', currencySymbol: 'FCFA',
    language: 'fr', taxRate: 0, invoicePrefix: 'INV-',
    email: '', phone: '', address: '', website: '',
    ninea: '', rccm: '', managerName: '', accountNumber: '', bankName: '', invoiceNotes: '',
  })
  const [logo, setLogo] = useState('')
  const [currencies, setCurrencies] = useState<CurrencyRate[]>([])
  const [newCurrency, setNewCurrency] = useState({ code: '', symbol: '', rate: 1 })
  const [currencyModal, setCurrencyModal] = useState(false)
  const [pinModal, setPinModal] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [pinOld, setPinOld] = useState('')
  const [pinMode, setPinMode] = useState<'set' | 'change'>('set')
  const [passwordModal, setPasswordModal] = useState(false)
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [pinEnabledState, setPinEnabledState] = useState(true)

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name || '', slogan: settings.slogan || '',
        currency: settings.currency || 'XOF',
        currencySymbol: settings.currencySymbol || 'FCFA', language: settings.language || 'fr',
        taxRate: settings.taxRate || 0, invoicePrefix: settings.invoicePrefix || 'INV-',
        email: settings.email || '', phone: settings.phone || '',
        address: settings.address || '', website: settings.website || '',
        ninea: settings.ninea || '', rccm: settings.rccm || '',
        managerName: settings.managerName || '',
        accountNumber: settings.accountNumber || '', bankName: settings.bankName || '',
        invoiceNotes: settings.invoiceNotes || '',
      })
      setLogo(settings.logo || '')
      setCurrencies(settings.currencies || [])
    }
  }, [settings])

  async function handleSave() {
    try {
      const updated = {
        ...form, logo,
        currencies,
        locale: settings?.locale || 'fr-FR',
        timezone: settings?.timezone || 'Africa/Douala',
        invoiceNextNumber: settings?.invoiceNextNumber || 1,
        id: 'default',
      } as any
      await db.settings.put(updated)
      useAppStore.getState().setSettings(updated)
      if (logo) await syncBusinessLogo(logo)
      toast('Paramètres enregistrés', 'success')
    } catch { toast('Erreur lors de l\'enregistrement', 'error') }
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    try {
      const compressed = await compressImage(file, { maxDim: 512 })
      const url = await uploadImage(compressed, 'logos')
      setLogo(url)
      await syncBusinessLogo(url)
      toast('Logo mis à jour', 'success')
    } catch { toast('Erreur lors du chargement du logo', 'error') }
  }

  function removeLogo() {
    setLogo('')
    syncBusinessLogo('')
  }

  function addCurrency() {
    if (!newCurrency.code || !newCurrency.symbol || newCurrency.rate <= 0) return
    if (currencies.find(c => c.code === newCurrency.code)) {
      toast('Cette devise existe déjà', 'warning')
      return
    }
    setCurrencies([...currencies, { ...newCurrency, isDefault: false }])
    setNewCurrency({ code: '', symbol: '', rate: 1 })
    setCurrencyModal(false)
  }

  function removeCurrency(code: string) {
    if (currencies.find(c => c.code === code)?.isDefault) return
    setCurrencies(currencies.filter(c => c.code !== code))
  }

  async function handlePrintLabels() {
    if (!products || products.length === 0) {
      toast('Aucun produit à imprimer', 'warning')
      return
    }
    const n = products.slice(0, 24)
    printBarcodeLabels(n)
  }

  async function handleChangePin() {
    if (pinEnabledState) {
      const storedHash = getStoredPinHash()
      if (storedHash) {
        const valid = await verifyPin(pinOld, storedHash)
        if (!valid) return toast('Ancien code PIN incorrect', 'error')
      }
    }
    if (pinValue.length < 4) return toast('Le code PIN doit avoir au moins 4 chiffres', 'warning')
    if (pinValue !== pinConfirm) return toast('Les codes PIN ne correspondent pas', 'warning')
    await setSecurityPin(pinValue)
    setPinModal(false)
    setPinValue(''); setPinConfirm(''); setPinOld('')
    setPinEnabledState(true)
    toast(pinEnabledState ? 'Code PIN modifié avec succès' : 'Code PIN activé avec succès', 'success')
  }

  async function handleChangePassword() {
    const { oldPassword, newPassword, confirmPassword } = pwForm
    if (!oldPassword || !newPassword || !confirmPassword) return toast('Tous les champs sont requis', 'warning')
    if (newPassword.length < 6) return toast('Le mot de passe doit avoir au moins 6 caractères', 'warning')
    if (newPassword !== confirmPassword) return toast('Les mots de passe ne correspondent pas', 'warning')
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw error
      }
      toast('Mot de passe modifié avec succès', 'success')
      setPasswordModal(false)
      setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      toast(err?.message || 'Erreur lors du changement de mot de passe', 'error')
    }
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Paramètres</h1>
        <p className="text-surface-500 text-sm mt-1">Personnalisez votre ERP</p>
      </div>

      <div className="lg:hidden flex items-center gap-4 p-4 rounded-2xl border border-surface-200 bg-gradient-to-r from-primary-500/10 via-surface-100 to-surface-100">
        <div className="w-16 h-16 shrink-0 rounded-2xl overflow-hidden border border-surface-200 bg-white flex items-center justify-center">
          {logo ? (
            <img src={logo} alt="Logo" className="w-full h-full object-contain p-1" />
          ) : (
            <span className="text-2xl font-extrabold text-primary-500">{form.name.charAt(0).toUpperCase() || 'E'}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-surface-900 truncate">{form.name || 'Mon entreprise'}</p>
          {form.slogan && <p className="text-xs text-surface-500 truncate">{form.slogan}</p>}
          <p className="text-xs text-surface-500 mt-1 flex items-center gap-1">
            {form.managerName && <><span className="truncate">{form.managerName}</span> · </>}
            <span>{form.phone || form.email || 'Profil à compléter'}</span>
          </p>
        </div>
        <Globe className="w-5 h-5 text-primary-400 shrink-0" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-500" />
            Informations entreprise
          </CardTitle>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Logo de l'entreprise</label>
              <div className="flex items-center gap-4">
                {logo ? (
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-surface-200 group">
                    <img src={logo} alt="Logo" className="w-full h-full object-contain" />
                    <button onClick={removeLogo}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div onClick={() => logoRef.current?.click()}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-surface-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary-400 hover:bg-surface-50 transition-colors">
                    <Camera className="w-6 h-6 text-surface-400" />
                    <span className="text-[10px] text-surface-400">Logo</span>
                  </div>
                )}
                <input ref={logoRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
              </div>
            </div>
            <Input label="Nom de l'entreprise" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Slogan" value={form.slogan} onChange={(e) => setForm({ ...form, slogan: e.target.value })} />
            <Input label="Responsable / Gérant" value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
            <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Input label="Site web" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-500" />
            Identification fiscale
          </CardTitle>
          <div className="mt-4 space-y-4">
            <Input label="NINEA" value={form.ninea} onChange={(e) => setForm({ ...form, ninea: e.target.value })} />
            <Input label="RCCM" value={form.rccm} onChange={(e) => setForm({ ...form, rccm: e.target.value })} />
          </div>
          <CardTitle className="flex items-center gap-2 mt-6">
            <Database className="w-5 h-5 text-primary-500" />
            Informations bancaires
          </CardTitle>
          <div className="mt-4 space-y-4">
            <Input label="Banque" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            <Input label="Numéro de compte" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-primary-500" />
            Facturation & Taxes
          </CardTitle>
          <div className="mt-4 space-y-4">
            <Select label="Devise par défaut" value={form.currency} onChange={(e) => {
              const cur = currencies.find(c => c.code === e.target.value)
              setForm({ ...form, currency: e.target.value, currencySymbol: cur?.symbol || form.currencySymbol })
            }}
              options={currencies.map(c => ({ value: c.code, label: `${c.code} (${c.symbol})${c.isDefault ? ' — Par défaut' : ''}` }))} />
            <Input label="Symbole devise" value={form.currencySymbol} onChange={(e) => setForm({ ...form, currencySymbol: e.target.value })} />
            <Input label="TVA par défaut (%)" type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: +e.target.value })} />
            <Input label="Préfixe facture" value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })} />
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Notes sur la facture</label>
              <textarea value={form.invoiceNotes} onChange={(e) => setForm({ ...form, invoiceNotes: e.target.value })}
                rows={3} placeholder="Merci pour votre confiance. Les marchandises vendues ne sont ni reprises ni échangées."
                className="w-full rounded-xl border border-surface-300 bg-surface-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-500" />
            Langue & Région
          </CardTitle>
          <div className="mt-4 space-y-4">
            <Select label="Langue" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}
              options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }, { value: 'ur', label: 'اردو' }]} />
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary-500" />
            Apparence
          </CardTitle>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-surface-500">Choisissez le thème de l'application. Le changement s'applique immédiatement.</p>
            <div className="grid grid-cols-2 gap-3">
              {THEMES.map((t) => (
                <button key={t.id} onClick={() => setTheme(t.id)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition-all',
                    theme === t.id
                      ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-400/30'
                      : 'border-surface-300 hover:border-primary-300'
                  )}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex -space-x-1.5">
                      {t.swatches.map((c, i) => (
                        <span key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ background: c }} />
                      ))}
                    </span>
                    <span className="text-sm font-semibold text-surface-800">{t.label}</span>
                    {theme === t.id && <CheckCircle className="w-4 h-4 text-primary-400 ml-auto" />}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-surface-400">{t.tag}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary-500" />
            Gestion des devises
          </CardTitle>
          <div className="mt-4 space-y-3">
            {currencies.map(c => (
              <div key={c.code} className="flex items-center justify-between p-2 bg-surface-50 rounded-xl">
                <div>
                  <span className="text-sm font-medium text-surface-900">{c.code}</span>
                  <span className="text-xs text-surface-400 ml-2">{c.symbol}</span>
                  <span className="text-xs text-surface-400 ml-2">Taux: {c.rate}</span>
                  {c.isDefault && <span className="text-[10px] ml-2 text-primary-500 font-medium">Par défaut</span>}
                </div>
                {!c.isDefault && (
                  <button onClick={() => removeCurrency(c.code)} className="p-1 rounded-md hover:bg-red-500/15 text-surface-400 hover:text-danger">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setCurrencyModal(true)}>
              <Plus className="w-4 h-4" /> Ajouter une devise
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-primary-500" />
            Impression
          </CardTitle>
          <div className="mt-4 space-y-3">
            <Button variant="outline" className="w-full justify-start" onClick={handlePrintLabels}>
              <Printer className="w-4 h-4" /> Imprimer étiquettes produits
            </Button>
          </div>
        </Card>

        {isSupabaseConfigured() && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-success" />
            Cloud
          </CardTitle>
          <div className="mt-4">
            <p className="text-sm text-surface-500">
              Vos données sont automatiquement sauvegardées sur le cloud.
            </p>
          </div>
        </Card>
        )}

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-500" />
            Sécurité
          </CardTitle>
          <div className="mt-4 space-y-3">
            <Button variant={pinEnabledState ? 'secondary' : 'outline'} className="w-full justify-start" onClick={() => { setPinMode(pinEnabledState ? 'change' : 'set'); setPinModal(true) }}>
              <Lock className="w-4 h-4" />
              {pinEnabledState ? 'Modifier le code PIN de sécurité' : 'Activer le code PIN de sécurité'}
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => setPasswordModal(true)}>
              <KeyRound className="w-4 h-4" /> Modifier le mot de passe
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => window.location.href = '/users'}>
              <LogOut className="w-4 h-4" /> Gérer les utilisateurs
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary-500" />
            Notifications
          </CardTitle>
          <div className="mt-4 space-y-4">
            <PushSubscription />
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg"><Save className="w-4 h-4" /> Enregistrer les paramètres</Button>
      </div>

      <Modal open={pinModal} onClose={() => { setPinModal(false); setPinValue(''); setPinConfirm(''); setPinOld(''); }} title={pinMode === 'set' ? 'Activer le code PIN' : 'Modifier le code PIN'} size="sm">
        {pinMode === 'set' ? (
          <div className="p-6 space-y-4">
            <div className="bg-primary-50 rounded-xl p-4 text-center">
              <Lock className="w-10 h-10 text-primary-500 mx-auto mb-2" />
              <p className="text-sm text-surface-600">Créez un code PIN à 4-6 chiffres pour protéger les opérations sensibles.</p>
            </div>
            <Input label="Nouveau code PIN" type="password" inputMode="numeric" value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="4 à 6 chiffres" />
            <Input label="Confirmer le code PIN" type="password" inputMode="numeric" value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Confirmer" />
            {pinValue && pinConfirm && pinValue !== pinConfirm && (
              <p className="text-xs text-danger text-center">Les codes ne correspondent pas</p>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPinModal(false)}>Annuler</Button>
              <Button className="flex-1" disabled={pinValue.length < 4 || pinValue !== pinConfirm}
                onClick={async () => { await handleChangePin(); setPinEnabledState(true) }}>
                Activer
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="bg-amber-500/15 rounded-xl p-4 text-center">
              <Shield className="w-10 h-10 text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-surface-600">Entrez l'ancien code, le nouveau, puis confirmez.</p>
            </div>
            <Input label="Ancien code PIN" type="password" inputMode="numeric" value={pinOld}
              onChange={(e) => setPinOld(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Ancien code" />
            <Input label="Nouveau code PIN" type="password" inputMode="numeric" value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Nouveau code (4-6 chiffres)" />
            <Input label="Confirmer le nouveau code" type="password" inputMode="numeric" value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Confirmer" />
            {pinValue && pinConfirm && pinValue !== pinConfirm && (
              <p className="text-xs text-danger text-center">Les codes ne correspondent pas</p>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPinModal(false)}>Annuler</Button>
              <Button className="flex-1" disabled={!pinOld || pinValue.length < 4 || pinValue !== pinConfirm}
                onClick={async () => { await handleChangePin(); setPinEnabledState(true) }}>
                Modifier
              </Button>
            </div>
            <hr className="my-2" />
            <Button variant="danger" className="w-full" onClick={async () => {
              if (!pinOld) return toast('Entrez votre code PIN actuel pour désactiver', 'warning')
              const storedHash = getStoredPinHash()
              if (storedHash) {
                const valid = await verifyPin(pinOld, storedHash)
                if (!valid) return toast('Code PIN incorrect', 'error')
              }
              resetPinToDefault()
              setPinModal(false); setPinValue(''); setPinConfirm(''); setPinOld('')
              setPinEnabledState(false)
              toast('Code PIN désactivé', 'success')
            }}>
              <Shield className="w-4 h-4" /> Désactiver le code PIN
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={passwordModal} onClose={() => { setPasswordModal(false); setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' }) }} title="Modifier le mot de passe" size="sm">
        <div className="p-6 space-y-4">
          <div className="bg-primary-50 rounded-xl p-4 text-center">
            <KeyRound className="w-10 h-10 text-primary-500 mx-auto mb-2" />
            <p className="text-sm text-surface-600">Changez votre mot de passe de connexion.</p>
          </div>
          <Input label="Ancien mot de passe" type="password" value={pwForm.oldPassword}
            onChange={(e) => setPwForm({ ...pwForm, oldPassword: e.target.value })} placeholder="Ancien mot de passe" />
          <Input label="Nouveau mot de passe" type="password" value={pwForm.newPassword}
            onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} placeholder="Nouveau mot de passe (min. 6 car.)" />
          <Input label="Confirmer le nouveau mot de passe" type="password" value={pwForm.confirmPassword}
            onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })} placeholder="Confirmer" />
          {pwForm.newPassword && pwForm.confirmPassword && pwForm.newPassword !== pwForm.confirmPassword && (
            <p className="text-xs text-danger text-center">Les mots de passe ne correspondent pas</p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => { setPasswordModal(false); setPwForm({ oldPassword: '', newPassword: '', confirmPassword: '' }) }}>Annuler</Button>
            <Button className="flex-1" disabled={!pwForm.oldPassword || pwForm.newPassword.length < 6 || pwForm.newPassword !== pwForm.confirmPassword} onClick={handleChangePassword}>
              Modifier le mot de passe
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={currencyModal} onClose={() => setCurrencyModal(false)} title="Ajouter une devise">
        <div className="p-6 space-y-4">
          <Input label="Code devise (ex: USD)" value={newCurrency.code} onChange={(e) => setNewCurrency({ ...newCurrency, code: e.target.value.toUpperCase() })} placeholder="USD" />
          <Input label="Symbole (ex: $)" value={newCurrency.symbol} onChange={(e) => setNewCurrency({ ...newCurrency, symbol: e.target.value })} placeholder="$" />
          <Input label="Taux de change (1 devise par défaut = X)" type="number" value={newCurrency.rate} onChange={(e) => setNewCurrency({ ...newCurrency, rate: +e.target.value })} placeholder="0.0015" />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setCurrencyModal(false)}>Annuler</Button>
          <Button onClick={addCurrency}>Ajouter</Button>
        </div>
      </Modal>
    </div>
  )
}