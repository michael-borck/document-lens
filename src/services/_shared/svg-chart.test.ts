import { describe, it, expect } from 'vitest'
import { barChartSvg } from './svg-chart'

describe('barChartSvg', () => {
  it('produces a valid SVG sized to the row count', () => {
    const { svg, width, height } = barChartSvg('Scores', [
      { label: 'Report A', value: 10 },
      { label: 'Report B', value: 5 },
    ])
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('Scores')
    expect(svg).toContain('Report A')
    expect(width).toBe(640)
    // top(30) + 2 rows * 22 + 10
    expect(height).toBe(84)
  })

  it('scales the widest bar to the largest value', () => {
    const { svg } = barChartSvg('T', [
      { label: 'big', value: 100 },
      { label: 'small', value: 25 },
    ])
    // The max-value bar should be the full bar area (width 640 - 210 - 52 = 378).
    expect(svg).toContain('width="378.0"')
  })

  it('escapes XML in labels and appends the value suffix', () => {
    const { svg } = barChartSvg('T', [{ label: 'A & <B>', value: 42 }], { valueSuffix: '%' })
    expect(svg).toContain('A &amp; &lt;B&gt;')
    expect(svg).toContain('42%')
  })

  it('truncates long labels', () => {
    const long = 'x'.repeat(50)
    const { svg } = barChartSvg('T', [{ label: long, value: 1 }])
    expect(svg).toContain('…')
    expect(svg).not.toContain(long)
  })
})
