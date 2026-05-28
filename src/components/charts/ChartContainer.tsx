/**
 * ChartContainer — drop-in for Recharts `ResponsiveContainer` that survives
 * Electron's Windows rendering quirks.
 *
 * Symptom we're solving: with bare `<ResponsiveContainer width="100%" height={N}>`,
 * Recharts 2.x on Windows-Electron sometimes measures 0 width on the first
 * layout pass and never recovers, leaving charts permanently blank. macOS
 * doesn't reproduce this reliably because its compositor settles layout
 * faster. Reported in lens-analysers desktop builds 2026-05; reliable repro
 * was 'all charts blank on Windows, all charts fine on Mac'.
 *
 * The fix is the union of three known-good Recharts workarounds:
 *
 *   1. Wrap in an outer div with `width: 100%` + explicit `height` and
 *      `min-width: 0`. Guarantees the wrapper has measurable dimensions
 *      before ResponsiveContainer ever calls its ResizeObserver. The
 *      `min-width: 0` defeats a flexbox bug where flex children refuse to
 *      shrink below their content's intrinsic width.
 *
 *   2. Pass `width="100%" height="100%"` to ResponsiveContainer so it fills
 *      the explicitly-sized wrapper. (No more "100% of an unknown parent".)
 *
 *   3. `debounce={50}` — gives the layout one tick to settle before
 *      ResponsiveContainer commits to a measurement. Mac doesn't need this;
 *      Windows-Electron does.
 *
 * Usage is a one-line swap:
 *
 *   // before
 *   <ResponsiveContainer width="100%" height={240}>...</ResponsiveContainer>
 *
 *   // after
 *   <ChartContainer height={240}>...</ChartContainer>
 *
 * Any future chart should use this wrapper, not ResponsiveContainer directly.
 */
import type { ReactElement } from 'react'
import { ResponsiveContainer } from 'recharts'

interface ChartContainerProps {
  /** Explicit pixel height for the chart's bounding box. */
  height: number
  /** A single Recharts chart element (LineChart, BarChart, ScatterChart, etc.). */
  children: ReactElement
  /** Override the default 50 ms ResponsiveContainer debounce if needed. */
  debounceMs?: number
  /** Extra classes on the wrapper div (not the chart). */
  className?: string
}

export function ChartContainer({
  height,
  children,
  debounceMs = 50,
  className,
}: ChartContainerProps) {
  return (
    <div
      className={className}
      style={{ width: '100%', height, minWidth: 0 }}
    >
      <ResponsiveContainer width="100%" height="100%" debounce={debounceMs}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}
