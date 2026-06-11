import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/stores/toastStore'
import type { BackendStatus } from '@/types/electron'

type Phase = 'checking' | 'starting' | 'ready' | 'unreachable' | 'crashed'

interface ChipState {
  phase: Phase
  mode?: BackendStatus['mode']
  lastError?: string
}

// Plain language, and only when there is something to say: a healthy engine
// is invisible (researchers shouldn't have to parse infrastructure status);
// the chip appears only while starting or when something needs attention.
const PHASE_CONFIG: Record<Exclude<Phase, 'checking'>, { label: string; dot: string }> = {
  starting: { label: 'Analysis engine starting…', dot: 'bg-yellow-500 animate-pulse' },
  ready: { label: '', dot: 'bg-green-600' },
  unreachable: { label: 'Analysis engine offline', dot: 'bg-yellow-600' },
  crashed: { label: 'Analysis engine offline', dot: 'bg-red-600' },
}

export function BackendStatusChip() {
  const [state, setState] = useState<ChipState>({ phase: 'checking' })
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    const unsubscribe = window.electron?.onBackendStatusChanged?.((s) => {
      setState({ phase: s.phase as Phase, mode: s.mode, lastError: s.lastError })
    })
    window.electron?.getBackendStatus?.().then((s) => {
      setState({ phase: s.phase as Phase, mode: s.mode, lastError: s.lastError })
    }).catch(() => setState({ phase: 'unreachable' }))
    return () => unsubscribe?.()
  }, [])

  const handleRestart = async () => {
    setRestarting(true)
    try {
      const res = await window.electron?.restartBackend?.()
      if (res && !res.success) {
        toast.error('Could not restart the analysis engine', res.error)
      } else {
        toast.success('Restarting the analysis engine…')
      }
    } catch (err) {
      toast.error(
        'Could not restart the analysis engine',
        err instanceof Error ? err.message : String(err)
      )
    } finally {
      setRestarting(false)
    }
  }

  // Nothing to report: a transient startup check, or a healthy engine.
  // Failures elsewhere (import, audit) surface their own errors and the chip
  // reappears the moment the engine is actually down.
  if (state.phase === 'checking' || state.phase === 'ready') {
    return null
  }

  const cfg = PHASE_CONFIG[state.phase]
  // When the engine is down, the chip becomes a button that restarts it in
  // place — so users don't have to hunt for the control in Settings after an
  // analysis fails. (The status indicator is the thing error messages point at.)
  const recoverable = state.phase === 'crashed' || state.phase === 'unreachable'

  if (recoverable) {
    return (
      <button
        type="button"
        onClick={handleRestart}
        disabled={restarting}
        title={state.lastError ? `${state.lastError} — click to restart` : 'Click to restart the analysis engine'}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground rounded px-1 py-0.5 hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-60"
      >
        {restarting ? (
          <RotateCw className="h-3 w-3 animate-spin" />
        ) : (
          <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
        )}
        {restarting ? 'Restarting' : cfg.label}
        {!restarting && <RotateCw className="h-3 w-3 opacity-70" />}
      </button>
    )
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={state.lastError ?? undefined}
    >
      <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}
