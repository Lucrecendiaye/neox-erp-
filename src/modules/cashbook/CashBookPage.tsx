import { useState, useMemo } from 'react'
import { Card, CardTitle, StatCard, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Wallet, ArrowUpRight, ArrowDownRight, Plus, Trash2, Search, Filter, Calendar } from 'lucide-react'
import type { CashBookEntry } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

const categories = ['Ventes', 'Achats', 'Salaires', 'Loyer', 'Transport', 'Marketing', 'Fournisseurs', 'Autre']

const paymentMethods = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte' },
  { value: 'mobile', label: 'Mobile Money' },
  { value: 'credit', label: 'Crédit' },
  { value: 'bank', label: 'Banque' },
]

const dateRangeOptions = [
  { value: 'all', label: 'Toutes les dates' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
]

const typeTabs = [
  { value: 'all', label: 'Toutes' },
  { value: 'in', label: 'Entrées' },
  { value: 'out', label: 'Sorties' },
]

function getDateRange(range: string): { start: string; end: string } | null {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  switch (range) {
    case 'today': {
      const s = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      return { start: s, end: s }
    }
    case 'week': {
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1
      const mon = new Date(now)
      mon.setDate(d - diff)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      return {
        start: `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`,
        end: `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`,
      }
    }
    case 'month': {
      const s = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const last = new Date(y, m + 1, 0).getDate()
      return { start: s, end: `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}` }
    }
    default:
      return null
  }
}

export default function CashBookPage() {
  const isCloud = isSupabaseConfigured()
  const dexieEntries = useLiveQuery(() => db.cashBook.orderBy('date').reverse().toArray(), [])
  const { data: supabaseEntries } = useSupabaseQuery<CashBookEntry>('cash_book', undefined, [])
  const entries = isCloud ? (supabaseEntries || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : dexieEntries

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateRange, setDateRange] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)

  const [formType, setFormType] = useState<'in' | 'out'>('in')
  const [formCategory, setFormCategory] = useState('Ventes')
  const [formAmount, setFormAmount] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPartyName, setFormPartyName] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('cash')
  const [formReference, setFormReference] = useState('')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0])

  const filtered = useMemo(() => {
    if (!entries) return []
    let result = [...entries]

    const range = getDateRange(dateRange)
    if (range) {
      result = result.filter(e => e.date >= range.start && e.date <= range.end)
    }

    if (typeFilter !== 'all') {
      result = result.filter(e => e.type === typeFilter)
    }

    if (categoryFilter) {
      result = result.filter(e => e.category === categoryFilter)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        (e.description || '').toLowerCase().includes(q) ||
        (e.partyName || '').toLowerCase().includes(q)
      )
    }

    return result
  }, [entries, dateRange, typeFilter, categoryFilter, search])

  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  const summary = useMemo(() => {
    if (!entries) return { totalIn: 0, totalOut: 0, balance: 0, todayIn: 0, todayOut: 0 }
    const today = new Date().toISOString().split('T')[0]
    let totalIn = 0, totalOut = 0, todayIn = 0, todayOut = 0
    for (const e of entries) {
      if (e.type === 'in') totalIn += e.amount
      else totalOut += e.amount
      if (e.date === today) {
        if (e.type === 'in') todayIn += e.amount
        else todayOut += e.amount
      }
    }
    return { totalIn, totalOut, balance: totalIn - totalOut, todayIn, todayOut }
  }, [entries])

  const uniqueCategories = useMemo(() => {
    if (!entries) return categories
    const existing = new Set(entries.map(e => e.category))
    return [...new Set([...categories, ...existing])]
  }, [entries])

  function resetForm() {
    setFormType('in')
    setFormCategory('Ventes')
    setFormAmount('')
    setFormDescription('')
    setFormPartyName('')
    setFormPaymentMethod('cash')
    setFormReference('')
    setFormDate(new Date().toISOString().split('T')[0])
  }

  function openModal(type: 'in' | 'out') {
    setFormType(type)
    setFormCategory(type === 'in' ? 'Ventes' : 'Achats')
    setModalOpen(true)
  }

  async function handleAdd() {
    const amount = parseFloat(formAmount)
    if (!amount || amount <= 0) { toast('Montant invalide', 'error'); return }
    if (!formCategory) { toast('Catégorie requise', 'error'); return }
    if (!formDate) { toast('Date requise', 'error'); return }

    const entry: CashBookEntry = {
      id: generateId(),
      businessId: 'biz-default',
      date: formDate,
      type: formType,
      category: formCategory,
      amount,
      description: formDescription || undefined,
      partyName: formPartyName || undefined,
      paymentMethod: formPaymentMethod as CashBookEntry['paymentMethod'],
      reference: formReference || undefined,
      createdAt: new Date().toISOString(),
      userId: 'admin',
    }

    try {
      if (isCloud) { await sb.insert('cash_book', entry) } else { await db.cashBook.add(entry) }
      toast('Écriture ajoutée avec succès', 'success')
      setModalOpen(false)
      resetForm()
    } catch {
      toast('Erreur lors de l\'ajout', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette écriture ?')) return
    try {
      if (isCloud) { await sb.remove('cash_book', id) } else { await db.cashBook.delete(id) }
      toast('Écriture supprimée', 'success')
    } catch {
      toast('Erreur lors de la suppression', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Caisse</h1>
          <p className="text-surface-500 text-sm mt-1">{entries?.length || 0} écritures</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openModal('in')}>
            <Plus className="w-4 h-4" /> Entrée
          </Button>
          <Button variant="outline" onClick={() => openModal('out')}>
            <Plus className="w-4 h-4" /> Sortie
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Entrées (aujourd'hui)"
          value={formatCurrency(summary.todayIn)}
          icon={<ArrowUpRight className="w-5 h-5" />}
          color="success"
        />
        <StatCard
          title="Sorties (aujourd'hui)"
          value={formatCurrency(summary.todayOut)}
          icon={<ArrowDownRight className="w-5 h-5" />}
          color="danger"
        />
        <StatCard
          title="Solde"
          value={formatCurrency(summary.balance)}
          icon={<Wallet className="w-5 h-5" />}
          color={summary.balance >= 0 ? 'primary' : 'danger'}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          {typeTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setTypeFilter(tab.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                typeFilter === tab.value
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="text" placeholder="Rechercher..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="w-40">
            <Select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              options={dateRangeOptions}
            />
          </div>
          <div className="w-40">
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={uniqueCategories.map(c => ({ value: c, label: c }))}
              placeholder="Toutes catégories"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {paginatedItems.length === 0 && (
          <div className="text-center py-16">
            <Wallet className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <p className="text-surface-400">Aucune écriture trouvée</p>
          </div>
        )}
        {paginatedItems.map(entry => (
          <Card key={entry.id} padding="sm" className="hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  entry.type === 'in'
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-red-50 text-red-600'
                }`}>
                  {entry.type === 'in'
                    ? <ArrowUpRight className="w-5 h-5" />
                    : <ArrowDownRight className="w-5 h-5" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-surface-900">{entry.category}</p>
                  <p className="text-xs text-surface-400">
                    {entry.description || 'Sans description'}
                    {entry.partyName && ` · ${entry.partyName}`}
                    {' · '}{formatDate(entry.date)}
                    {' · '}{paymentMethods.find(p => p.value === entry.paymentMethod)?.label || entry.paymentMethod}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className={`font-semibold text-lg ${
                    entry.type === 'in' ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {entry.type === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
                  </p>
                  {entry.reference && (
                    <p className="text-xs text-surface-400">Réf: {entry.reference}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm() }} title={formType === 'in' ? 'Nouvelle entrée' : 'Nouvelle sortie'} size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Catégorie"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              options={categories.map(c => ({ value: c, label: c }))}
            />
            <Input
              label="Montant"
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0"
              min={0}
            />
          </div>
          <Input
            label="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder="Description optionnelle"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nom du tiers (optionnel)"
              value={formPartyName}
              onChange={(e) => setFormPartyName(e.target.value)}
              placeholder="Client, fournisseur..."
            />
            <Select
              label="Moyen de paiement"
              value={formPaymentMethod}
              onChange={(e) => setFormPaymentMethod(e.target.value)}
              options={paymentMethods}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Référence (optionnelle)"
              value={formReference}
              onChange={(e) => setFormReference(e.target.value)}
              placeholder="N° facture, reçu..."
            />
            <Input
              label="Date"
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => { setModalOpen(false); resetForm() }}>Annuler</Button>
          <Button onClick={handleAdd}>Ajouter</Button>
        </div>
      </Modal>
    </div>
  )
}
