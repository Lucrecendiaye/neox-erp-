import { useToastStore, type ToastType } from '@/stores/toastStore'

export function toast(message: string, type: ToastType = 'info') {
  useToastStore.getState().addToast(message, type)
}
