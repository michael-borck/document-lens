import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The run lifecycle every workflow page hand-rolled: running / error / result
 * state, try-catch-finally, clear-before-run, and cancel-safety so a stale or
 * unmounted run never commits state. Previously only Gap had the cancel guard;
 * here it lives once for all pages.
 *
 *   const { run, running, error, result } = useAnalysis(() => computeCoverage(...))
 *   // auto-run on dependency change (Gap, Read):
 *   useAnalysis(() => computeGap(...), [vm.project.id, reference])
 *   // progress (Audit, Discover):
 *   useAnalysis(({ onProgress }) => runAudit(..., onProgress))
 *
 * `fn` receives a run context: `onProgress(0..1|number)` reports progress, and
 * `cancelled()` lets long loops bail when superseded. `fn` closes over current
 * page state (React idiom), so `run` takes no arguments.
 */
export interface AnalysisRun {
  onProgress: (value: number) => void
  /** True once this run has been superseded or the component unmounted. */
  cancelled: () => boolean
}

export interface UseAnalysis<T> {
  run: () => Promise<void>
  running: boolean
  error: string | null
  result: T | null
  progress: number | null
  reset: () => void
}

export function useAnalysis<T>(
  fn: (run: AnalysisRun) => Promise<T>,
  /** When provided, the analysis auto-runs on mount and whenever these change. */
  deps?: React.DependencyList
): UseAnalysis<T> {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<T | null>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const runIdRef = useRef(0)
  const mountedRef = useRef(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const myId = ++runIdRef.current
    const isCurrent = () => mountedRef.current && runIdRef.current === myId
    setRunning(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const out = await fnRef.current({
        onProgress: (value) => {
          if (isCurrent()) setProgress(value)
        },
        cancelled: () => !isCurrent(),
      })
      if (isCurrent()) setResult(out)
    } catch (err) {
      if (isCurrent()) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (isCurrent()) setRunning(false)
    }
  }, [])

  const reset = useCallback(() => {
    runIdRef.current++ // supersede any in-flight run
    setRunning(false)
    setError(null)
    setResult(null)
    setProgress(null)
  }, [])

  // Auto-run on the caller-provided dependency list (`run` is stable, so it's
  // not in the array). When no deps are given the analysis is manual: we pass
  // `deps ?? []` rather than `deps` so the effect runs once on mount and then
  // no-ops — passing a bare `undefined` would be the "no dependency array"
  // form, which re-fires the effect on EVERY render. A deps change re-runs and
  // supersedes any in-flight run via runIdRef (see `run`).
  useEffect(() => {
    if (deps === undefined) return
    void run()
  }, deps ?? [])

  return { run, running, error, result, progress, reset }
}
