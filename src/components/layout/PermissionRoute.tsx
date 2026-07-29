import { Navigate } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermission'
import type { Module, Action } from '@/lib/permissions'

interface PermissionRouteProps {
  module: Module
  action?: Action
  children: React.ReactNode
}

export default function PermissionRoute({ module, action, children }: PermissionRouteProps) {
  const { can, canAny } = usePermission()

  if (action) {
    if (!can(module, action)) return <Navigate to="/" replace />
  } else {
    if (!canAny(module)) return <Navigate to="/" replace />
  }

  return <>{children}</>
}
