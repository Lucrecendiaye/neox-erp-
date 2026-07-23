import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'

export function useLiveQuery<T>(
  query: () => T | Promise<T>,
  deps: unknown[] = []
): T | undefined {
  const [data, setData] = useState<T>()

  useEffect(() => {
    const observable = liveQuery(query)
    const sub = observable.subscribe({
      next: (result) => setData(result),
      error: (err) => console.error('useLiveQuery error:', err),
    })
    return () => sub.unsubscribe()
  }, deps)

  return data
}
