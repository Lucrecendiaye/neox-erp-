import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@/providers/theme-provider'
import ToastContainer from '@/components/ui/ToastContainer'
import OfflineBanner from '@/components/ui/OfflineBanner'
import PWAInstallPrompt from '@/components/ui/PWAInstallPrompt'
import AppLayout from '@/components/layout/AppLayout'
import PermissionRoute from '@/components/layout/PermissionRoute'
import Dashboard from '@/modules/dashboard/Dashboard'
import SettingsPage from '@/modules/settings/SettingsPage'
import TrashPage from '@/modules/trash/TrashPage'
import LoginPage from '@/modules/auth/LoginPage'
import RegisterPage from '@/modules/auth/RegisterPage'
import { useAppStore, useSyncStore } from '@/stores/appStore'
import { initDB } from '@/db'
import { isLoggedIn, getCurrentSession, onAuthChange } from '@/lib/auth'
import { isSupabaseConfigured } from '@/lib/supabase'
import { registerSW } from '@/lib/pwa'
import { startNotificationEngine } from '@/engine/notifications'
import { subscribeAll } from '@/lib/realtime'
import { syncAll } from '@/lib/syncEngine'
import { scheduleAutoBackup } from '@/lib/autoBackup'
import { purgeOldRecords } from '@/lib/purgeData'
registerSW()

