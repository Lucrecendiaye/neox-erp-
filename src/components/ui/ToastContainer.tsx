import { useToastStore, type ToastType } from '@/stores/toastStore'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  error: <XCircle className="w-5 h-5 text-red-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
}

const bgColors: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200',
  error: 'bg-red-50 border-red-200',
  info: 'bg-blue-50 border-blue-200',
  warning: 'bg-amber-50 border-amber-200',
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-slide-up ${bgColors[toast.type]}`}
        >
          {icons[toast.type]}
          <p className="text-sm text-surface-900 flex-1">{toast.message}</p>
          <button onClick={() => removeToast(toast.id)} className="text-surface-400 hover:text-surface-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
