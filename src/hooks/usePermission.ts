import { useAppStore } from '@/stores/appStore'
import { hasPermission, hasAnyModulePermission, isAdmin, type Module, type Action } from '@/lib/permissions'

export function usePermission() {
  const user = useAppStore(s => s.user)
  const permissions = user?.permissions ?? []

  const can = (module: Module, action: Action): boolean => {
    return hasPermission(permissions, module, action)
  }

  const canAny = (module: Module): boolean => {
    return hasAnyModulePermission(permissions, module)
  }

  const isAdminUser = (): boolean => {
    return isAdmin(permissions)
  }

  return { can, canAny, isAdmin: isAdminUser, permissions, user }
}
