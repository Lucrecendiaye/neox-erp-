import { useState } from 'react'
import { Card, Badge, Button, Input, Select, Pagination } from '@/components/ui'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import { usePagination } from '@/hooks/usePagination'
import db from '@/db'
import { formatDateTime } from '@/lib/utils'
import { Search, History, User, FileText, ShoppingCart, DollarSign, Package, Truck, AlertTriangle } from 'lucide-react'
import { useSupabaseQuery, sb } from '@/lib/supabase-db'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { AuditLog } from '@/types'

const entityIcons: Record<string, React.ReactNode> = {
  product: <Package className="w-4 h-4" />,
  sale: <ShoppingCart className="w-4 h-4" />,
  purchase: <Truck className="w-4 h-4" />,
  invoice: <FileText className="w-4 h-4" />,
  accounting: <DollarSign className="w-4 h-4" />,
  user: <User className="w-4 h-4" />,
}

const actionColors: Record<string, 'info' | 'success' | 'danger' | 'warning'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  login: 'info',
  export: 'warning',
}

export default function AuditPage() {
  const isCloud = isSupabaseConfigured()
  const dexieLogs = useLiveQuery(() => db.auditLogs.orderBy('createdAt').reverse().limit(200).toArray(), [])
  const { data: supabaseLogs } = useSupabaseQuery<AuditLog>('audit_logs', undefined, [])
  const logs = isCloud ? (supabaseLogs || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200) : dexieLogs
  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  const filtered = logs?.filter(l => {
    if (entityFilter && l.entity !== entityFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return l.action.toLowerCase().includes(q) ||
        l.entity.toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q) ||
        l.entityId.toLowerCase().includes(q)
    }
    return true
  })
  const { paginatedItems, ...pag } = usePagination(filtered, 15)

  const entities = [...new Set(logs?.map(l => l.entity) || [])]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Journal d'audit</h1>
        <p className="text-surface-500 text-sm mt-1">{logs?.length || 0} entrées</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
        <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}
          options={entities.map(e => ({ value: e, label: e }))} placeholder="Toutes les entités" />
      </div>

      <Card padding="sm">
        <div className="space-y-1">
          {paginatedItems?.map((log) => (
            <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-surface-50 transition-colors">
              <div className="p-2 rounded-lg bg-surface-100 text-surface-500 shrink-0">
                {entityIcons[log.entity] || <History className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={actionColors[log.action] || 'default'}>{log.action}</Badge>
                  <span className="text-sm font-medium text-surface-900 capitalize">{log.entity}</span>
                  <span className="text-xs text-surface-400">{log.entityId}</span>
                </div>
                {log.details && <p className="text-sm text-surface-500 mt-0.5">{log.details}</p>}
                <p className="text-xs text-surface-400 mt-1">{formatDateTime(log.createdAt)}</p>
              </div>
            </div>
          ))}
          {filtered && filtered.length > 0 && (
            <div className="flex justify-center pt-4">
              <Pagination page={pag.page} totalPages={pag.totalPages} totalItems={pag.totalItems} onPageChange={pag.setPage} />
            </div>
          )}
          {(!filtered || filtered.length === 0) && (
            <div className="text-center py-12 text-surface-400">
              <History className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">Aucune entrée d'audit</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
