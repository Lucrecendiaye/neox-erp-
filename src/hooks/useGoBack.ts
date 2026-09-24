import { useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const FALLBACK = '/treasury'

/**
 * Returns a "go back" handler that returns to the real previous screen.
 * Falls back to a sensible route when there is no usable history entry
 * (happens often on mobile/PWA after install or deep-links).
 */
export function useGoBack(fallback: string = FALLBACK) {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    const idx = (window.history.state && (window.history.state as { idx?: number }).idx) ?? 0
    if (idx > 0) {
      navigate(-1)
      return
    }
    if (location.key && location.key !== 'default') {
      navigate(-1)
      return
    }
    navigate(fallback, { replace: true })
  }, [navigate, location.key, fallback])
}
