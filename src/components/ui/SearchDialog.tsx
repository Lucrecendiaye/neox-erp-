import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from '@/hooks/useLiveQuery'
import db from '@/db'
import { Search, Package, Users, Truck, FileText, X } from 'lucide-react'

interface SearchDialogProps {
  open: boolean
  onClose: () => void
}

export default function SearchDialog({ open, onClose }: SearchDialogProps) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  const allProducts = useLiveQuery(() => db.products.toArray(), [])
  const allCustomers = useLiveQuery(() => db.customers.toArray(), [])
  const allSuppliers = useLiveQuery(() => db.suppliers.toArray(), [])
  const allInvoices = useLiveQuery(() => db.invoices.toArray(), [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const q = query.toLowerCase()
  const filtered =
    q.length < 2
      ? []
      : [
          ...(allProducts || [])
            .filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q))
            .slice(0, 5)
            .map((p) => ({ label: p.name, sub: p.barcode || p.reference || '', icon: Package, route: '/products' as const, id: p.id })),
          ...(allCustomers || [])
            .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
            .slice(0, 5)
            .map((c) => ({ label: c.name, sub: c.phone, icon: Users, route: '/customers' as const, id: c.id })),
          ...(allSuppliers || [])
            .filter((s) => s.name.toLowerCase().includes(q) || s.phone.includes(q))
            .slice(0, 5)
            .map((s) => ({ label: s.name, sub: s.phone, icon: Truck, route: '/suppliers' as const, id: s.id })),
          ...(allInvoices || [])
            .filter((i) => (i.number || '').toLowerCase().includes(q) || (i.partyName || '').toLowerCase().includes(q))
            .slice(0, 5)
            .map((i) => ({ label: i.number, sub: `${i.partyName || ''} - ${i.status}`, icon: FileText, route: '/invoices' as const, id: i.id })),
        ]

  function handleSelect(item: (typeof filtered)[0]) {
    navigate(item.route)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-surface-200 w-full max-w-lg mx-4 animate-fade-in overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-surface-200">
          <Search className="w-5 h-5 text-surface-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Rechercher produits, clients, fournisseurs, factures..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 py-3.5 text-sm bg-transparent outline-none text-surface-900 placeholder:text-surface-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 rounded-md hover:bg-surface-100 text-surface-400">
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded-md bg-surface-100 text-surface-400 font-mono">ESC</kbd>
        </div>

        {q.length >= 2 && (
          <div className="max-h-72 overflow-y-auto p-2 space-y-0.5">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-surface-400">Aucun résultat</div>
            ) : (
              filtered.map((item, i) => (
                <button
                  key={`${item.route}-${item.id}-${i}`}
                  onClick={() => handleSelect(item)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-primary-50 text-left transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center text-surface-500 group-hover:bg-primary-100 group-hover:text-primary-600 transition-colors">
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-900 truncate">{item.label}</p>
                    {item.sub && <p className="text-xs text-surface-400 truncate">{item.sub}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {q.length > 0 && q.length < 2 && (
          <div className="text-center py-8 text-sm text-surface-400">Tapez au moins 2 caractères</div>
        )}

        {q.length === 0 && (
          <div className="p-4 text-center text-xs text-surface-400">
            Recherchez des produits, clients, fournisseurs ou factures
          </div>
        )}
      </div>
    </div>
  )
}
