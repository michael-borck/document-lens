/**
 * Deterministic SVG chart builders for the DOCX report.
 *
 * We build the chart SVG directly from data rather than snapshotting a rendered
 * recharts component: no off-screen React mount, no animation/timing races, and
 * the output is a pure function of its inputs — so it's reproducible and
 * unit-testable. The renderer converts the SVG string to a PNG for embedding.
 */

export interface BarItem {
  label: string
  value: number
}

export interface SvgChart {
  svg: string
  width: number
  height: number
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Horizontal bar chart. Bars are sized relative to the largest value; labels
 * are truncated to keep the layout stable. Returns the SVG plus its intrinsic
 * size (the caller needs both for the raster + the docx image transform).
 */
export function barChartSvg(
  title: string,
  items: BarItem[],
  opts?: { width?: number; valueSuffix?: string }
): SvgChart {
  const width = opts?.width ?? 640
  const suffix = opts?.valueSuffix ?? ''
  const rowH = 22
  const labelW = 210
  const valueW = 52
  const barMaxW = Math.max(20, width - labelW - valueW)
  const top = 30
  const height = top + Math.max(1, items.length) * rowH + 10
  const max = Math.max(1, ...items.map((i) => i.value))

  const rows = items
    .map((it, i) => {
      const y = top + i * rowH
      const w = (it.value / max) * barMaxW
      const label = it.label.length > 36 ? `${it.label.slice(0, 34)}…` : it.label
      const valTxt = `${Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}${suffix}`
      return (
        `<text x="0" y="${y + 14}" font-size="11" fill="#333333">${escapeXml(label)}</text>` +
        `<rect x="${labelW}" y="${y + 4}" width="${w.toFixed(1)}" height="14" fill="#2563eb" />` +
        `<text x="${(labelW + w + 4).toFixed(1)}" y="${y + 14}" font-size="11" fill="#333333">${escapeXml(valTxt)}</text>`
      )
    })
    .join('')

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#ffffff" />` +
    `<text x="0" y="18" font-size="13" font-weight="bold" fill="#111111">${escapeXml(title)}</text>` +
    rows +
    `</svg>`

  return { svg, width, height }
}
