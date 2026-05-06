import { useMemo } from 'react'

export interface WordCloudWord {
  text: string
  value: number
}

interface WordCloudProps {
  words: WordCloudWord[]
  width?: number
  height?: number
  onWordClick?: (word: string) => void
}

const colors = [
  '#1e40af', // blue-800
  '#1d4ed8', // blue-700
  '#2563eb', // blue-600
  '#3b82f6', // blue-500
  '#0891b2', // cyan-600
  '#0d9488', // teal-600
  '#059669', // emerald-600
  '#16a34a', // green-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#dc2626', // red-600
  '#ea580c', // orange-600
]

// Approximate character width as fraction of font size
const CHAR_WIDTH_RATIO = 0.6

export function WordCloud({
  words,
  width = 800,
  height = 500,
  onWordClick,
}: WordCloudProps) {
  // Process words: sort by value, calculate sizes, layout into rows
  const { rows, maxFontSize, minFontSize } = useMemo(() => {
    if (words.length === 0) return { rows: [], maxFontSize: 48, minFontSize: 14 }

    // Sort by value descending
    const sorted = [...words].sort((a, b) => b.value - a.value).slice(0, 100)

    // Calculate font size range
    const values = sorted.map((w) => w.value)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const minFontSize = 14
    const maxFontSize = 48

    // Calculate font size for each word
    const wordsWithSize = sorted.map((word, index) => {
      let fontSize: number
      if (maxVal === minVal) {
        // All same value - vary by rank
        fontSize = maxFontSize - (index / sorted.length) * (maxFontSize - minFontSize)
      } else {
        // Scale by value
        const ratio = (word.value - minVal) / (maxVal - minVal)
        fontSize = minFontSize + ratio * (maxFontSize - minFontSize)
      }

      // Estimate width
      const estimatedWidth = word.text.length * fontSize * CHAR_WIDTH_RATIO + 16 // padding

      return {
        ...word,
        fontSize: Math.round(fontSize),
        estimatedWidth,
        color: colors[index % colors.length],
      }
    })

    // Flow words into rows
    const rows: Array<typeof wordsWithSize> = []
    let currentRow: typeof wordsWithSize = []
    let currentRowWidth = 0
    const padding = 20 // side padding
    const availableWidth = width - padding * 2
    const rowGap = 8

    for (const word of wordsWithSize) {
      if (currentRowWidth + word.estimatedWidth > availableWidth && currentRow.length > 0) {
        rows.push(currentRow)
        currentRow = []
        currentRowWidth = 0
      }
      currentRow.push(word)
      currentRowWidth += word.estimatedWidth + rowGap
    }
    if (currentRow.length > 0) {
      rows.push(currentRow)
    }

    return { rows, maxFontSize, minFontSize }
  }, [words, width])

  if (words.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ width, height }}
      >
        No data to display
      </div>
    )
  }

  // Calculate positions for SVG rendering
  const svgElements = useMemo(() => {
    const elements: Array<{
      text: string
      x: number
      y: number
      fontSize: number
      color: string
      value: number
    }> = []

    let y = 40 // Start with some top padding
    const padding = 20

    for (const row of rows) {
      // Calculate total row width for centering
      const rowWidth = row.reduce((sum, w) => sum + w.estimatedWidth, 0) + (row.length - 1) * 8
      let x = (width - rowWidth) / 2 // Center the row

      // Find max font size in row for line height
      const maxRowFontSize = Math.max(...row.map((w) => w.fontSize))
      const lineHeight = maxRowFontSize * 1.3

      for (const word of row) {
        elements.push({
          text: word.text,
          x: x + word.estimatedWidth / 2, // Center of word
          y: y + lineHeight / 2,
          fontSize: word.fontSize,
          color: word.color,
          value: word.value,
        })
        x += word.estimatedWidth + 8
      }

      y += lineHeight + 4
    }

    return elements
  }, [rows, width])

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {/* Background */}
        <rect width={width} height={height} fill="white" />

        {svgElements.map((el, i) => (
          <text
            key={`${el.text}-${i}`}
            x={el.x}
            y={el.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={el.fontSize}
            fontWeight={el.fontSize > 36 ? 600 : el.fontSize > 24 ? 500 : 400}
            fill={el.color}
            style={{
              cursor: onWordClick ? 'pointer' : 'default',
            }}
            onClick={() => onWordClick?.(el.text)}
          >
            {el.text}
          </text>
        ))}
      </svg>
    </div>
  )
}
