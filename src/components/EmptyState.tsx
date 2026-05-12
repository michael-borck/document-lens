import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  /** A short headline phrased as a state ("No projects yet"). */
  title: string
  /** One-sentence guidance explaining what to do next. */
  description?: ReactNode
  /** Optional icon element rendered above the title. */
  icon?: ReactNode
  /** Optional CTA — typically a Button. */
  action?: ReactNode
  className?: string
}

/**
 * Reusable empty-state surface. Used wherever a list/table/chart has no
 * data yet — projects list before first project, setup section before a
 * keyword list is picked, etc. Keeps the user oriented instead of
 * staring at a blank panel.
 */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center px-6 py-12', className)}>
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="font-display text-lg font-medium">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground max-w-md">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
