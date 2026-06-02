import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared inline loading affordance — a spinner plus a short label. Replaces the
 * bare "Loading…" text scattered across pages so async waits look consistent
 * with the rest of the app (PageLoader, BackendStatusChip, etc.).
 */
export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground',
        className
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}
