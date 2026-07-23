import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'

export default function AppLayout() {
  const { sidebarOpen } = useAppStore()

  return (
    <div className="min-h-screen bg-surface-50">
      <Sidebar />
      <div className={cn(
        'transition-all duration-300',
        sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'
      )}>
        <Header />
        <main className="p-4 lg:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
