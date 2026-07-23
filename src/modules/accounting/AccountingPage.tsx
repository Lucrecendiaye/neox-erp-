import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Modal, Badge, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Search, Plus, Edit2, Trash2, DollarSign, TrendingUp, TrendingDown, Landmark, BarChart3, FileText } from 'lucide-react'
import type { AccountingEntry, Account } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'

type Tab = 'entries' | 'pnl' | 'balance'

export default function AccountingPage() {
  const isCloud = isSupabaseConfigured()
  const [tab, setTab] = useState<Tab>('entries')
  const dexieEntries = useLiveQuery(() => db.accountingEntries.orderBy('date').reverse().limit(200).toArray(), [])
  const { data: supabaseEntries } = useSupabaseQuery<AccountingEntry>('accounting_entries', undefined, [])
  const entries = isCloud ? (supabaseEntries || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 200) : dexieEntries
  const dexieAccounts = useLiveQuery(() => db.accounts.toArray(), [])
  const { data: supabaseAccounts } = useSupabaseQuery<Account>('accounts', undefined, [])
  const accounts = isCloud ? supabaseAccounts : dexieAccounts
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ type: 'revenue' as AccountingEntry['type'], accountId: '', amount: 0, description: '', reference: '' })

  const filtered = entries?.filter(e =>
    (e.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.reference || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.accountName || '').toLowerCase().includes(search.toLowerCase())
  )
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  const totals = useMemo(() => {
    const revenue = entries?.filter(e => e.type === 'revenue').reduce((s, e) => s + e.amount, 0) || 0
    const expense = entries?.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0) || 0
    return { revenue, expense, profit: revenue - expense }
  }, [entries])

  const pnl = useMemo(() => {
    const revenueByAccount = new Map<string, number>()
    const expenseByAccount = new Map<string, number>()
    entries?.forEach(e => {
      if (e.type === 'revenue') revenueByAccount.set(e.accountName, (revenueByAccount.get(e.accountName) || 0) + e.amount)
      if (e.type === 'expense') expenseByAccount.set(e.accountName, (expenseByAccount.get(e.accountName) || 0) + e.amount)
    })
    return {
      revenues: [...revenueByAccount.entries()].map(([name, amount]) => ({ name, amount })),
      expenses: [...expenseByAccount.entries()].map(([name, amount]) => ({ name, amount })),
    }
  }, [entries])

  const balance = useMemo(() => {
    const assets = accounts?.filter(a => a.type === 'asset') || []
    const liabilities = accounts?.filter(a => a.type === 'liability') || []
    const equity = accounts?.filter(a => a.type === 'equity') || []
    return { assets, liabilities, equity }
  }, [accounts])

  async function handleSave() {
    const now = new Date().toISOString()
    try {
      const account = accounts?.find(a => a.id === form.accountId)
      if (isCloud) { await sb.insert('accounting_entries', { id: generateId(), businessId: 'biz-default', date: now, type: form.type, accountId: form.accountId, accountName: account?.name || '', amount: form.amount, direction: form.type === 'revenue' ? 'credit' : 'debit', reference: form.reference || `MANUAL-${Date.now()}`, description: form.description, createdAt: now, userId: 'admin' }) } else { await db.accountingEntries.add({ id: generateId(), businessId: 'biz-default', date: now, type: form.type, accountId: form.accountId, accountName: account?.name || '', amount: form.amount, direction: form.type === 'revenue' ? 'credit' : 'debit', reference: form.reference || `MANUAL-${Date.now()}`, description: form.description, createdAt: now, userId: 'admin' }) }
      const newBalance = (account?.balance || 0) + (form.type === 'revenue' ? form.amount : -form.amount)
      if (account) { if (isCloud) { await sb.update('accounts', account.id, { balance: newBalance }) } else { await db.accounts.update(account.id, { balance: newBalance }) } }
      toast('Écriture créée avec succès', 'success')
      setModalOpen(false)
      setForm({ type: 'revenue', accountId: '', amount: 0, description: '', reference: '' })
    } catch (error) {
      toast('Erreur lors de la création de l\'écriture', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Voulez-vous vraiment supprimer cette écriture ?')) return
    try {
      if (isCloud) { await sb.remove('accounting_entries', id) } else { await db.accountingEntries.delete(id) }
      toast('Écriture supprimée avec succès', 'success')
    } catch (error) {
      toast('Erreur lors de la suppression de l\'écriture', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Comptabilité</h1>
          <p className="text-surface-500 text-sm mt-1">{entries?.length || 0} écritures</p>
        </div>
        <Button onClick={() => setModalOpen(true)}><Plus className="w-4 h-4" /> Nouvelle écriture</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="sm"><div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><TrendingUp className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Revenus</p><p className="text-lg font-bold text-surface-900">{formatCurrency(totals.revenue)}</p></div></div></Card>
        <Card padding="sm"><div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-red-50 text-red-600"><TrendingDown className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Dépenses</p><p className="text-lg font-bold text-surface-900">{formatCurrency(totals.expense)}</p></div></div></Card>
        <Card padding="sm"><div className="flex items-center gap-3"><div className="p-2 rounded-xl bg-blue-50 text-blue-600"><BarChart3 className="w-5 h-5" /></div><div><p className="text-xs text-surface-500">Bénéfice net</p><p className={`text-lg font-bold ${totals.profit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(totals.profit)}</p></div></div></Card>
      </div>

      <div className="flex gap-2">
        {(['entries', 'pnl', 'balance'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t ? 'bg-primary-600 text-white shadow-sm' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}>
            {t === 'entries' ? 'Écritures' : t === 'pnl' ? 'Compte de résultat' : 'Bilan'}
          </button>
        ))}
      </div>

      {tab === 'entries' && (
        <>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <Card padding="sm">
            <div className="space-y-1">
              {paginatedItems?.map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-surface-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${e.type === 'revenue' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {e.type === 'revenue' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-900">{e.description || e.accountName}</p>
                      <p className="text-xs text-surface-400">{e.accountName} · {formatDate(e.date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-sm font-semibold ${e.type === 'revenue' ? 'text-success' : 'text-danger'}`}>
                      {e.type === 'revenue' ? '+' : '-'}{formatCurrency(e.amount)}
                    </span>
                    <button onClick={() => handleDelete(e.id)} className="p-1 rounded hover:bg-red-50 text-surface-300 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
              {filtered && filtered.length > 0 && (
                <div className="flex justify-center pt-4">
                  <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
                </div>
              )}
              {(!filtered || filtered.length === 0) && <p className="text-center py-8 text-surface-400 text-sm">Aucune écriture</p>}
            </div>
          </Card>
        </>
      )}

      {tab === 'pnl' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardTitle><div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-success" /> Revenus</div></CardTitle>
            <div className="mt-4 space-y-2">
              {pnl.revenues.map(r => (
                <div key={r.name} className="flex justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="text-sm text-surface-700">{r.name}</span>
                  <span className="text-sm font-semibold text-success">{formatCurrency(r.amount)}</span>
                </div>
              ))}
              {pnl.revenues.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucun revenu</p>}
              <div className="flex justify-between pt-3 border-t-2 border-surface-200">
                <span className="text-sm font-bold text-surface-900">Total revenus</span>
                <span className="text-sm font-bold text-success">{formatCurrency(totals.revenue)}</span>
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle><div className="flex items-center gap-2"><TrendingDown className="w-5 h-5 text-danger" /> Dépenses</div></CardTitle>
            <div className="mt-4 space-y-2">
              {pnl.expenses.map(e => (
                <div key={e.name} className="flex justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="text-sm text-surface-700">{e.name}</span>
                  <span className="text-sm font-semibold text-danger">{formatCurrency(e.amount)}</span>
                </div>
              ))}
              {pnl.expenses.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucune dépense</p>}
              <div className="flex justify-between pt-3 border-t-2 border-surface-200">
                <span className="text-sm font-bold text-surface-900">Total dépenses</span>
                <span className="text-sm font-bold text-danger">{formatCurrency(totals.expense)}</span>
              </div>
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardTitle><div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary-500" /> Résultat net</div></CardTitle>
            <div className="mt-4 flex justify-between items-center">
              <span className="text-base text-surface-700">Bénéfice / Perte</span>
              <span className={`text-2xl font-bold ${totals.profit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(totals.profit)}</span>
            </div>
          </Card>
        </div>
      )}

      {tab === 'balance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardTitle><div className="flex items-center gap-2"><Landmark className="w-5 h-5 text-blue-500" /> Actifs</div></CardTitle>
            <div className="mt-4 space-y-2">
              {balance.assets.map(a => (
                <div key={a.id} className="flex justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="text-sm text-surface-700">{a.name}</span>
                  <span className="text-sm font-semibold">{formatCurrency(a.balance)}</span>
                </div>
              ))}
              {balance.assets.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucun actif</p>}
              <div className="flex justify-between pt-3 border-t-2 border-surface-200">
                <span className="text-sm font-bold text-surface-900">Total actifs</span>
                <span className="text-sm font-bold text-blue-600">{formatCurrency(balance.assets.reduce((s, a) => s + a.balance, 0))}</span>
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle><div className="flex items-center gap-2"><Landmark className="w-5 h-5 text-amber-500" /> Passifs</div></CardTitle>
            <div className="mt-4 space-y-2">
              {balance.liabilities.map(l => (
                <div key={l.id} className="flex justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="text-sm text-surface-700">{l.name}</span>
                  <span className="text-sm font-semibold">{formatCurrency(l.balance)}</span>
                </div>
              ))}
              {balance.liabilities.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucun passif</p>}
              <div className="flex justify-between pt-3 border-t-2 border-surface-200">
                <span className="text-sm font-bold text-surface-900">Total passifs</span>
                <span className="text-sm font-bold text-amber-600">{formatCurrency(balance.liabilities.reduce((s, l) => s + l.balance, 0))}</span>
              </div>
            </div>
          </Card>
          <Card>
            <CardTitle><div className="flex items-center gap-2"><Landmark className="w-5 h-5 text-emerald-500" /> Capitaux propres</div></CardTitle>
            <div className="mt-4 space-y-2">
              {balance.equity.map(e => (
                <div key={e.id} className="flex justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="text-sm text-surface-700">{e.name}</span>
                  <span className="text-sm font-semibold">{formatCurrency(e.balance)}</span>
                </div>
              ))}
              {balance.equity.length === 0 && <p className="text-sm text-surface-400 text-center py-4">Aucun capital</p>}
              <div className="flex justify-between pt-3 border-t-2 border-surface-200">
                <span className="text-sm font-bold text-surface-900">Total capitaux</span>
                <span className="text-sm font-bold text-emerald-600">{formatCurrency(balance.equity.reduce((s, e) => s + e.balance, 0))}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouvelle écriture" size="md">
        <div className="p-6 space-y-4">
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountingEntry['type'] })}
            options={[{ value: 'revenue', label: 'Revenu' }, { value: 'expense', label: 'Dépense' }]} />
          <Select label="Compte" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            options={(accounts || []).map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }))} placeholder="Sélectionner..." />
          <Input label="Montant" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} icon={<DollarSign className="w-4 h-4" />} />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Référence" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-surface-200">
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          <Button onClick={handleSave}>Créer</Button>
        </div>
      </Modal>
    </div>
  )
}
