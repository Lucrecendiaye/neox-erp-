import { useEffect, useMemo, useState } from 'react'
import { Card, StatCard, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { useBusinessId } from '@/hooks/useBusinessId'
import { usePagination } from '@/hooks/usePagination'
import { usePermission } from '@/hooks/usePermission'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import db from '@/db'
import {
  Wallet, ArrowUpRight, ArrowDownRight, Plus, Search, Trash2, Pencil, Ban, Tags,
} from 'lucide-react'
import {
  processCashOperation, editCashOperation, cancelCashOperation, deleteCashOperation,
  addCashCategory, editCashCategory, deleteCashCategory, ensureCashCategories,
  CASH_OUT_NATURES, cashOutNatureLabel,
} from '@/engine/cash'
import { DATE_RANGE_OPTIONS, getDateRangeBounds, inDateRange } from '@/lib/dateRange'
import { CashBox, cashBoxLabel, cashBoxOfCashOp } from '@/engine/cashboxes'
import type { CashOperation, CashCategory, PaymentMethod, CashOutNature } from '@/types'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'wave', label: 'Wave' },
  { value: 'orange', label: 'Orange Money' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'bank', label: 'Banque' },
  { value: 'card', label: 'Carte' },
]

const dateRangeOptions = DATE_RANGE_OPTIONS

const typeTabs = [
  { value: 'all', label: 'Toutes' },
  { value: 'in', label: 'Entrées' },
  { value: 'out', label: 'Sorties' },
]

const boxTabs: { value: CashBox | 'all'; label: string }[] = [
  { value: 'all', label: 'Toutes caisses' },
  { value: 'boutique', label: 'Boutique' },
  { value: 'livraison', label: 'Livraison' },
  { value: 'cash', label: 'Caisse cash' },
]

const statusOptions = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'completed', label: 'Terminées' },
  { value: 'cancelled', label: 'Annulées' },
]

