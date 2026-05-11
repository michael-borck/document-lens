import { NavLink } from 'react-router-dom'
import { FolderOpen, Library, Tag, Layers, Settings as SettingsIcon, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: typeof FolderOpen
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Projects', icon: FolderOpen },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/keywords', label: 'Keywords', icon: Tag },
  { to: '/lenses', label: 'Lenses', icon: Layers },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/help', label: 'Help', icon: HelpCircle },
]

export function Sidebar() {
  return (
    <nav
      aria-label="Primary"
      className="w-56 shrink-0 border-r border-border bg-card flex flex-col"
    >
      <div className="px-4 py-5 border-b border-border">
        <div className="font-display text-lg font-semibold tracking-tight">
          Document Lens
        </div>
      </div>
      <ul className="flex-1 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                  'hover:bg-muted/60',
                  isActive && 'bg-muted font-medium'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
