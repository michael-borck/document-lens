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
          // data-tauri-drag-region is Tauri's grab-handle mechanism; the
          // .app-drag class (-webkit-app-region) is the Electron one and is
          // inert in Tauri's webview — kept only so a future Electron build
          // of this shell keeps working.
          data-tauri-drag-region
          className="app-drag fixed top-0 left-0 right-0 h-7 z-50 pointer-events-auto"
          style={{ paddingLeft: 70 }}
          aria-hidden="true"
        />
      )}

      {/* h-screen on THIS padded box (not the flex row): border-box sizing
          makes the content area 100vh minus the drag-strip padding, so the
          sidebar footer isn't pushed 28px below the window edge on macOS. */}
      <div className={isMac ? 'pt-7 h-screen' : 'h-screen'}>
        <Toaster />
        <UpdateNotification />

        <div className="flex h-full">
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
