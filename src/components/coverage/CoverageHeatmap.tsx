import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { CoverageMatrix } from '@/services/coverage'

interface CoverageHeatmapProps {
  matrix: CoverageMatrix
  /** Drives the cell colour ramp. */
  polarityHint: 'positive' | 'counter'
  /** When true, columns are lens values (rolled up); otherwise individual keywords. */
  byLens: boolean
}

/**
 * Document × column heatmap. Columns are either individual keywords or
 * the active lens values (when a lens is selected). Cell intensity =
 * match count, scaled to the matrix max.
 *
 * Visually clean for ~20–30 columns; beyond that, horizontal scroll
 * takes over.
 */
export function CoverageHeatmap({ matrix, polarityHint, byLens }: CoverageHeatmapProps) {
  const { documents, keywords, counts, lensTotals, lensValues } = matrix

  const columns = useMemo(() => {
    if (byLens && lensValues && lensValues.length > 0) {
      return lensValues.map((v) => ({
        id: v.id,
        label: v.displayName ?? v.value,
      }))
    }
    return keywords.map((k) => ({
      id: k.id,
      label: k.text,
    }))
  }, [byLens, lensValues, keywords])

  const cellMatrix = byLens && lensTotals ? lensTotals : counts

  const maxCount = useMemo(() => {
    let max = 0
    for (const doc of documents) {
      for (const col of columns) {
        const v = cellMatrix[doc.id]?.[col.id] ?? 0
        if (v > max) max = v
      }
    }
    return max || 1
  }, [documents, columns, cellMatrix])

  if (documents.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No documents to analyse. Attach documents from the Library in
        Setup, then re-run Coverage.
      </div>
    )
  }
  if (columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No {polarityHint} keywords to count.
      </div>
    )
  }

  return (
    <div className="overflow-auto border border-border rounded-md">
      <table className="text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr>
            <th className="text-left font-medium px-3 py-2 sticky left-0 bg-card z-20 min-w-[200px]">
              Document
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="px-2 py-2 text-center font-normal align-bottom h-32"
                title={col.label}
                style={{ minWidth: '32px', maxWidth: '32px' }}
              >
                <div
                  className="text-[10px] whitespace-nowrap"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    maxHeight: '110px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    margin: '0 auto',
                  }}
                >
                  {col.label}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-t border-border">
              <td className="px-3 py-1.5 sticky left-0 bg-card z-10 min-w-[200px] max-w-[260px]">
                <div className="font-medium truncate" title={doc.title ?? doc.filename}>
                  {doc.title ?? doc.filename}
                </div>
                <div className="text-muted-foreground text-[10px]">
                  {[doc.year, doc.company].filter(Boolean).join(' · ') || ''}
                </div>
              </td>
              {columns.map((col) => {
                const v = cellMatrix[doc.id]?.[col.id] ?? 0
                const intensity = v / maxCount
                return (
                  <td
                    key={col.id}
                    className={cn(
                      'px-2 py-1.5 text-center tabular-nums border-l border-border/50',
                      v === 0 && 'text-muted-foreground/30'
                    )}
                    style={{
                      backgroundColor: cellColor(intensity, polarityHint),
                    }}
                    title={`${col.label}: ${v} match${v === 1 ? '' : 'es'}`}
                  >
                    {v || ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cellColor(intensity: number, polarity: 'positive' | 'counter'): string {
  if (intensity === 0) return 'transparent'
  // Positive → green ramp; counter → amber/red ramp. Alpha scales with intensity
  // so the most-mentioned cell is fully saturated but never opaque.
  const alpha = 0.08 + intensity * 0.55
  return polarity === 'positive'
    ? `rgba(34, 197, 94, ${alpha})`    // tailwind green-500
    : `rgba(234, 88, 12, ${alpha})`    // tailwind orange-600
}
