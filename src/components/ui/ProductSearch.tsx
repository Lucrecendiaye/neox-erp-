import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Package, Check, X, Barcode } from 'lucide-react'
import type { Product } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface ProductSearchProps {
  products: Product[]
  value: string
  onSelect: (productId: string) => void
  placeholder?: string
}

export default function ProductSearch({ products, value, onSelect, placeholder = 'Rechercher un produit...' }: ProductSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = products.find((p) => p.id === value)

  useEffect(() => {
    setQuery('')
    setHighlight(0)
  }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
          setOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q ? products.filter((p) => {
      return p.name.toLowerCase().includes(q)
        || (p.barcode || '').includes(q)
        || (p.reference || '').toLowerCase().includes(q)
        || (p.brand || '').toLowerCase().includes(q)
    }) : products
    return pool.slice(0, 30)
  }, [products, query])

  function commit(id: string) {
    onSelect(id)
    setOpen(false)
    setQuery('')
    setHighlight(0)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && results[highlight]) commit(results[highlight].id)
    }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative min-w-[200px]" ref={listRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selected ? selected.name : query}
          placeholder={selected ? selected.name : placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0) }}
          onFocus={() => { setOpen(true) }}
          onKeyDown={onKeyDown}
          className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-surface-300 bg-surface-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all"
        />
        {selected && (
          <button
            onClick={() => { onSelect(''); setQuery(''); setOpen(true) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-surface-200 text-surface-400 hover:text-danger"
            title="Retirer le produit"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-surface-100 border border-surface-300 rounded-xl shadow-2xl max-h-72 overflow-y-auto py-1">
          {results.map((p, i) => {
            const isSelected = p.id === value
            const q = query.trim().toLowerCase()
            const name = q && p.name.toLowerCase().includes(q) ? highlightMatch(p.name, q) : p.name
            const refMatch = q && ((p.barcode || '').includes(q) || (p.reference || '').toLowerCase().includes(q))
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => commit(p.id)}
                onMouseEnter={() => setHighlight(i)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                  i === highlight ? 'bg-primary-500/10' : '',
                  isSelected ? 'bg-primary-500/10' : '',
                ].join(' ')}
              >
                <span className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center shrink-0">
                  <Package className="w-4 h-4 text-primary-400" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium text-surface-800">{name}</span>
                  <span className="block truncate text-xs text-surface-400">
                    {formatCurrency(p.sellingPrice)}
                    {refMatch && (
                      <span className="inline-flex items-center gap-0.5 ml-1.5">
                        <Barcode className="w-3 h-3" /> {p.barcode || p.reference}
                      </span>
                    )}
                  </span>
                </span>
                {isSelected && <Check className="w-4 h-4 text-primary-400 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}

      {open && query.trim() && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-surface-100 border border-surface-300 rounded-xl shadow-2xl py-6 text-center">
          <Package className="w-8 h-8 text-surface-500 mx-auto mb-2" />
          <p className="text-sm text-surface-500">Aucun produit trouvé</p>
        </div>
      )}
    </div>
  )
}

function highlightMatch(text: string, q: string) {
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-primary-400 font-semibold">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  )
}
