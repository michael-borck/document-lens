import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * The yellow ML-caveat banner workflow pages inlined. The deep part — styling,
 * dismiss, and per-session memory keyed by `id` — lives here once; the caveat
 * copy is passed as children (it's workflow-specific text, not the component's
 * job to hold). Dismissal persists per session, not per app run (matches the
 * IA spec), via a module-level set.
 */
const dismissedThisSession = new Set<string>()

export interface MLCaveatBannerProps {
  /** Stable id per caveat (e.g. "map", "score") — keys the per-session dismiss. */
  id: string
  children: React.ReactNode
}

export function MLCaveatBanner({ id, children }: MLCaveatBannerProps) {
  const [hidden, setHidden] = useState(() => dismissedThisSession.has(id))
  if (hidden) return null

  return (
    <div className="mb-4 flex items-start gap-2 text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 leading-relaxed">
      <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          dismissedThisSession.add(id)
          setHidden(true)
        }}
        className="text-yellow-700/70 hover:text-yellow-700 shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Test-only: clear the per-session dismiss memory between cases. */
export function __resetCaveatDismissals(): void {
  dismissedThisSession.clear()
}
