import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BackendStatusChip } from './BackendStatusChip'
import { Toaster } from '@/components/Toaster'
import { UpdateNotification } from '@/components/UpdateNotification'

const isMac = typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      {isMac && (
        <div
          className="app-drag fixed top-0 left-0 right-0 h-7 z-50 pointer-events-auto"
          style={{ paddingLeft: 70 }}
          aria-hidden="true"
        />
      )}

      <div className={isMac ? 'pt-7' : undefined}>
        <Toaster />
        <UpdateNotification />

        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 flex flex-col overflow-hidden">
            <header className="h-10 border-b border-border bg-card/40 flex items-center justify-end px-4">
              <BackendStatusChip />
            </header>
            <div className="flex-1 overflow-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
