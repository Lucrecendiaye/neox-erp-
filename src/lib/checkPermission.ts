import { useAppStore } from '@/stores/appStore'
import type { Module, Action } from './permissions'

export function requirePermission(module: Module, action: Action): void {
  const user = useAppStore.getState().user
  if (!user) throw new Error('Non authentifié')

  const permissions = user.permissions || []
  if (permissions.includes('*')) return

  if (!permissions.includes(`${module}:${action}`)) {
    throw new Error(`Permission refusée: ${module}:${action}`)
  }
}

export function checkBusinessAccess(businessId: string): void {
  const user = useAppStore.getState().user
  if (!user) throw new Error('Non authentifié')
  if (user.businessId !== businessId) {
    throw new Error('Accès interdit: cette boutique ne vous appartient pas')
  }
}
