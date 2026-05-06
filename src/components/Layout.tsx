import { Outlet, Link, useLocation } from 'react-router-dom'
import { Settings, Home, HelpCircle, Library, List, PanelLeftClose, PanelLeft } from 'lucide-react'
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
    { path: '/library', icon: Library, label: 'Library' },
    { path: '/keywords', icon: List, label: 'Keyword Lists' },
    { path: '/settings', icon: Settings, label: 'Settings' },
    { path: '/help', icon: HelpCircle, label: 'Help' },
  ]

  return (
    <div className="flex h-screen">
      {/* Masthead sidebar */}
      <aside className={cn(
        "border-r border-border bg-card/60 backdrop-blur-[2px] flex flex-col transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-64"
      )}>
        {/* Wordmark */}
        <div className={cn(
          "flex items-center border-b border-border",
          sidebarCollapsed ? "p-3 justify-center h-[88px]" : "px-6 py-6 h-[88px]"
        )}>
          <Link to="/" className="block group" title="Document Lens">
            {sidebarCollapsed ? (
              <span className="font-display text-3xl font-semibold leading-none text-foreground group-hover:text-primary transition-colors">
                D<span className="text-primary">L</span>
              </span>
            ) : (
              <div>
                <div className="font-display text-2xl font-semibold leading-none tracking-tight text-foreground">
                  Document <span className="italic text-primary">Lens</span>
                </div>
                <div className="label-masthead mt-2">A Reading Instrument</div>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1", sidebarCollapsed ? "p-2" : "px-3 py-5")}>
          {!sidebarCollapsed && (
            <div className="label-masthead px-3 mb-3">Navigation</div>
          )}
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      'relative flex items-center text-sm transition-colors group',
                      sidebarCollapsed ? 'justify-center p-2.5 rounded-sm' : 'gap-3 pl-5 pr-3 py-2.5',
                      isActive
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {/* Active left-bar — the oxblood masthead rule */}
                    {isActive && !sidebarCollapsed && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary" />
                    )}
                    {isActive && sidebarCollapsed && (
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary" />
                    )}
                    <Icon className={cn(
                      "h-[18px] w-[18px] flex-shrink-0 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground/70 group-hover:text-foreground"
                    )} />
                    {!sidebarCollapsed && (
                      <span className={cn(
                        isActive && "tracking-tight"
                      )}>{item.label}</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {!sidebarCollapsed && <UpdateNotification />}

        {/* Footer */}
        <div className={cn(
          "border-t border-border",
          sidebarCollapsed ? "p-2" : "px-6 py-4"
        )}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={cn("h-8 w-8", sidebarCollapsed ? "mx-auto" : "-ml-2")}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          {!sidebarCollapsed && (
            <div className="mt-3 font-mono text-[10px] tracking-wide text-muted-foreground/80 tabular">
              VOL. {appVersion || '—'} · MMXXVI
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
