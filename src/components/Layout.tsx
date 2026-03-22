import { Outlet, Link, useLocation } from 'react-router-dom'
import { FolderOpen, Settings, Home, HelpCircle, Library, List, PanelLeftClose, PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { UpdateNotification } from './UpdateNotification'
import { Button } from './ui/button'

export function Layout() {
  const location = useLocation()
  const [appVersion, setAppVersion] = useState<string>('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed')
    if (saved !== null) return saved === 'true'
    // Check default setting
    const defaultSetting = localStorage.getItem('sidebarDefaultCollapsed')
    return defaultSetting === 'true'
  })

  useEffect(() => {
    window.electron?.getVersion().then(setAppVersion).catch(() => {})
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      localStorage.setItem('sidebarCollapsed', String(!prev))
      return !prev
    })
  }

  const navItems = [
    { path: '/', icon: Home, label: 'Projects' },
    { path: '/library', icon: Library, label: 'Document Library' },
    { path: '/keywords', icon: List, label: 'Keyword Lists' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/help', icon: HelpCircle, label: 'Help' },
  ]

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className={cn(
        "border-r bg-muted/30 flex flex-col transition-all duration-200",
        sidebarCollapsed ? "w-14" : "w-64"
      )}>
        {/* Logo/Title */}
        <div className={cn("border-b flex items-center", sidebarCollapsed ? "p-2 justify-center" : "p-4")}>
          <Link to="/" className="flex items-center gap-2" title="Document Lens">
            <FolderOpen className="h-6 w-6 text-primary flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-semibold text-lg">Document Lens</span>}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-md text-sm transition-colors',
                      sidebarCollapsed ? 'justify-center p-2' : 'gap-2 px-3 py-2',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {!sidebarCollapsed && item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Update notification */}
        {!sidebarCollapsed && <UpdateNotification />}

        {/* Toggle button and Version */}
        <div className={cn("border-t", sidebarCollapsed ? "p-2" : "p-4")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn("h-8 w-8", sidebarCollapsed ? "mx-auto" : "")}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          {!sidebarCollapsed && (
            <div className="mt-2 text-xs text-muted-foreground">
              Document Lens Desktop {appVersion ? `v${appVersion}` : ''}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
