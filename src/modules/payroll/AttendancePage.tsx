import { useState, useMemo } from 'react'
import { Card, CardHeader, CardTitle, Button, Select, Modal, Badge, StatCard } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { generateId, formatDate } from '@/lib/utils'
import type { Attendance, Employee } from '@/types'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Calendar, CheckCheck, X, Clock, Sun, Moon, Users } from 'lucide-react'
import { toast } from '@/lib/toast'

type AttendanceStatus = 'present' | 'absent' | 'late' | 'half-day' | 'leave'

const statusLabels: Record<AttendanceStatus, string> = {
  present: 'Présent',
  absent: 'Absent',
  late: 'En retard',
  'half-day': 'Demi-journée',
  leave: 'Congé',
}

const statusVariants: Record<AttendanceStatus, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  'half-day': 'info',
  leave: 'default',
}

const statusIcons: Record<AttendanceStatus, React.ReactNode> = {
  present: <CheckCheck className="w-4 h-4" />,
  absent: <X className="w-4 h-4" />,
  late: <Clock className="w-4 h-4" />,
  'half-day': <Sun className="w-4 h-4" />,
  leave: <Moon className="w-4 h-4" />,
}

export default function AttendancePage() {
  const isCloud = isSupabaseConfigured()
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const dexieEmployees = useLiveQuery(() => db.employees.filter(e => e.status === 'active').toArray(), [])
  const { data: supabaseEmployeesAll } = useSupabaseQuery<Employee>('employees', undefined, [])
  const employees = isCloud ? (supabaseEmployeesAll || []).filter(e => e.status === 'active') : dexieEmployees
  const dexieAttendanceRecords = useLiveQuery(() => db.attendance.filter(a => a.date === date).toArray(), [date])
  const { data: supabaseAttendanceAll } = useSupabaseQuery<Attendance>('attendance', undefined, [])
  const attendanceRecords = isCloud ? (supabaseAttendanceAll || []).filter(a => a.date === date) : dexieAttendanceRecords

  const attendanceMap = useMemo(() => {
    const map = new Map<string, Attendance>()
    attendanceRecords?.forEach(a => map.set(a.employeeId, a))
    return map
  }, [attendanceRecords])

  const summary = useMemo(() => {
    if (!attendanceRecords) return { present: 0, absent: 0, late: 0, halfDay: 0, leave: 0 }
    return {
      present: attendanceRecords.filter(a => a.status === 'present').length,
      absent: attendanceRecords.filter(a => a.status === 'absent').length,
      late: attendanceRecords.filter(a => a.status === 'late').length,
      halfDay: attendanceRecords.filter(a => a.status === 'half-day').length,
      leave: attendanceRecords.filter(a => a.status === 'leave').length,
    }
  }, [attendanceRecords])

  async function setAttendance(employeeId: string, status: AttendanceStatus) {
    const existing = attendanceMap.get(employeeId)
    const now = new Date().toISOString()
    try {
      if (existing) {
        if (existing.status === status) {
          toast('Statut inchangé', 'info')
          return
        }
        if (isCloud) { await sb.update('attendance', existing.id, { status }) } else { await db.attendance.update(existing.id, { status }) }
      } else {
        if (isCloud) { await sb.insert('attendance', { id: generateId(), businessId: 'biz-default', employeeId, date, checkIn: now, status, createdAt: now }) } else { await db.attendance.add({ id: generateId(), businessId: 'biz-default', employeeId, date, checkIn: now, status, createdAt: now }) }
      }
      toast(`Statut mis à jour : ${statusLabels[status]}`, 'success')
    } catch { toast("Erreur lors de l'enregistrement", 'error') }
  }

  async function markAllPresent() {
    if (!employees) return
    const now = new Date().toISOString()
    try {
      await Promise.all(employees.map(async (e) => {
        const existing = attendanceMap.get(e.id)
        if (existing) {
          if (existing.status !== 'present') {
            if (isCloud) { await sb.update('attendance', existing.id, { status: 'present' }) } else { await db.attendance.update(existing.id, { status: 'present' }) }
          }
        } else {
          if (isCloud) { await sb.insert('attendance', { id: generateId(), businessId: 'biz-default', employeeId: e.id, date, checkIn: now, status: 'present', createdAt: now }) } else { await db.attendance.add({ id: generateId(), businessId: 'biz-default', employeeId: e.id, date, checkIn: now, status: 'present', createdAt: now }) }
        }
      }))
      toast('Tous marqués présents', 'success')
    } catch { toast('Erreur lors de l\'opération', 'error') }
  }

  async function clearAll() {
    if (!attendanceRecords || attendanceRecords.length === 0) return
    if (!confirm('Effacer toutes les présences pour cette date ?')) return
    try {
      await Promise.all(attendanceRecords.map(a => isCloud ? sb.remove('attendance', a.id) : db.attendance.delete(a.id)))
      toast('Présences effacées', 'success')
    } catch { toast('Erreur lors de l\'opération', 'error') }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Présences</h1>
        <p className="text-surface-500 text-sm mt-1">Gérez les présences du personnel</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <StatCard title="Présents" value={summary.present} icon={<CheckCheck className="w-5 h-5" />} color="success" />
        <StatCard title="Absents" value={summary.absent} icon={<X className="w-5 h-5" />} color="danger" />
        <StatCard title="Retards" value={summary.late} icon={<Clock className="w-5 h-5" />} color="warning" />
        <StatCard title="Demi-journée" value={summary.halfDay} icon={<Sun className="w-5 h-5" />} color="info" />
        <StatCard title="Congés" value={summary.leave} icon={<Moon className="w-5 h-5" />} color="primary" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
            <input
              type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <Button variant="outline" onClick={() => setDate(today)}>
            Aujourd'hui
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={markAllPresent}>
            <CheckCheck className="w-4 h-4" /> Tout présent
          </Button>
          <Button variant="ghost" onClick={clearAll}>
            Effacer
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Employé</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Poste</th>
                <th className="text-left text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Statut</th>
                <th className="text-center text-xs font-semibold text-surface-500 uppercase tracking-wider px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {employees?.map((e) => {
                const att = attendanceMap.get(e.id)
                return (
                  <tr key={e.id} className="hover:bg-surface-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 overflow-hidden">
                          {e.photo ? <img src={e.photo} alt="" className="w-full h-full object-cover" /> : <Users className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-surface-900">{e.name}</p>
                          <p className="text-xs text-surface-400">{e.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-surface-600">{e.position}</span>
                    </td>
                    <td className="px-6 py-4">
                      {att ? (
                        <Badge variant={statusVariants[att.status]}>
                          {statusLabels[att.status]}
                        </Badge>
                      ) : (
                        <span className="text-sm text-surface-400">Non défini</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {(Object.keys(statusLabels) as AttendanceStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => setAttendance(e.id, s)}
                            className={`p-2 rounded-lg transition-colors ${
                              att?.status === s
                                ? 'bg-primary-100 text-primary-700'
                                : 'text-surface-400 hover:bg-surface-100'
                            }`}
                            title={statusLabels[s]}
                          >
                            {statusIcons[s]}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {(!employees || employees.length === 0) && (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-surface-400 text-sm">
                    Aucun employé actif
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
