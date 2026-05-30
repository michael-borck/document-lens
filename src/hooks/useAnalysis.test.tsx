import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act, waitFor, cleanup } from '@testing-library/react'
import { useAnalysis } from './useAnalysis'

afterEach(cleanup)

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (err: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useAnalysis', () => {
  it('runs and stores the result', async () => {
    const { result } = renderHook(() => useAnalysis(async () => 42))
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.result).toBe(42)
    expect(result.current.running).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('captures errors and clears running', async () => {
    const { result } = renderHook(() =>
      useAnalysis(async () => {
        throw new Error('boom')
      })
    )
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.error).toBe('boom')
    expect(result.current.result).toBeNull()
    expect(result.current.running).toBe(false)
  })

  it('reports progress', async () => {
    const { result } = renderHook(() =>
      useAnalysis(async ({ onProgress }) => {
        onProgress(0.5)
        return 'done'
      })
    )
    await act(async () => {
      await result.current.run()
    })
    expect(result.current.progress).toBe(0.5)
    expect(result.current.result).toBe('done')
  })

  it('ignores a superseded run (cancel-safety)', async () => {
    const first = defer<number>()
    const second = defer<number>()
    const queue = [first, second]
    let i = 0
    const { result } = renderHook(() => useAnalysis(() => queue[i++].promise))

    // Start run #1, then run #2 before #1 settles.
    await act(async () => {
      void result.current.run()
    })
    await act(async () => {
      void result.current.run()
    })

    // Resolve the latest run first, then the stale one.
    await act(async () => {
      second.resolve(2)
      await second.promise
    })
    await act(async () => {
      first.resolve(1)
      await first.promise
    })

    expect(result.current.result).toBe(2) // stale run #1 never commits
  })

  it('auto-runs when deps change', async () => {
    let count = 0
    const { rerender } = renderHook(
      ({ d }: { d: number }) => useAnalysis(async () => ++count, [d]),
      { initialProps: { d: 1 } }
    )
    await waitFor(() => expect(count).toBe(1))
    rerender({ d: 2 })
    await waitFor(() => expect(count).toBe(2))
  })

  it('does not auto-run when no deps are given (manual mode)', async () => {
    let count = 0
    const { rerender } = renderHook(
      ({ x }: { x: number }) => {
        void x // force distinct renders
        return useAnalysis(async () => ++count)
      },
      { initialProps: { x: 1 } }
    )
    // Re-render several times; with no deps the effect must never auto-run,
    // and the manual case must not re-fire on every render.
    rerender({ x: 2 })
    rerender({ x: 3 })
    await new Promise((r) => setTimeout(r, 20))
    expect(count).toBe(0)
  })

  it('auto-runs once on mount with deps, not on unrelated re-renders', async () => {
    let count = 0
    const { rerender } = renderHook(
      ({ d }: { d: number }) => useAnalysis(async () => ++count, [d]),
      { initialProps: { d: 5 } }
    )
    await waitFor(() => expect(count).toBe(1))
    rerender({ d: 5 }) // same dep value — must NOT re-run
    rerender({ d: 5 })
    await new Promise((r) => setTimeout(r, 20))
    expect(count).toBe(1)
  })
})