export default function CashOpsPage() {
  const businessId = useBusinessId()
  const { can, isAdmin } = usePermission()

  const ops = useLiveQuery(() => db.cashOps.where('businessId').equals(businessId).reverse().sortBy('date'), [businessId]) ?? []
  const categories = useLiveQuery(() => db.cashCategories.where('businessId').equals(businessId).toArray(), [businessId]) ?? []
  const locations = useLiveQuery(() => db.locations.where('businessId').equals(businessId).toArray(), [businessId]) ?? []

  const locationsById = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])

  useEffect(() => {
    if (businessId) { ensureCashCategories().catch(() => {}) }
  }, [businessId])

  const canCreate = isAdmin() || can('cash', 'create')
  const canEdit = isAdmin() || can('cash', 'edit')
  const canDelete = isAdmin() || can('cash', 'delete')

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [boxFilter, setBoxFilter] = useState<CashBox | 'all'>('all')

  const [opModalOpen, setOpModalOpen] = useState(false)
  const [editingOp, setEditingOp] = useState<CashOperation | null>(null)
  const [catsModalOpen, setCatsModalOpen] = useState(false)

  const [formType, setFormType] = useState<'in' | 'out'>('in')
  const [formAmount, setFormAmount] = useState('')
  const [formCategoryId, setFormCategoryId] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPartyName, setFormPartyName] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('cash')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0])
  const [formReference, setFormReference] = useState('')
  const [formNature, setFormNature] = useState<CashOutNature>('charge')
  const [formLocationId, setFormLocationId] = useState('')

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<CashCategory | null>(null)
  const [catName, setCatName] = useState('')
  const [catType, setCatType] = useState<CashCategory['type']>('in')

  const filtered = useMemo(() => {
    if (!ops) return []
    let result = [...ops]

    const range = getDateRangeBounds(dateRange as any, customStart, customEnd)
    if (range) {
      result = result.filter(o => inDateRange(o.date, range))
    }

    if (boxFilter !== 'all') result = result.filter(o => cashBoxOfCashOp(o, locationsById) === boxFilter)
    if (typeFilter !== 'all') result = result.filter(o => o.type === typeFilter)
    if (statusFilter !== 'all') result = result.filter(o => o.status === statusFilter)

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        (o.number || '').toLowerCase().includes(q) ||
        (o.description || '').toLowerCase().includes(q) ||
        (o.categoryName || '').toLowerCase().includes(q) ||
        (o.partyName || '').toLowerCase().includes(q) ||
        (o.reference || '').toLowerCase().includes(q)
      )
    }
    return result
  }, [ops, dateRange, customStart, customEnd, boxFilter, typeFilter, statusFilter, search, locationsById])

  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  const summary = useMemo(() => {
    if (!ops) return { balance: 0, totalIn: 0, totalOut: 0, periodIn: 0, periodOut: 0 }
    const range = getDateRangeBounds(dateRange as any, customStart, customEnd)
    let totalIn = 0, totalOut = 0, periodIn = 0, periodOut = 0
    for (const o of ops) {
      if (o.status !== 'completed') continue
      const inBox = boxFilter === 'all' || cashBoxOfCashOp(o, locationsById) === boxFilter
      if (!inBox) continue
      if (o.type === 'in') {
        totalIn += o.amount
        if (range && inDateRange(o.date, range)) periodIn += o.amount
      }
      else {
        totalOut += o.amount
        if (range && inDateRange(o.date, range)) periodOut += o.amount
      }
    }
    return { balance: totalIn - totalOut, totalIn, totalOut, periodIn, periodOut }
  }, [ops, dateRange, customStart, customEnd, boxFilter, locationsById])

  const categoriesForType = useMemo(() => {
    return categories.filter(c => c.active !== false && (c.type === formType || c.type === 'both'))
  }, [categories, formType])

  function resetForm() {
    setFormType('in')
    setFormAmount('')
    setFormCategoryId('')
    setFormDescription('')
    setFormPartyName('')
    setFormPaymentMethod('cash')
    setFormDate(new Date().toISOString().split('T')[0])
    setFormReference('')
    setFormNature('charge')
    setFormLocationId('')
    setEditingOp(null)
  }

  function openCreate(type: 'in' | 'out') {
    resetForm()
    setFormType(type)
    const first = categories.find(c => c.active !== false && (c.type === type || c.type === 'both'))
    setFormCategoryId(first?.id || '')
    setOpModalOpen(true)
  }

  function openEdit(op: CashOperation) {
    if (op.status === 'cancelled') { toast('Cette opération est annulée', 'warning'); return }
    setEditingOp(op)
    setFormType(op.type)
    setFormAmount(String(op.amount))
    setFormCategoryId(op.categoryId || '')
    setFormDescription(op.description || '')
    setFormPartyName(op.partyName || '')
    setFormPaymentMethod(op.paymentMethod || 'cash')
    setFormDate((op.date || '').slice(0, 10) || new Date().toISOString().split('T')[0])
    setFormReference(op.reference || '')
    setFormNature(op.nature || 'charge')
    setFormLocationId(op.locationId || '')
    setOpModalOpen(true)
  }

  async function handleSaveOp() {
    const amount = parseFloat(formAmount)
    if (!amount || amount <= 0) { toast('Montant invalide', 'error'); return }
    if (!formDate) { toast('Date requise', 'error'); return }
    const category = categoriesForType.find(c => c.id === formCategoryId) || categories.find(c => c.id === formCategoryId)
    try {
      if (editingOp) {
        await editCashOperation(editingOp.id, {
          type: formType,
          amount,
          categoryId: category?.id,
          categoryName: category?.name,
          description: formDescription || undefined,
          partyName: formPartyName || undefined,
          paymentMethod: formPaymentMethod,
          date: formDate,
          reference: formReference || undefined,
          nature: formType === 'out' ? formNature : undefined,
          locationId: formLocationId || undefined,
        })
        toast('Opération modifiée', 'success')
      } else {
        await processCashOperation({
          type: formType,
          amount,
          categoryId: category?.id,
          categoryName: category?.name,
          description: formDescription || undefined,
          partyName: formPartyName || undefined,
          paymentMethod: formPaymentMethod,
          date: formDate,
          reference: formReference || undefined,
          nature: formType === 'out' ? formNature : undefined,
          locationId: formLocationId || undefined,
        })
        toast('Opération enregistrée', 'success')
      }
      setOpModalOpen(false)
      resetForm()
    } catch (e: any) {
      toast(e?.message || 'Erreur lors de l\'enregistrement', 'error')
    }
  }

  async function handleCancel(op: CashOperation) {
    if (!confirm(`Annuler l'opération ${op.number} ? Elle sera retirée du solde.`)) return
    const reason = window.prompt('Motif de l\'annulation (optionnel)') || undefined
    try {
      await cancelCashOperation(op.id, reason)
      toast('Opération annulée', 'success')
    } catch (e: any) {
      toast(e?.message || 'Impossible d\'annuler', 'error')
    }
  }

  async function handleDelete(op: CashOperation) {
    if (!confirm(`Supprimer définitivement l'opération ${op.number} ?`)) return
    try {
      await deleteCashOperation(op.id)
      toast('Opération supprimée', 'success')
    } catch (e: any) {
      toast(e?.message || 'Impossible de supprimer', 'error')
    }
  }

  function openAddCat() {
    setEditingCat(null)
    setCatName('')
    setCatType('in')
    setCatModalOpen(true)
  }

  function openEditCat(c: CashCategory) {
    setEditingCat(c)
    setCatName(c.name)
    setCatType(c.type)
    setCatModalOpen(true)
  }

  async function handleSaveCat() {
    if (!catName.trim()) { toast('Nom requis', 'error'); return }
    try {
      if (editingCat) {
        await editCashCategory(editingCat.id, { name: catName.trim(), type: catType })
        toast('Catégorie modifiée', 'success')
      } else {
        await addCashCategory(catName.trim(), catType)
        toast('Catégorie ajoutée', 'success')
      }
      setCatModalOpen(false)
    } catch (e: any) {
      toast(e?.message || 'Erreur sur la catégorie', 'error')
    }
  }

  async function handleToggleCat(c: CashCategory) {
    if (c.isDefault && c.active !== false) { toast('Impossible de désactiver une catégorie par défaut', 'warning'); return }
    try {
      await editCashCategory(c.id, { active: c.active === false })
      toast(c.active === false ? 'Catégorie activée' : 'Catégorie désactivée', 'success')
    } catch (e: any) {
      toast(e?.message || 'Erreur', 'error')
    }
  }

  async function handleDeleteCat(c: CashCategory) {
    if (!confirm(`Supprimer la catégorie « ${c.name} » ?`)) return
    try {
      await deleteCashCategory(c.id)
      toast('Catégorie supprimée', 'success')
    } catch (e: any) {
      toast(e?.message || 'Impossible de supprimer', 'error')
    }
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Cash / Trésorerie</h1>
          <p className="text-surface-500 text-sm mt-1">{ops?.length || 0} opérations</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="outline" onClick={() => setCatsModalOpen(true)}>
              <Tags className="w-4 h-4" /> Catégories
            </Button>
          )}
          {canCreate && (
            <>
              <Button onClick={() => openCreate('in')}>
                <ArrowUpRight className="w-4 h-4" /> Entrée
              </Button>
              <Button variant="outline" onClick={() => openCreate('out')}>
                <ArrowDownRight className="w-4 h-4" /> Sortie
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Entrées (période)"
          value={formatCurrency(summary.periodIn)}
          icon={<ArrowUpRight className="w-5 h-5" />}
          color="success"
        />
        <StatCard
          title="Sorties (période)"
          value={formatCurrency(summary.periodOut)}
          icon={<ArrowDownRight className="w-5 h-5" />}
          color="danger"
        />
        <StatCard
          title="Solde disponible"
          value={formatCurrency(summary.balance)}
          icon={<Wallet className="w-5 h-5" />}
          color={summary.balance >= 0 ? 'primary' : 'danger'}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {boxTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setBoxFilter(tab.value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              boxFilter === tab.value
                ? 'bg-primary-500 text-on-accent shadow-sm'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          {typeTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                typeFilter === tab.value
                  ? 'bg-primary-500 text-on-accent shadow-sm'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text" placeholder="Rechercher..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="w-40">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={statusOptions} />
          </div>
          <div className="w-44">
            <Select value={dateRange} onChange={(e) => setDateRange(e.target.value)} options={dateRangeOptions} />
          </div>
          {dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <span className="text-surface-400 text-xs">→</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {paginatedItems.length === 0 && (
          <div className="text-center py-16">
            <Wallet className="w-12 h-12 text-surface-500 mx-auto mb-3" />
            <p className="text-surface-400">Aucune opération trouvée</p>
          </div>
        )}
        {paginatedItems.map(op => (
          <Card key={op.id} padding="sm" className={op.status === 'cancelled' ? 'opacity-60' : 'hover:shadow-md transition-shadow'}>
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  op.type === 'in' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                }`}>
                  {op.type === 'in' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-surface-900 truncate">{op.categoryName || 'Sans catégorie'}</p>
                    {op.type === 'out' && <Badge variant="warning">{cashOutNatureLabel(op.nature)}</Badge>}
                    {op.status === 'cancelled' && <Badge variant="danger">Annulée</Badge>}
                    <Badge variant="info">{cashBoxLabel(cashBoxOfCashOp(op, locationsById))}</Badge>
                  </div>
                  <p className="text-xs text-surface-400">
                    {op.number}
                    {op.description && ` · ${op.description}`}
                    {op.partyName && ` · ${op.partyName}`}
                    {op.locationName && ` · ${op.locationName}`}
                    {' · '}{formatDate(op.date)}
                    {' · '}{PAYMENT_METHODS.find(p => p.value === op.paymentMethod)?.label || op.paymentMethod}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className={`font-semibold text-lg ${op.type === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {op.type === 'in' ? '+' : '-'}{formatCurrency(op.amount)}
                  </p>
                  {op.balanceAfter !== undefined && op.status === 'completed' && (
                    <p className="text-xs text-surface-400">Solde: {formatCurrency(op.balanceAfter)}</p>
                  )}
                </div>
                {op.status !== 'cancelled' && (
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <button onClick={() => openEdit(op)} className="p-1.5 rounded-lg hover:bg-primary-500/15 text-surface-400 hover:text-primary-400 transition-colors" title="Modifier">
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {canEdit && (
                      <button onClick={() => handleCancel(op)} className="p-1.5 rounded-lg hover:bg-amber-500/15 text-surface-400 hover:text-amber-400 transition-colors" title="Annuler">
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(op)} className="p-1.5 rounded-lg hover:bg-red-500/15 text-surface-400 hover:text-danger transition-colors" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </div>

      <Modal open={opModalOpen} onClose={() => { setOpModalOpen(false); resetForm() }} title={editingOp ? `Modifier ${editingOp.number}` : (formType === 'in' ? 'Nouvelle entrée de cash' : 'Nouvelle sortie de cash')}>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Type d'opération"
              value={formType}
              onChange={(e) => { setFormType(e.target.value as 'in' | 'out'); setFormCategoryId('') }}
              options={[{ value: 'in', label: 'Entrée' }, { value: 'out', label: 'Sortie' }]}
            />
            <Input label="Montant" type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" min={0} />
          </div>
          <Select
            label="Catégorie"
            value={formCategoryId}
            onChange={(e) => setFormCategoryId(e.target.value)}
            options={categoriesForType.map(c => ({ value: c.id, label: c.name }))}
            placeholder={categoriesForType.length ? 'Sélectionner...' : 'Aucune catégorie disponible'}
          />
          {formType === 'out' && (
            <div>
              <Select
                label="Nature de la sortie"
                value={formNature}
                onChange={(e) => setFormNature(e.target.value as CashOutNature)}
                options={CASH_OUT_NATURES.map(n => ({ value: n.value, label: n.label }))}
              />
              <p className="mt-1 text-[11px] text-surface-400">
                {CASH_OUT_NATURES.find(n => n.value === formNature)?.hint}
              </p>
            </div>
          )}
          <Input label="Description (optionnel)" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Description" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nom du tiers (optionnel)" value={formPartyName} onChange={(e) => setFormPartyName(e.target.value)} placeholder="Client, fournisseur..." />
            <Select label="Moyen de paiement" value={formPaymentMethod} onChange={(e) => setFormPaymentMethod(e.target.value as PaymentMethod)} options={PAYMENT_METHODS} />
          </div>
          <Select
            label="Caisse / Emplacement (optionnel)"
            value={formLocationId}
            onChange={(e) => setFormLocationId(e.target.value)}
             options={locations.filter(l => l.type === 'shop').map(l => ({ value: l.id, label: `${l.name} (Boutique)` }))}
            placeholder="Caisse générale (boutique)"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Référence (optionnel)" value={formReference} onChange={(e) => setFormReference(e.target.value)} placeholder="N° facture, reçu..." />
            <Input label="Date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => { setOpModalOpen(false); resetForm() }}>Annuler</Button>
          <Button onClick={handleSaveOp}>{editingOp ? 'Enregistrer' : 'Ajouter'}</Button>
        </div>
      </Modal>

      <Modal open={catsModalOpen} onClose={() => setCatsModalOpen(false)} title="Catégories de cash">
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-surface-500">Gérez les catégories d'entrées et sorties</p>
            {canCreate && (
              <Button size="sm" onClick={openAddCat}><Plus className="w-4 h-4" /> Nouvelle</Button>
            )}
          </div>
          {categories.length === 0 && <p className="text-sm text-surface-400 py-6 text-center">Aucune catégorie</p>}
          {categories.map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-surface-200 bg-surface-100">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  c.type === 'in' ? 'bg-emerald-500/15 text-emerald-400' : c.type === 'out' ? 'bg-red-500/15 text-red-400' : 'bg-primary-500/15 text-primary-400'
                }`}>
                  {c.type === 'in' ? <ArrowUpRight className="w-4 h-4" /> : c.type === 'out' ? <ArrowDownRight className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-surface-900 text-sm truncate">
                    {c.name}
                    {c.isDefault && <span className="ml-1.5 text-[10px] text-surface-400">défaut</span>}
                  </p>
                  <p className="text-[11px] text-surface-400">
                    {c.type === 'in' ? 'Entrée' : c.type === 'out' ? 'Sortie' : 'Entrée & sortie'}{c.active === false && ' · Désactivée'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canEdit && (
                  <button onClick={() => openEditCat(c)} className="p-1.5 rounded-lg hover:bg-primary-500/15 text-surface-400 hover:text-primary-400 transition-colors" title="Modifier">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => handleToggleCat(c)} className="p-1.5 rounded-lg hover:bg-amber-500/15 text-surface-400 hover:text-amber-400 transition-colors" title={c.active === false ? 'Activer' : 'Désactiver'}>
                    {c.active === false ? <Plus className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  </button>
                )}
                {canDelete && !c.isDefault && (
                  <button onClick={() => handleDeleteCat(c)} className="p-1.5 rounded-lg hover:bg-red-500/15 text-surface-400 hover:text-danger transition-colors" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title={editingCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}>
        <div className="p-6 space-y-4">
          <Input label="Nom" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex: Transport" />
          <Select
            label="Type"
            value={catType}
            onChange={(e) => setCatType(e.target.value as CashCategory['type'])}
            options={[
              { value: 'in', label: 'Entrée' },
              { value: 'out', label: 'Sortie' },
              { value: 'both', label: 'Entrée & sortie' },
            ]}
          />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setCatModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSaveCat}>{editingCat ? 'Enregistrer' : 'Créer'}</Button>
        </div>
      </Modal>
    </div>
  )
}