const ProductsPage = lazy(() => import('@/modules/products/ProductsPage'))
const ProductDetailPage = lazy(() => import('@/modules/products/ProductDetailPage'))
const POSPage = lazy(() => import('@/modules/pos/POSPage'))
const CustomersPage = lazy(() => import('@/modules/customers/CustomersPage'))
const SuppliersPage = lazy(() => import('@/modules/suppliers/SuppliersPage'))
const SupplierDetailPage = lazy(() => import('@/modules/suppliers/SupplierDetailPage'))
const SupplierPaymentsPage = lazy(() => import('@/modules/payments/SupplierPaymentsPage'))
const SalesPage = lazy(() => import('@/modules/sales/SalesPage'))
const CreditPage = lazy(() => import('@/modules/credit/CreditPage'))
const PurchasesPage = lazy(() => import('@/modules/purchases/PurchasesPage'))
const ReportsPage = lazy(() => import('@/modules/reports/ReportsPage'))
const DepotsPage = lazy(() => import('@/modules/depots/DepotsPage'))
const DepotStockPage = lazy(() => import('@/modules/depots/DepotStockPage'))
const DepotStatsPage = lazy(() => import('@/modules/depots/DepotStatsPage'))
const DepotGlobalPOSPage = lazy(() => import('@/modules/depots/DepotGlobalPOSPage'))
const DepotHistoryPage = lazy(() => import('@/modules/depots/DepotHistoryPage'))
const DepotGlobalStockPage = lazy(() => import('@/modules/depots/DepotGlobalStockPage'))
const BonSortiePage = lazy(() => import('@/modules/depots/BonSortiePage'))
const UsersPage = lazy(() => import('@/modules/users/UsersPage'))


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, initialized } = useAppStore()
  if (!initialized) return null
  if (!session && !isLoggedIn()) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { initialized, init, setUser, setSession } = useAppStore()
  const [error, setError] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured())

  const runPurge = () => {
    const bizId = useAppStore.getState().currentBusiness?.id || useAppStore.getState().user?.businessId || ''
    if (bizId) {
      purgeOldRecords(bizId).catch(e => console.error('[purge] error:', e))
    }
  }

  useEffect(() => {
    initDB()
      .then(async () => {
        await init()
        if (isSupabaseConfigured()) {
          const session = await getCurrentSession()
          if (session) setSession(session)
        } else {
          const uid = localStorage.getItem('neox-user-id')
          if (uid) {
            const u = await (await import('@/db')).default.users.get(uid)
            if (u) setUser(u)
          }
        }
        setAuthReady(true)
        runPurge()
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setAuthReady(true)
      })
    startNotificationEngine()
    if (isSupabaseConfigured()) {
      subscribeAll()
    }

    const unsub = onAuthChange(async (session) => {
      setSession(session)
      if (session?.user) {
        try {
          const { supabase } = await import('@/lib/supabase')
          const { data: profile } = await supabase.from('profiles').select('*, businesses(*)').eq('auth_user_id', session.user.id).single()
          const u = {
            id: session.user.id,
            businessId: profile?.businessId || profile?.business_id || '',
            name: profile?.name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Utilisateur',
            email: session.user.email || '',
            loginId: session.user.email || '',
            passwordHash: '',
            role: (profile?.role || 'staff') as 'admin' | 'manager' | 'staff' | 'viewer',
            permissions: profile?.permissions?.length ? profile.permissions : ['*'],
            isActive: profile?.is_active ?? true,
            isPrimaryAdmin: profile?.is_primary_admin ?? false,
            createdAt: profile?.created_at || session.user.created_at || new Date().toISOString(),
          }
          setUser(u)
          if (profile?.businesses) {
            useAppStore.getState().setCurrentBusiness({
              id: profile.businesses.id,
              name: profile.businesses.name,
              currency: profile.businesses.currency,
              currencySymbol: profile.businesses.currency_symbol,
              phone: profile.businesses.phone,
              email: profile.businesses.email,
              address: profile.businesses.address,
              taxId: profile.businesses.tax_id,
              isActive: profile.businesses.is_active,
              createdAt: profile.businesses.created_at,
            })
          }
          runPurge()
        } catch {
          setUser(null)
        }
      } else {
        setUser(null)
      }
    })

    window.addEventListener('online', () => {
      useAppStore.getState().setIsOnline(true)
      syncAll().catch(() => {})
    })
    window.addEventListener('offline', () => useAppStore.getState().setIsOnline(false))

    if (isSupabaseConfigured()) {
      syncAll().catch(() => {})
    }
    const interval = setInterval(() => {
      if (isSupabaseConfigured()) syncAll().catch(() => {})
    }, 60000)
    scheduleAutoBackup()

    return () => {
      unsub.data?.subscription.unsubscribe()
      clearInterval(interval)
    }
  }, [])

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
      <ThemeProvider>
      <OfflineBanner />
      <PWAInstallPrompt />
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
          <Route path="/products" element={<PermissionRoute module="products"><ProductsPage /></PermissionRoute>} />
          <Route path="/products/:productId" element={<PermissionRoute module="products"><ProductDetailPage /></PermissionRoute>} />
          <Route path="/pos" element={<PermissionRoute module="pos"><POSPage /></PermissionRoute>} />
          <Route path="/customers" element={<PermissionRoute module="customers"><CustomersPage /></PermissionRoute>} />
          <Route path="/suppliers" element={<PermissionRoute module="suppliers"><SuppliersPage /></PermissionRoute>} />
          <Route path="/suppliers/:supplierId" element={<PermissionRoute module="suppliers"><SupplierDetailPage /></PermissionRoute>} />
          <Route path="/payments" element={<PermissionRoute module="payments"><SupplierPaymentsPage /></PermissionRoute>} />
          <Route path="/sales" element={<PermissionRoute module="sales"><SalesPage /></PermissionRoute>} />
          <Route path="/credits" element={<PermissionRoute module="sales"><CreditPage /></PermissionRoute>} />
          <Route path="/purchases" element={<PermissionRoute module="purchases"><PurchasesPage /></PermissionRoute>} />
          <Route path="/reports" element={<PermissionRoute module="reports"><ReportsPage /></PermissionRoute>} />
          <Route path="/settings" element={<PermissionRoute module="settings"><SettingsPage /></PermissionRoute>} />
          <Route path="/depots" element={<PermissionRoute module="depots"><DepotsPage /></PermissionRoute>} />
          <Route path="/depots/stock/:locationId" element={<PermissionRoute module="depots"><DepotStockPage /></PermissionRoute>} />
          <Route path="/depots/stats/:locationId" element={<PermissionRoute module="depots"><DepotStatsPage /></PermissionRoute>} />
          <Route path="/depots/vente" element={<PermissionRoute module="depots"><DepotGlobalPOSPage /></PermissionRoute>} />
          <Route path="/depots/history/:locationId" element={<PermissionRoute module="depots"><DepotHistoryPage /></PermissionRoute>} />
          <Route path="/depots/stock-global" element={<PermissionRoute module="depots"><DepotGlobalStockPage /></PermissionRoute>} />
          <Route path="/bons-sortie" element={<PermissionRoute module="depots"><BonSortiePage /></PermissionRoute>} />
          <Route path="/users" element={<PermissionRoute module="users"><UsersPage /></PermissionRoute>} />
          <Route path="/trash" element={<TrashPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
    </>
  )
}
