import { useState, useMemo } from 'react'

export function usePagination<T>(items: T[] | undefined, pageSize = 15) {
  const [page, setPage] = useState(1)

  const totalPages = useMemo(() => Math.max(1, Math.ceil((items?.length ?? 0) / pageSize)), [items, pageSize])

  const safePage = Math.min(page, totalPages)

  const paginatedItems = useMemo(() => {
    if (!items) return []
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  function goTo(p: number) {
    setPage(Math.max(1, Math.min(p, totalPages)))
  }

  function next() { goTo(safePage + 1) }
  function prev() { goTo(safePage - 1) }

  return {
    page: safePage,
    setPage: goTo,
    next,
    prev,
    totalPages,
    totalItems: items?.length ?? 0,
    pageSize,
    paginatedItems,
  }
}
