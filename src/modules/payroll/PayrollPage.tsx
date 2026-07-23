import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Select, Badge, StatCard, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { generateId, formatCurrency, formatDate } from '@/lib/utils'
import type { Payroll, Employee, Attendance } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Wallet, DollarSign, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { toast } from '@/lib/toast'

const statusVariant: Record<string, 'default' | 'success' | 'danger'> = {
  draft: 'default',
  paid: 'success',
  cancelled: 'danger',
}

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  paid: 'Payé',
  cancelled: 'Annulé',
}

export default function PayrollPage() {
  const isCloud = isSupabaseConfigured()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [generating, setGenerating] = useState(false)

  const dexieEmployees = useLiveQuery(() => db.employees.filter(e => e.status === 'active').toArray(), [])
  const { data: supabaseEmployeesAll } = useSupabaseQuery<Employee>('employees', undefined, [])
  const employees = isCloud ? (supabaseEmployeesAll || []).filter(e => e.status === 'active') : dexieEmployees
  const dexiePayrolls = useLiveQuery(() => db.payrolls.toArray(), [])
  const { data: supabasePayrolls } = useSupabaseQuery<Payroll>('payrolls', undefined, [])
  const payrolls = isCloud ? supabasePayrolls : dexiePayrolls
  const dexieAllAttendance = useLiveQuery(() => db.attendance.toArray(), [])
  const { data: supabaseAllAttendance } = useSupabaseQuery<Attendance>('attendance', undefined, [])
  const allAttendance = isCloud ? supabaseAllAttendance : dexieAllAttendance

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  const periodEnd = new Date(year, month, 0).toISOString().split('T')[0]

  const filteredPayrolls = useMemo(() =>
    payrolls?.filter(p => p.periodStart.startsWith(`${year}-${String(month).padStart(2, '0')}`)),
  [payrolls, month, year])

  const { paginatedItems, ...pag } = usePagination(filteredPayrolls)

  const summary = useMemo(() => {
    if (!filteredPayrolls) return { total: 0, paid: 0, draft: 0 }
    return {
      total: filteredPayrolls.reduce((s, p) => s + p.netSalary, 0),
      paid: filteredPayrolls.filter(p => p.status === 'paid').reduce((s, p) => s + p.netSalary, 0),
      draft: filteredPayrolls.filter(p => p.status === 'draft').reduce((s, p) => s + p.netSalary, 0),
    }
  }, [filteredPayrolls])

  function getWorkingDays(): number {
    const days = new Date(year, month, 0).getDate()
    let working = 0
    for (let d = 1; d <= days; d++) {
      const day = new Date(year, month - 1, d).getDay()
      if (day !== 0 && day !== 6) working++
    }
    return working
  }

  function getDaysWorked(employeeId: string): number {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const employeeAttendance = allAttendance?.filter(
      a => a.employeeId === employeeId && a.date >= start && a.date <= periodEnd
    ) || []
    return employeeAttendance.filter(a => a.status === 'present' || a.status === 'late' || a.status === 'half-day').length
  }

  async function generatePayroll() {
    if (!employees || employees.length === 0) {
      toast('Aucun employé actif', 'error')
      return
    }
    setGenerating(true)
    try {
      const existing = filteredPayrolls || []
      const existingEmployeeIds = new Set(existing.map(p => p.employeeId))
      const workingDays = getWorkingDays()
      const nowStr = new Date().toISOString()

      const toCreate: Payroll[] = []
      for (const emp of employees) {
        if (existingEmployeeIds.has(emp.id)) continue
        const daysWorked = getDaysWorked(emp.id)
        let baseSalary = emp.salary
        if (emp.salaryType === 'daily') {
          baseSalary = emp.salary * daysWorked
        } else if (emp.salaryType === 'hourly') {
          baseSalary = emp.salary * daysWorked * 8
        }
        const allowances = Math.round(baseSalary * 0.1)
        const deductions = Math.round(baseSalary * 0.05)
        const bonus = 0
        const netSalary = baseSalary + allowances + bonus - deductions

        toCreate.push({
          id: generateId(),
          businessId: 'biz-default',
          employeeId: emp.id,
          employeeName: emp.name,
          periodStart,
          periodEnd,
          baseSalary,
          allowances,
          deductions,
          bonus,
          netSalary,
          daysWorked,
          status: 'draft',
          createdAt: nowStr,
          userId: 'admin',
        })
      }

      if (toCreate.length > 0) {
        if (isCloud) { await Promise.all(toCreate.map(p => sb.insert('payrolls', p))) } else { await db.payrolls.bulkAdd(toCreate) }
        toast(`${toCreate.length} fiches de paie générées`, 'success')
      } else {
        toast('Toutes les fiches existent déjà', 'info')
      }
    } catch { toast('Erreur lors de la génération', 'error') }
    finally { setGenerating(false) }
  }

  async function updateStatus(id: string, status: 'paid' | 'cancelled') {
    try {
      if (isCloud) { await sb.update('payrolls', id, { status, paidAt: status === 'paid' ? new Date().toISOString() : undefined }) } else { await db.payrolls.update(id, { status, paidAt: status === 'paid' ? new Date().toISOString() : undefined }) }
      toast(`Fiche ${status === 'paid' ? 'payée' : 'annulée'}`, 'success')
    } catch { toast('Erreur lors de la mise à jour', 'error') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Paie</h1>
        <p className="text-surface-500 text-sm mt-1">Gérez les fiches de paie</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total paie" value={formatCurrency(summary.total)} icon={<Wallet className="w-5 h-5" />} color="primary" />
        <StatCard title="Montant payé" value={formatCurrency(summary.paid)} icon={<CheckCircle className="w-5 h-5" />} color="success" />
        <StatCard title="En attente" value={formatCurrency(summary.draft)} icon={<RefreshCw className="w-5 h-5" />} color="warning" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-40">
            <Select
              value={String(month)}
              onChange={(e) => setMonth(+e.target.value)}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: new Date(2000, i, 1).toLocaleDateString('fr-FR', { month: 'long' }),
              }))}
            />
          </div>
          <div className="w-32">
            <Select
              value={String(year)}
              onChange={(e) => setYear(+e.target.value)}
              options={Array.from({ length: 5 }, (_, i) => ({
                value: String(year - 2 + i),
                label: String(year - 2 + i),
              }))}
            />
          </div>
        </div>
        <Button onClick={generatePayroll} loading={generating}>
          <DollarSign className="w-4 h-4" /> Générer la paie
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Employé</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Salaire base</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Primes</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Retenues</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Bonus</th>
                <th className="text-right text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Net</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Jours</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Statut</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {paginatedItems?.map((p) => (
                <tr key={p.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-surface-900">{p.employeeName}</p>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(p.baseSalary)}</td>
                  <td className="px-6 py-4 text-right text-sm text-success">{formatCurrency(p.allowances)}</td>
                  <td className="px-6 py-4 text-right text-sm text-danger">{formatCurrency(p.deductions)}</td>
                  <td className="px-6 py-4 text-right text-sm text-surface-600">{formatCurrency(p.bonus)}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-surface-900">{formatCurrency(p.netSalary)}</td>
                  <td className="px-6 py-4 text-center text-sm text-surface-600">{p.daysWorked}</td>
                  <td className="px-6 py-4 text-center">
                    <Badge variant={statusVariant[p.status] || 'default'}>{statusLabels[p.status]}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1">
                      {p.status === 'draft' && (
                        <>
                          <button onClick={() => updateStatus(p.id, 'paid')} className="p-2 rounded-lg hover:bg-emerald-50 text-surface-400 hover:text-success transition-colors" title="Marquer payé">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => updateStatus(p.id, 'cancelled')} className="p-2 rounded-lg hover:bg-red-50 text-surface-400 hover:text-danger transition-colors" title="Annuler">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {p.status === 'paid' && (
                        <span className="text-xs text-surface-400">Payé le {p.paidAt ? formatDate(p.paidAt) : ''}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(!filteredPayrolls || filteredPayrolls.length === 0) && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-surface-400 text-sm">
                    Aucune fiche de paie pour cette période
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
      </Card>
    </div>
  )
}
