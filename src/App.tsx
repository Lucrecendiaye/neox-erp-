import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ToastContainer from '@/components/ui/ToastContainer'
import AppLayout from '@/components/layout/AppLayout'
import Dashboard from '@/modules/dashboard/Dashboard'
import SettingsPage from '@/modules/settings/SettingsPage'
import LoginPage from '@/modules/auth/LoginPage'
import RegisterPage from '@/modules/auth/RegisterPage'
import LockScreen from '@/modules/lock/LockScreen'
import { useAppStore } from '@/stores/appStore'
import { initDB } from '@/db'
import { isLoggedIn, getCurrentSession, onAuthChange } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { registerSW } from '@/lib/pwa'
registerSW()

const ProductsPage = lazy(() => import('@/modules/products/ProductsPage'))
const StockPage = lazy(() => import('@/modules/stock/StockPage'))
const POSPage = lazy(() => import('@/modules/pos/POSPage'))
const CustomersPage = lazy(() => import('@/modules/customers/CustomersPage'))
const SuppliersPage = lazy(() => import('@/modules/suppliers/SuppliersPage'))
const AccountingPage = lazy(() => import('@/modules/accounting/AccountingPage'))
const CreditPage = lazy(() => import('@/modules/credit/CreditPage'))
const SupplierPaymentsPage = lazy(() => import('@/modules/payments/SupplierPaymentsPage'))
const AuditPage = lazy(() => import('@/modules/audit/AuditPage'))
const NotificationsPage = lazy(() => import('@/modules/notifications/NotificationsPage'))
const InvoicesPage = lazy(() => import('@/modules/invoices/InvoicesPage'))
const PurchasesPage = lazy(() => import('@/modules/purchases/PurchasesPage'))
const ReportsPage = lazy(() => import('@/modules/reports/ReportsPage'))
const CashBookPage = lazy(() => import('@/modules/cashbook/CashBookPage'))
const EmployeesPage = lazy(() => import('@/modules/payroll/EmployeesPage'))
const AttendancePage = lazy(() => import('@/modules/payroll/AttendancePage'))
const PayrollPage = lazy(() => import('@/modules/payroll/PayrollPage'))
const LeadsPage = lazy(() => import('@/modules/crm/LeadsPage'))
const SmsRemindersPage = lazy(() => import('@/modules/sms/SmsRemindersPage'))
const BillBookPage = lazy(() => import('@/modules/billbook/BillBookPage'))
const UsersPage = lazy(() => import('@/modules/users/UsersPage'))
const AppLockPage = lazy(() => import('@/modules/lock/AppLockPage'))
const BusinessesPage = lazy(() => import('@/modules/businesses/BusinessesPage'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session } = useAppStore()
  if (!session && !isLoggedIn()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { initialized, init, locked, setLocked, setUser, setSession } = useAppStore()
  const [error, setError] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured())

  useEffect(() => {
    initDB()
      .then(async () => {
        await init()
        if (isSupabaseConfigured()) {
          const session = await getCurrentSession()
          if (session) {
            setSession(session)
            setAuthReady(true)
          } else {
            setAuthReady(true)
          }
        } else {
          const uid = localStorage.getItem('neox-user-id')
          if (uid) {
            const u = await (await import('@/db')).default.users.get(uid)
            if (u) setUser(u)
          }
          setAuthReady(true)
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setAuthReady(true)
      })

    const unsub = onAuthChange((session) => {
      setSession(session)
      if (session?.user) {
        const u = {
          id: session.user.id,
          businessId: 'biz-default',
          name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Utilisateur',
          email: session.user.email || '',
          role: 'admin' as const,
          permissions: ['*'],
          isActive: true,
          createdAt: session.user.created_at || new Date().toISOString(),
        }
        setUser(u)
      } else {
        setUser(null)
      }
    })

    const lockEnabled = localStorage.getItem('neox-pin-enabled') === 'true'
    if (lockEnabled) setLocked(true)

    window.addEventListener('online', () => useAppStore.getState().setIsOnline(true))
    window.addEventListener('offline', () => useAppStore.getState().setIsOnline(false))
    return () => unsub.data?.unsubscribe()
  }, [])

  if (locked && initialized && isLoggedIn()) {
    return <LockScreen onUnlock={() => setLocked(false)} />
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 p-4">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 bg-danger rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-danger-200">
            <span className="text-2xl font-bold text-white">!</span>
          </div>
          <h1 className="text-xl font-bold text-surface-900">Erreur d'initialisation</h1>
          <p className="text-sm text-surface-500 mt-2 max-w-md">{error}</p>
          <button onClick={() => location.reload()} className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm">Réessayer</button>
        </div>
      </div>
    )
  }

  if (!initialized || !authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="text-center animate-fade-in">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-200">
            <span className="text-2xl font-bold text-white">N</span>
          </div>
          <h1 className="text-xl font-bold text-surface-900">NeoX ERP</h1>
          <p className="text-sm text-surface-400 mt-1">Initialisation...</p>
          <div className="mt-4 flex justify-center">
            <div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <ToastContainer />
      <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={
          <ProtectedRoute>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-surface-50"><div className="w-8 h-8 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>}>
              <AppLayout />
            </Suspense>
          </ProtectedRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/pos" element={<POSPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/accounting" element={<AccountingPage />} />
          <Route path="/credit" element={<CreditPage />} />
          <Route path="/payments" element={<SupplierPaymentsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/cashbook" element={<CashBookPage />} />
          <Route path="/payroll/employees" element={<EmployeesPage />} />
          <Route path="/payroll/attendance" element={<AttendancePage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/crm" element={<LeadsPage />} />
          <Route path="/sms" element={<SmsRemindersPage />} />
          <Route path="/billbook" element={<BillBookPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/lock" element={<AppLockPage />} />
          <Route path="/businesses" element={<BusinessesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </>
  )
}
