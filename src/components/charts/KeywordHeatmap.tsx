import { useMemo, useRef } from 'react'

export interface HeatmapCell {
  keyword: string
  documentName: string
  documentId: string
  value: number
}

interface KeywordHeatmapProps {
  data: HeatmapCell[]
  keywords: string[]
  documents: Array<{ id: string; name: string }>
  height?: number
  onCellClick?: (keyword: string, documentId: string) => void
}

// Color scale from white to blue
function getColor(value: number, maxValue: number): string {
  if (value === 0) return '#f8fafc' // slate-50
  const intensity = Math.min(value / maxValue, 1)
  // Interpolate from light blue to dark blue
  if (intensity < 0.25) return '#dbeafe' // blue-100
  if (intensity < 0.5) return '#93c5fd' // blue-300
  if (intensity < 0.75) return '#3b82f6' // blue-500
  return '#1d4ed8' // blue-700
}

export function KeywordHeatmap({
  data,
  keywords,
  documents,
  height = 400,
  onCellClick,
}: KeywordHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const { matrix, maxValue } = useMemo(() => {
    // Build lookup map
    const lookup: Record<string, Record<string, number>> = {}
    let max = 0

    for (const cell of data) {
      if (!lookup[cell.keyword]) lookup[cell.keyword] = {}
      lookup[cell.keyword][cell.documentId] = cell.value
      max = Math.max(max, cell.value)
    }

    return { matrix: lookup, maxValue: max }
  }, [data])

  if (keywords.length === 0 || documents.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No data to display
      </div>
    )
  }

  // Calculate cell sizes
  const cellHeight = Math.max(24, Math.min(40, (height - 60) / keywords.length))
  const cellWidth = Math.max(60, Math.min(100, 600 / documents.length))
  const labelWidth = 150

  return (
    <div ref={containerRef} className="overflow-auto" style={{ maxHeight: height }}>
      <div className="inline-block">
        {/* Header row with document names */}
        <div className="flex" style={{ marginLeft: labelWidth }}>
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="text-xs text-muted-foreground truncate text-center px-1"
              style={{ width: cellWidth }}
              title={doc.name}
            >
              {doc.name.length > 12 ? doc.name.substring(0, 10) + '...' : doc.name}
            </div>
          ))}
        </div>

        {/* Rows */}
        {keywords.map((keyword) => (
          <div key={keyword} className="flex items-center">
            {/* Row label */}
            <div
              className="text-xs text-muted-foreground truncate pr-2 text-right"
              style={{ width: labelWidth }}
              title={keyword}
            >
              {keyword.length > 20 ? keyword.substring(0, 18) + '...' : keyword}
            </div>

            {/* Cells */}
            {documents.map((doc) => {
              const value = matrix[keyword]?.[doc.id] || 0
              return (
                <div
                  key={`${keyword}-${doc.id}`}
                  className="border border-white/50 flex items-center justify-center text-xs font-medium transition-all hover:ring-2 hover:ring-primary/50"
                  style={{
                    width: cellWidth,
                    height: cellHeight,
                    backgroundColor: getColor(value, maxValue),
                    color: value > maxValue * 0.5 ? 'white' : '#1e293b',
                    cursor: onCellClick ? 'pointer' : 'default',
                  }}
                  onClick={() => onCellClick?.(keyword, doc.id)}
                  title={`${keyword} in ${doc.name}: ${value}`}
                >
                  {value > 0 ? value : ''}
                </div>
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 ml-4">
          <span className="text-xs text-muted-foreground">Frequency:</span>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-4 border"
              style={{ backgroundColor: '#f8fafc' }}
            />
            <span className="text-xs">0</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-4 border"
              style={{ backgroundColor: '#dbeafe' }}
            />
            <span className="text-xs">Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-4 border"
              style={{ backgroundColor: '#3b82f6' }}
            />
            <span className="text-xs">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div
              className="w-4 h-4 border"
              style={{ backgroundColor: '#1d4ed8' }}
            />
            <span className="text-xs">High</span>
          </div>
        </div>
      </div>
    </div>
  )
}
