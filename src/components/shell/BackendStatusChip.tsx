import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BackendStatus } from '@/types/electron'

type Phase = 'checking' | 'starting' | 'ready' | 'unreachable' | 'crashed'

interface ChipState {
  phase: Phase
  mode?: BackendStatus['mode']
  lastError?: string
}

const PHASE_CONFIG: Record<Exclude<Phase, 'checking'>, { label: string; dot: string }> = {
  starting: { label: 'Starting', dot: 'bg-yellow-500 animate-pulse' },
  ready: { label: 'Ready', dot: 'bg-green-600' },
  unreachable: { label: 'Unreachable', dot: 'bg-yellow-600' },
  crashed: { label: 'Offline', dot: 'bg-red-600' },
}

export function BackendStatusChip() {
  const [state, setState] = useState<ChipState>({ phase: 'checking' })

  useEffect(() => {
    const unsubscribe = window.electron?.onBackendStatusChanged?.((s) => {
      setState({ phase: s.phase as Phase, mode: s.mode, lastError: s.lastError })
    })
    window.electron?.getBackendStatus?.().then((s) => {
      setState({ phase: s.phase as Phase, mode: s.mode, lastError: s.lastError })
    }).catch(() => setState({ phase: 'unreachable' }))
    return () => unsubscribe?.()
  }, [])

  if (state.phase === 'checking') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking
      </span>
    )
  }

  const cfg = PHASE_CONFIG[state.phase]
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
