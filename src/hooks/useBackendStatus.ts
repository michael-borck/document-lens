/**
 * Live backend status for gating backend-dependent actions (import,
 * re-extraction, semantic analysis).
 *
 * Push-driven, not polled: the main process emits `backend:status-changed`
 * on every phase transition, so a disabled button enables itself the moment
 * the engine reports ready — no refresh needed. One initial fetch covers
 * mounting after the phase already settled.
 *
 * Outside Electron (unit tests, plain-browser dev) there is no backend
 * lifecycle to wait on, so the hook reports ready rather than freezing the
 * UI in a permanently disabled state.
 */

import { useEffect, useState } from 'react'
import type { BackendStatus } from '@/types/electron'

export interface BackendGate {
  /** Full status, when known. */
  status: BackendStatus | null
  /** True when backend-dependent actions should be enabled. */
  ready: boolean
  /** Plain-language hint for a disabled control, or undefined when ready. */
  disabledReason: string | undefined
}

export function useBackendStatus(): BackendGate {
  const [status, setStatus] = useState<BackendStatus | null>(null)

  useEffect(() => {
    if (!window.electron?.getBackendStatus) return
    let mounted = true
    window.electron.getBackendStatus().then((s) => {
      if (mounted) setStatus(s)
    }).catch(() => {})
    const unsubscribe = window.electron.onBackendStatusChanged?.((s) => setStatus(s))
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  const inElectron = typeof window !== 'undefined' && !!window.electron?.getBackendStatus
  const phase = status?.phase
  const ready = !inElectron || phase === 'ready'

  let disabledReason: string | undefined
  if (!ready) {
    disabledReason =
      phase === 'crashed' || phase === 'unreachable'
        ? 'The analysis engine is offline — restart it from the indicator at the top of the window.'
        : 'The analysis engine is starting up — this enables automatically when it\'s ready.'
  }

  return { status, ready, disabledReason }
}
