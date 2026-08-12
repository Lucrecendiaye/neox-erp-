import { useState, useEffect, useMemo } from 'react'
import { Card, Badge, StatCard, Button, Modal } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { formatCurrency, formatDateTime, generateId } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAppStore } from '@/stores/appStore'
import { useBusinessId } from '@/hooks/useBusinessId'
import { Banknote, Clock, Play, StopCircle, DollarSign, ArrowUpDown, History, TrendingUp } from 'lucide-react'

interface CashShift {
  id: string
  openedAt: string
  closedAt?: string
  openedBy: string
  initialCash: number
  expectedCash: number
  actualCash: number
  cardTotal: number
  mobileTotal: number
  bankTotal: number
  cashSales: number
  totalSales: number
  totalExpenses: number
  difference: number
  status: 'open' | 'closed'
  notes?: string
}

const STORAGE_KEY = 'neox-cash-shifts'

function getShifts(): CashShift[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveShifts(shifts: CashShift[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts))
}

export default function CashRegisterPage() {
  const isCloud = isSupabaseConfigured()
  const businessId = useBusinessId()
  const sales = useLiveQuery(() => db.sales.where('businessId').equals(businessId).filter(s => s.status === 'completed').toArray(), [businessId])
  const cashBook = useLiveQuery(() => db.cashBook.where('businessId').equals(businessId).toArray(), [businessId])
  const [shifts, setShifts] = useState<CashShift[]>([])
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [initialCash, setInitialCash] = useState('')
  const [actualCash, setActualCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')

  useEffect(() => { setShifts(getShifts()) }, [])

  const currentShift = shifts.find(s => s.status === 'open')
  const closedShifts = shifts.filter(s => s.status === 'closed').slice(0, 30)

  const todaySales = useMemo(() => {
    if (!sales) return 0
    const today = new Date().toISOString().split('T')[0]
    return sales
      .filter(s => s.createdAt.startsWith(today))
      .reduce((sum, s) => sum + s.total, 0)
  }, [sales])

  const todayCashSales = useMemo(() => {
    if (!sales) return 0
    const today = new Date().toISOString().split('T')[0]
    return sales
      .filter(s => s.createdAt.startsWith(today) && s.paymentMethod === 'cash')
      .reduce((sum, s) => sum + s.total, 0)
  }, [sales])

  const todayExpenses = useMemo(() => {
    if (!cashBook) return 0
    const today = new Date().toISOString().split('T')[0]
    return cashBook
      .filter(e => e.date.startsWith(today) && e.type === 'out')
      .reduce((sum, e) => sum + e.amount, 0)
  }, [cashBook])

  function openShift() {
    const amount = Number(initialCash)
    if (amount < 0) return toast('Montant invalide', 'warning')

    const shift: CashShift = {
      id: generateId(),
      openedAt: new Date().toISOString(),
      openedBy: useAppStore.getState().user?.id || '',
      initialCash: amount,
      expectedCash: amount,
      actualCash: 0,
      cardTotal: 0,
      mobileTotal: 0,
      bankTotal: 0,
      cashSales: 0,
      totalSales: 0,
      totalExpenses: 0,
      difference: 0,
      status: 'open',
    }

    const updated = [...shifts, shift]
    saveShifts(updated)
    setShifts(updated)
    setShowOpenModal(false)
    setInitialCash('')
    toast('Caisse ouverte avec succès', 'success')
  }

  async function closeShift() {
    if (!currentShift) return
    const actual = Number(actualCash)

    const today = new Date().toISOString().split('T')[0]
    const todaySalesData = sales?.filter(s => s.createdAt.startsWith(today)) || []
    const todayExpensesData = cashBook?.filter(e => e.date.startsWith(today) && e.type === 'out') || []

    const cashSalesSum = todaySalesData.filter(s => s.paymentMethod === 'cash').reduce((s, x) => s + x.total, 0)
    const cardSalesSum = todaySalesData.filter(s => s.paymentMethod === 'card').reduce((s, x) => s + x.total, 0)
    const mobileSalesSum = todaySalesData.filter(s => s.paymentMethod === 'mobile').reduce((s, x) => s + x.total, 0)
    const bankSalesSum = todaySalesData.filter(s => s.paymentMethod === 'bank').reduce((s, x) => s + x.total, 0)
    const totalSalesSum = todaySalesData.reduce((s, x) => s + x.total, 0)
    const expensesSum = todayExpensesData.reduce((s, e) => s + e.amount, 0)
    const expected = currentShift.initialCash + cashSalesSum - expensesSum

    const closed: CashShift = {
      ...currentShift,
      closedAt: new Date().toISOString(),
      actualCash: actual,
      expectedCash: expected,
      cashSales: cashSalesSum,
      cardTotal: cardSalesSum,
      mobileTotal: mobileSalesSum,
      bankTotal: bankSalesSum,
      totalSales: totalSalesSum,
      totalExpenses: expensesSum,
      difference: actual - expected,
      notes: closeNotes,
      status: 'closed',
    }

    const updated = shifts.map(s => s.id === currentShift.id ? closed : s)
    saveShifts(updated)
    setShifts(updated)
    setShowCloseModal(false)
    setActualCash('')
    setCloseNotes('')
    toast('Caisse fermée avec succès', 'success')
  }

  return (
    <div className="w-full h-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Gestion de Caisse</h1>
          <p className="text-surface-500 text-sm mt-1">Ouverture et fermeture des shifts</p>
        </div>
        {currentShift ? (
          <Button variant="danger" onClick={() => setShowCloseModal(true)}>
            <StopCircle className="w-4 h-4" /> Fermer la caisse
          </Button>
        ) : (
          <Button onClick={() => setShowOpenModal(true)}>
            <Play className="w-4 h-4" /> Ouvrir la caisse
          </Button>
        )}
      </div>

      {currentShift && (
        <Card className="bg-gradient-to-r from-primary-500 to-primary-700 text-on-accent">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm text-primary-100">Shift ouvert</span>
              </div>
              <p className="text-lg font-semibold">Caisse ouverte depuis {formatDateTime(currentShift.openedAt)}</p>
              <p className="text-sm text-primary-100">Fond de caisse initial: {formatCurrency(currentShift.initialCash)}</p>
            </div>
            <Banknote className="w-12 h-12 text-primary-300" />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Ventes du jour" value={formatCurrency(todaySales)} icon={<TrendingUp className="w-5 h-5" />} color="primary" />
        <StatCard title="Espèces" value={formatCurrency(todayCashSales)} icon={<DollarSign className="w-5 h-5" />} color="success" />
        <StatCard title="Dépenses" value={formatCurrency(todayExpenses)} icon={<ArrowUpDown className="w-5 h-5" />} color="warning" />
        <StatCard title="Shifts aujourd'hui" value={closedShifts.filter(s => s.closedAt?.startsWith(new Date().toISOString().split('T')[0])).length} icon={<History className="w-5 h-5" />} color="info" />
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-surface-400" />
          <h2 className="font-semibold text-surface-900">Historique des shifts</h2>
        </div>
        <div className="overflow-x-auto responsive-table">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-4 py-3">Ouverture</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase px-4 py-3">Fermeture</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-4 py-3">Initial</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-4 py-3">Ventes</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-4 py-3">Attendu</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-4 py-3">Réel</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase px-4 py-3">Écart</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {closedShifts.map(s => (
                <tr key={s.id} className="hover:bg-surface-50">
                  <td data-label="Ouverture" className="px-4 py-3 text-sm text-surface-600">{formatDateTime(s.openedAt)}</td>
                  <td data-label="Fermeture" className="px-4 py-3 text-sm text-surface-600">{s.closedAt ? formatDateTime(s.closedAt) : '-'}</td>
                  <td data-label="Initial" className="px-4 py-3 text-right text-sm font-medium">{formatCurrency(s.initialCash)}</td>
                  <td data-label="Ventes" className="px-4 py-3 text-right text-sm">{formatCurrency(s.totalSales)}</td>
                  <td data-label="Attendu" className="px-4 py-3 text-right text-sm">{formatCurrency(s.expectedCash)}</td>
                  <td data-label="Réel" className="px-4 py-3 text-right text-sm">{formatCurrency(s.actualCash)}</td>
                  <td data-label="Écart" className={`px-4 py-3 text-right text-sm font-semibold ${s.difference >= 0 ? 'text-success' : 'text-danger'}`}>
                    {s.difference >= 0 ? '+' : ''}{formatCurrency(s.difference)}
                  </td>
                  <td data-label="Statut" className="px-4 py-3 text-center">
                    <Badge variant={s.difference === 0 ? 'success' : Math.abs(s.difference) < 1000 ? 'warning' : 'danger'}>
                      {s.difference === 0 ? 'Juste' : Math.abs(s.difference) < 1000 ? 'Écart mineur' : 'Écart'}
                    </Badge>
                  </td>
                </tr>
              ))}
              {closedShifts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-sm text-surface-400">Aucun shift fermé</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showOpenModal} onClose={() => setShowOpenModal(false)} title="Ouvrir la caisse" size="sm">
        <div className="p-6 space-y-4">
          <div className="bg-surface-50 rounded-xl p-4 text-center">
            <Banknote className="w-10 h-10 text-primary-500 mx-auto mb-2" />
            <p className="text-sm text-surface-500">Entrez le fond de caisse initial</p>
          </div>
          <input
            type="number"
            value={initialCash}
            onChange={(e) => setInitialCash(e.target.value)}
            placeholder="Fond de caisse initial"
            className="w-full rounded-xl border border-surface-300 px-4 py-3 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
            min={0}
          />
          <Button className="w-full" size="lg" onClick={openShift}>
            <Play className="w-4 h-4" /> Ouvrir la caisse
          </Button>
        </div>
      </Modal>

      <Modal open={showCloseModal} onClose={() => setShowCloseModal(false)} title="Fermer la caisse" size="sm">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 bg-surface-50 rounded-xl p-4">
            <div>
              <p className="text-xs text-surface-400">Fond initial</p>
              <p className="font-semibold">{formatCurrency(currentShift?.initialCash || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Ventes espèces</p>
              <p className="font-semibold">{formatCurrency(todayCashSales)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Dépenses</p>
              <p className="font-semibold">{formatCurrency(todayExpenses)}</p>
            </div>
            <div>
              <p className="text-xs text-surface-400">Attendu</p>
              <p className="font-semibold text-primary-400">{formatCurrency((currentShift?.initialCash || 0) + todayCashSales - todayExpenses)}</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-surface-700 mb-1 block">Montant réel en caisse</label>
            <input
              type="number"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              placeholder="Comptage réel"
              className="w-full rounded-xl border border-surface-300 px-4 py-3 text-lg font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
              min={0}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-surface-700 mb-1 block">Notes (optionnel)</label>
            <textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Commentaire sur l'écart éventuel..."
              className="w-full rounded-xl border border-surface-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              rows={2}
            />
          </div>

          {actualCash && (
            <div className={`text-center p-3 rounded-xl ${Number(actualCash) - ((currentShift?.initialCash || 0) + todayCashSales - todayExpenses) === 0 ? 'bg-emerald-500/15 text-success' : 'bg-amber-500/15 text-amber-300'}`}>
              <p className="text-sm font-medium">
                Écart: {formatCurrency(Number(actualCash) - ((currentShift?.initialCash || 0) + todayCashSales - todayExpenses))}
              </p>
            </div>
          )}

          <Button className="w-full" size="lg" variant="danger" onClick={closeShift} disabled={actualCash === ''}>
            <StopCircle className="w-4 h-4" /> Fermer la caisse
          </Button>
        </div>
      </Modal>
    </div>
  )
}
