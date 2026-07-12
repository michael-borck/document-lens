import { NavLink, useParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { WORKFLOW_GROUPS } from './workflows'

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
      className="flex items-stretch border-b border-border bg-background overflow-x-auto"
    >
      {WORKFLOW_GROUPS.map((group, i) => (
        <div
          key={group.label ?? 'core'}
          // Phase names live on the Overview cards; in the strip a quiet
          // divider is enough — inline uppercase labels read as extra tabs.
          title={group.label ? `${group.label} — ${group.description ?? ''}` : undefined}
          className={cn('flex items-stretch', i > 0 && 'border-l border-border ml-1.5 pl-1.5')}
        >
          {group.workflows.map(({ to, label, requiresSetup }) => {
            const disabled = requiresSetup && !setupComplete
            if (disabled) {
              return (
                <span
                  key={to}
                  aria-disabled="true"
                  className="px-3 py-2.5 text-sm text-muted-foreground/50 cursor-not-allowed select-none"
                  title="Add a keyword list and a scoring rule on the Setup tab to unlock this workflow"
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
                    'px-3 py-2.5 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap',
                    'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                    isActive && 'border-foreground text-foreground font-medium'
                  )
                }
              >
                {label}
              </NavLink>
            )
          })}
        </div>
      ))}
      {!setupComplete && (
        // Visible hint — tooltips on the disabled tabs don't reach keyboard or
        // touch users, so spell out what unlocks the workflows.
        <span className="ml-auto self-center pl-4 pr-4 py-2.5 text-xs italic text-muted-foreground/70 whitespace-nowrap">
          Add a keyword list + scoring rule in Setup to unlock these
        </span>
      )}
    </nav>
  )
}
