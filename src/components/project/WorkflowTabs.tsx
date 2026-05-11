import { NavLink, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface WorkflowTab {
  to: string
  label: string
  /** When true, the tab is unavailable until project setup is complete. */
  requiresSetup?: boolean
}

const TABS: WorkflowTab[] = [
  { to: 'setup', label: 'Setup' },
  { to: 'coverage', label: 'Coverage', requiresSetup: true },
  { to: 'map', label: 'Map', requiresSetup: true },
  { to: 'score', label: 'Score', requiresSetup: true },
  { to: 'track', label: 'Track', requiresSetup: true },
  { to: 'compare', label: 'Compare', requiresSetup: true },
  { to: 'audit', label: 'Audit', requiresSetup: true },
  { to: 'discover', label: 'Discover', requiresSetup: true },
  { to: 'read', label: 'Read', requiresSetup: true },
]

interface WorkflowTabsProps {
  /** When false, all setup-requiring tabs render disabled. */
  setupComplete?: boolean
}

export function WorkflowTabs({ setupComplete = false }: WorkflowTabsProps) {
  const { projectId } = useParams<{ projectId: string }>()
  if (!projectId) return null

  return (
    <nav
      aria-label="Workflows"
      className="flex border-b border-border bg-background overflow-x-auto"
    >
      {TABS.map(({ to, label, requiresSetup }) => {
        const disabled = requiresSetup && !setupComplete
        if (disabled) {
          return (
            <span
              key={to}
              className="px-4 py-2.5 text-sm text-muted-foreground/50 cursor-not-allowed select-none"
              title="Complete Setup to enable this workflow"
            >
              {label}
            </span>
          )
        }
        return (
          <NavLink
            key={to}
            to={`/projects/${projectId}/${to}`}
            className={({ isActive }) =>
              cn(
                'px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px',
                'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                isActive && 'border-foreground text-foreground font-medium'
              )
            }
          >
            {label}
          </NavLink>
        )
      })}
    </nav>
  )
}
