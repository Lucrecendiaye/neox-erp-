import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { Save, LogOut, Bell, Shield, Globe, Printer, Database, Upload, Download, Plus, Trash2, Cloud } from 'lucide-react'
import { toast } from '@/lib/toast'
import { exportDBToJSON, importDBFromJSON, downloadJSON, readFileAsText } from '@/lib/dbExport'
import { printBarcodeLabels } from '@/lib/barcodePrint'
import { isSupabaseConfigured } from '@/lib/supabase'
import { syncDexieToSupabase } from '@/lib/seed-supabase'
import type { CurrencyRate } from '@/types'

export default function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.get('default'), [])
  const products = useLiveQuery(() => db.products.toArray(), [])
  const [form, setForm] = useState({
    name: '', currency: 'XOF', currencySymbol: 'FCFA',
    language: 'fr', taxRate: 0, invoicePrefix: 'INV-',
    email: '', phone: '', address: '', website: '',
  })
  const [currencies, setCurrencies] = useState<CurrencyRate[]>([])
  const [newCurrency, setNewCurrency] = useState({ code: '', symbol: '', rate: 1 })
  const [currencyModal, setCurrencyModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (settings) {
      setForm({
        name: settings.name || '', currency: settings.currency || 'XOF',
        currencySymbol: settings.currencySymbol || 'FCFA', language: settings.language || 'fr',
        taxRate: settings.taxRate || 0, invoicePrefix: settings.invoicePrefix || 'INV-',
        email: settings.email || '', phone: settings.phone || '',
        address: settings.address || '', website: settings.website || '',
      })
      setCurrencies(settings.currencies || [])
    }
  }, [settings])

  async function handleSave() {
    try {
      await db.settings.put({
        ...form,
        currencies,
        locale: settings?.locale || 'fr-FR',
        timezone: settings?.timezone || 'Africa/Douala',
        invoiceNextNumber: settings?.invoiceNextNumber || 1,
        id: 'default',
      })
      toast('Paramètres enregistrés', 'success')
    } catch { toast('Erreur lors de l\'enregistrement', 'error') }
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

  async function handleExport() {
    try {
      const data = await exportDBToJSON()
      downloadJSON(data)
      toast('Export réussi', 'success')
    } catch { toast('Erreur lors de l\'export', 'error') }
  }

  async function handleImport(file: File | null) {
    if (!file) return
    if (!confirm('Importer remplacera TOUTES les données existantes. Continuer ?')) return
    setImporting(true)
    try {
      const text = await readFileAsText(file)
      const count = await importDBFromJSON(text)
      toast(`${count} enregistrements importés. Redémarrage...`, 'success')
      setTimeout(() => window.location.reload(), 1500)
    } catch { toast('Erreur lors de l\'import', 'error') }
    setImporting(false)
  }

  async function handlePrintLabels() {
    if (!products || products.length === 0) {
      toast('Aucun produit à imprimer', 'warning')
      return
    }
    const n = products.slice(0, 24)
    printBarcodeLabels(n)
  }

  const fileInputId = 'import-file-input'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Paramètres</h1>
        <p className="text-surface-500 text-sm mt-1">Personnalisez votre ERP</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-500" />
            Informations entreprise
          </CardTitle>
          <div className="mt-4 space-y-4">
            <Input label="Nom de l'entreprise" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Input label="Site web" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
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
                  <button onClick={() => removeCurrency(c.code)} className="p-1 rounded-md hover:bg-red-50 text-surface-400 hover:text-danger">
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
            <Database className="w-5 h-5 text-primary-500" />
            Sauvegarde des données
          </CardTitle>
          <div className="mt-4 space-y-3">
            <Button variant="outline" className="w-full justify-start" onClick={handleExport}>
              <Download className="w-4 h-4" /> Exporter toutes les données (JSON)
            </Button>
            <label htmlFor={fileInputId}>
              <Button variant="outline" className="w-full justify-start cursor-pointer" disabled={importing}>
                <Upload className="w-4 h-4" /> {importing ? 'Import en cours...' : 'Importer des données (JSON)'}
              </Button>
            </label>
            <input id={fileInputId} type="file" accept=".json" className="hidden" onChange={(e) => handleImport(e.target.files?.[0] || null)} />
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
            <Cloud className="w-5 h-5 text-primary-500" />
            Synchronisation Cloud
          </CardTitle>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-surface-500">
              Copie toutes les données locales (Dexie) vers Supabase.
            </p>
            <Button
              variant="outline"
              className="w-full justify-start"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true)
                try {
                  const results = await syncDexieToSupabase()
                  const total = results.reduce((s, r) => s + r.count, 0)
                  const details = results.filter(r => r.count > 0).map(r => `${r.table}: ${r.count}`).join(', ')
                  toast(`Synchronisation réussie : ${total} enregistrements (${details})`, 'success')
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Erreur de synchronisation'
                  toast(msg, 'error')
                }
                setSyncing(false)
              }}
            >
              <Cloud className="w-4 h-4" /> {syncing ? 'Synchronisation...' : 'Sync Dexie → Supabase'}
            </Button>
          </div>
        </Card>
        )}

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-500" />
            Sécurité
          </CardTitle>
          <div className="mt-4 space-y-4">
            <Button variant="outline" className="w-full justify-start"><Shield className="w-4 h-4" /> Verrouillage par code PIN</Button>
            <Button variant="outline" className="w-full justify-start"><LogOut className="w-4 h-4" /> Gérer les utilisateurs</Button>
          </div>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary-500" />
            Notifications
          </CardTitle>
          <div className="mt-4 space-y-4">
            <Button variant="outline" className="w-full justify-start"><Bell className="w-4 h-4" /> Configurer les alertes</Button>
            <Button variant="outline" className="w-full justify-start"><Bell className="w-4 h-4" /> Notifications push</Button>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg"><Save className="w-4 h-4" /> Enregistrer les paramètres</Button>
      </div>

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
