import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileBottomNav from './MobileBottomNav'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'

export default function AppLayout() {
  const { sidebarOpen } = useAppStore()

  return (
    <div className="h-screen w-screen flex overflow-hidden safe-area-top" style={{ background: 'var(--surface-50)' }}>
      <Sidebar />
      <div className={cn(
        'hidden lg:block shrink-0 transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-20'
      )} />
      <div className="flex flex-col flex-1 min-w-0 w-full transition-all duration-300">
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in min-h-0 pb-20 lg:pb-6">
          <Outlet />
        </main>
        <MobileBottomNav />
      </div>
    </div>
  )
}
