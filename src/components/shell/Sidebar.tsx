import { NavLink } from 'react-router-dom'
import { FolderOpen, Library, Tag, Layers, Settings as SettingsIcon, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: typeof FolderOpen
}

interface NavSection {
  /** Small-caps section label; null renders the items without a heading. */
  label: string | null
  items: NavItem[]
}

// Projects are where you work; Library/Keywords/Axes are assets shared
// ACROSS projects — the label makes that mental model visible up front
// instead of discovered by surprise ("why is it still in Library?").
const NAV_SECTIONS: NavSection[] = [
  { label: null, items: [{ to: '/', label: 'Projects', icon: FolderOpen }] },
  {
    label: 'Shared resources',
    items: [
      { to: '/library', label: 'Library', icon: Library },
      { to: '/keywords', label: 'Keywords', icon: Tag },
      { to: '/axes', label: 'Axes', icon: Layers },
    ],
  },
]

const FOOTER_ITEMS: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
  { to: '/help', label: 'Help', icon: HelpCircle },
]

function SidebarLink({ to, label, icon: Icon }: NavItem) {
  return (
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
  )
}

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
      <div className="flex-1 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label ?? 'main'} className="mb-1">
            {section.label && (
              <div className="px-4 pt-4 pb-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold text-muted-foreground/70 select-none">
                {section.label}
              </div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink {...item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <ul className="py-3 border-t border-border space-y-0.5">
        {FOOTER_ITEMS.map((item) => (
          <li key={item.to}>
            <SidebarLink {...item} />
          </li>
        ))}
      </ul>
    </nav>
  )
}
