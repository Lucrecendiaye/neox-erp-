import { useAppStore } from '@/stores/appStore'

export function useBusinessId(): string {
  const currentBusiness = useAppStore((s) => s.currentBusiness)
  const user = useAppStore((s) => s.user)
  return currentBusiness?.id || user?.businessId || ''
}