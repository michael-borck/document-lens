import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Loader2, Play, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computeCoverage, type CoverageMatrix } from '@/services/coverage'
import { computeCoverage2D, type CoverageMatrix2D } from '@/services/coverage-2d'
import { getKeywordListAxes } from '@/services/keyword-lists'
import { getClassificationStatus } from '@/services/classification'
import { EmptyState } from '@/components/EmptyState'
import { useAnalysis } from '@/hooks/useAnalysis'
import { PolaritySelector, type Polarity } from '@/components/workflow/PolaritySelector'
import { MLCaveatBanner } from '@/components/workflow/MLCaveatBanner'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Axis, AxisValue, KeywordPolarity } from '@/types/data'
import { cn } from '@/lib/utils'

type Mode = 'one-axis' | 'two-axis'
type ViewMode = 'per-document' | 'aggregate'

interface MapResult {
  matrix: CoverageMatrix | null
  matrix2D: CoverageMatrix2D | null
}

/**
 * Map workflow.
 *
 * One-axis mode: how each document distributes across the values of a
 * single keyword-attached lens (SDG, Pillar). Stacked bars per
 * document; horizontal bar chart for the project aggregate.
 *
 * Two-axis mode: 2D matrix cross-tabulating a keyword-attached lens
 * (rows) against a document-context lens (cols). The methodology
 * document's headline SDG × Function table. Requires Function
 * classification on the Setup tab; surfaces a "go classify" hint when
 * not done.
 */
export function Map() {
  const vm = useOutletContext<ProjectViewModel>()
  const [mode, setMode] = useState<Mode>('one-axis')
  const [eligibleAxes, setEligibleAxes] = useState<Axis[]>([])
  const [contextAxes, setContextAxes] = useState<Axis[]>([])
  const [axisId, setAxisId] = useState<string>('')
  const [colAxisId, setColAxisId] = useState<string>('')
  const [polarity, setPolarity] = useState<Polarity>('positive')
  const [view, setView] = useState<ViewMode>('per-document')
  const [classifiedDocs, setClassifiedDocs] = useState<number | null>(null)

  // Eligible row axes = active project axes that are keyword-attached
  // AND declared by the active keyword list. Eligible col axes (for
  // two-axis mode) = active project axes that are document-context.
  useEffect(() => {
    if (!vm.keywordList) {
      setEligibleAxes([])
      setContextAxes([])
      return
    }
    getKeywordListAxes(vm.keywordList.id).then((declaredIds) => {
      const projectAxisIds = new Set(vm.axes.map((a) => a.id))
      const eligible = vm.axes.filter(
        (a) =>
          a.type === 'keyword-attached' &&
          declaredIds.includes(a.id) &&
          projectAxisIds.has(a.id)
      )
      const context = vm.axes.filter(
        (a) => a.type === 'document-context' && projectAxisIds.has(a.id)
      )
      setEligibleAxes(eligible)
      setContextAxes(context)
      setAxisId((current) => current || eligible[0]?.id || '')
      setColAxisId((current) => current || context[0]?.id || '')
    })
  }, [vm.keywordList, vm.axes])

  // Track classification progress for the chosen col axis (two-axis only).
  useEffect(() => {
    if (mode !== 'two-axis' || !colAxisId || vm.documentCount === 0) {
      setClassifiedDocs(null)
      return
    }
    getClassificationStatus(vm.project.id, colAxisId).then((s) => {
      setClassifiedDocs(s.classifiedDocuments)
    })
  }, [mode, colAxisId, vm.project.id, vm.documentCount])

  // Manual run; the hook owns running/error/result + cancel-safety. The page's
  // one-axis vs two-axis branch just lives inside the fn.
  const { run, running, result, reset } = useAnalysis<MapResult>(async () => {
    if (!vm.keywordList || !axisId) throw new Error('Pick a keyword list and an axis.')
    if (mode === 'one-axis') {
      const m = await computeCoverage({
        projectId: vm.project.id,
        keywordListId: vm.keywordList.id,
        polarity,
        axisId: axisId,
      })
      return { matrix: m, matrix2D: null }
    }
    if (!colAxisId) throw new Error('Pick a second axis for the two-axis matrix.')
    // Two-axis: polarity 'both' would need two passes. For v1, the matrix is
    // positive-only; counter and both come later.
    const polarityForMatrix: KeywordPolarity = polarity === 'counter' ? 'counter' : 'positive'
    const m = await computeCoverage2D({
      projectId: vm.project.id,
      keywordListId: vm.keywordList.id,
      rowAxisId: axisId,
      colAxisId: colAxisId,
      polarity: polarityForMatrix,
    })
    return { matrix: null, matrix2D: m }
  })
  const matrix = result?.matrix ?? null
  const matrix2D = result?.matrix2D ?? null

  if (!vm.keywordList) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No keyword list"
          description="Pick a keyword list on the Setup tab to enable Map."
        />
      </div>
    )
  }
  if (vm.documentCount === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to map their topic distribution."
        />
      </div>
    )
  }
  if (eligibleAxes.length === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No keyword-attached axes active"
          description={
            <>
              Map needs at least one keyword-attached axis (SDG, Pillar, or
              similar) active on this project. Activate one on the Setup
              tab. The Function axis is{' '}
              <em>document-context</em> and needs a separate inference pass
              that's still in progress.
            </>
          }
        />
      </div>
    )
  }

  const selectedAxis = eligibleAxes.find((a) => a.id === axisId)
  const selectedColAxis = contextAxes.find((a) => a.id === colAxisId)
  const hasResults = (mode === 'one-axis' ? matrix : matrix2D) !== null
  const twoAxisAvailable = contextAxes.length > 0

  return (
    <div className="px-8 py-8 max-w-7xl">
      <Header />

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <Field label="Mode">
          <Select
            value={mode}
            onValueChange={(v) => {
              setMode(v as Mode)
              reset()
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one-axis">One-axis distribution</SelectItem>
              <SelectItem value="two-axis" disabled={!twoAxisAvailable}>
                Two-axis matrix {!twoAxisAvailable && '(needs context lens)'}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={mode === 'two-axis' ? 'Rows (keyword-attached)' : 'Axis'}>
          <Select value={axisId} onValueChange={setAxisId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eligibleAxes.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {mode === 'two-axis' && (
          <Field label="Columns (document-context)">
            <Select value={colAxisId} onValueChange={setColAxisId}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Pick a context axis" />
              </SelectTrigger>
              <SelectContent>
                {contextAxes.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Polarity">
          <PolaritySelector
            value={polarity}
            onChange={setPolarity}
            options={mode === 'one-axis' ? ['positive', 'counter', 'both'] : ['positive', 'counter']}
          />
        </Field>
        {mode === 'one-axis' && (
          <Field label="View">
            <Select value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per-document">Per document</SelectItem>
                <SelectItem value="aggregate">Project aggregate</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}
        <div className="flex-1" />
        <Button onClick={run} disabled={running} className="gap-2">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              {hasResults ? 'Re-run' : 'Run map'}
            </>
          )}
        </Button>
      </div>

      {mode === 'two-axis' && (
        <MLCaveatBanner id="map-semantic">
          Axis classifications use semantic similarity (sentence embeddings). The
          same model gives the same answer every time, but it's approximate —
          treat each cell as a strong signal, not a precise category assignment.
        </MLCaveatBanner>
      )}

      {mode === 'two-axis' && classifiedDocs !== null && classifiedDocs < vm.documentCount && (
        <div className="mb-4 flex items-start gap-3 text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3">
          <div className="flex-1 min-w-0">
            <strong>Function classification incomplete:</strong>{' '}
            {classifiedDocs} of {vm.documentCount} documents classified on{' '}
            <strong>{selectedColAxis?.name}</strong>. Run classification on the
            Setup tab to populate the rest of the matrix — until then unclassified
            documents contribute zero to every cell.
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
            <Link to={{ pathname: '../setup', hash: '#classification' }}>
              Classify now
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {!hasResults && !running && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          {mode === 'one-axis' ? (
            <>
              {vm.documentCount} document{vm.documentCount === 1 ? '' : 's'} ·
              using <strong>{vm.keywordList.name}</strong> keywords ·
              mapped by <strong>{selectedAxis?.name}</strong>. Click{' '}
              <strong>Run map</strong> to compute.
            </>
          ) : (
            <>
              Cross-tabulating <strong>{selectedAxis?.name}</strong> (rows) ×{' '}
              <strong>{selectedColAxis?.name}</strong> (columns) on{' '}
              <strong>{vm.documentCount}</strong> document
              {vm.documentCount === 1 ? '' : 's'}. Click{' '}
              <strong>Run map</strong> to compute the matrix.
            </>
          )}
        </div>
      )}

      {mode === 'one-axis' && matrix && view === 'per-document' && (
        <PerDocumentView matrix={matrix} />
      )}
      {mode === 'one-axis' && matrix && view === 'aggregate' && (
        <AggregateView matrix={matrix} />
      )}
      {mode === 'two-axis' && matrix2D && (
        <TwoAxisMatrix matrix={matrix2D} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Two-axis matrix view
// ---------------------------------------------------------------------------

function TwoAxisMatrix({ matrix }: { matrix: CoverageMatrix2D }) {
  const { rowLens, colLens, rowValues, colValues, aggregate, totalMatches } = matrix

  const maxCell = useMemo(() => {
    let max = 0
    for (const rv of rowValues) {
      for (const cv of colValues) {
        const v = aggregate[rv.id]?.[cv.id] ?? 0
        if (v > max) max = v
      }
    }
    return max || 1
  }, [aggregate, rowValues, colValues])

  // Row totals + col totals for the margin labels
  const rowTotals = useMemo(() => {
    const out: Record<string, number> = {}
    for (const rv of rowValues) {
      out[rv.id] = colValues.reduce((s, cv) => s + (aggregate[rv.id]?.[cv.id] ?? 0), 0)
    }
    return out
  }, [aggregate, rowValues, colValues])

  const colTotals = useMemo(() => {
    const out: Record<string, number> = {}
    for (const cv of colValues) {
      out[cv.id] = rowValues.reduce((s, rv) => s + (aggregate[rv.id]?.[cv.id] ?? 0), 0)
    }
    return out
  }, [aggregate, rowValues, colValues])

  if (matrix.documents.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No documents with extracted text in this project.
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 text-xs text-muted-foreground space-y-0.5">
        <div>
          <strong>{totalMatches}</strong> match{totalMatches === 1 ? '' : 'es'} placed in the matrix:
          rows = <strong>{rowLens.name}</strong>, columns = <strong>{colLens.name}</strong>.
        </div>
        {(matrix.unplacedNoKeywordTag + matrix.unplacedNoSectionTag + matrix.unplacedOutsideSections > 0) && (
          <div className="italic">
            Unplaced:
            {matrix.unplacedNoKeywordTag > 0 && ` ${matrix.unplacedNoKeywordTag} (no row tag on keyword)`}
            {matrix.unplacedNoSectionTag > 0 && ` ${matrix.unplacedNoSectionTag} (section not classified on column lens)`}
            {matrix.unplacedOutsideSections > 0 && ` ${matrix.unplacedOutsideSections} (match outside detected sections)`}.
          </div>
        )}
      </div>

      <div className="overflow-auto border border-border rounded-md">
        <table className="text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr>
              <th className="px-3 py-2 text-left font-medium sticky left-0 bg-card z-20" style={{ minWidth: '180px' }}>
                {rowLens.name} \ {colLens.name}
              </th>
              {colValues.map((cv) => (
                <th
                  key={cv.id}
                  className="px-2 py-2 text-center font-normal align-bottom"
                  style={{ minWidth: '90px' }}
                  title={cv.displayName ?? cv.value}
                >
                  <div className="text-[11px] font-medium truncate">
                    {cv.displayName ?? cv.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                    {colTotals[cv.id]}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-center font-normal align-bottom bg-muted/30" style={{ minWidth: '60px' }}>
                <div className="text-[11px] font-medium">Total</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rowValues.map((rv) => (
              <tr key={rv.id} className="border-t border-border">
                <td
                  className="px-3 py-1.5 sticky left-0 bg-card z-10 font-medium"
                  style={{ minWidth: '180px', maxWidth: '220px' }}
                  title={rv.displayName ?? rv.value}
                >
                  <div className="truncate">{rv.displayName ?? rv.value}</div>
                </td>
                {colValues.map((cv) => {
                  const v = aggregate[rv.id]?.[cv.id] ?? 0
                  const intensity = v / maxCell
                  return (
                    <td
                      key={cv.id}
                      className={cn(
                        'px-2 py-1.5 text-center tabular-nums border-l border-border/50',
                        v === 0 && 'text-muted-foreground/30'
                      )}
                      style={{ backgroundColor: matrixCellColor(intensity) }}
                      title={`${rv.displayName ?? rv.value} × ${cv.displayName ?? cv.value}: ${v}`}
                    >
                      {v || ''}
                    </td>
                  )
                })}
                <td className="px-2 py-1.5 text-center tabular-nums bg-muted/30 font-medium">
                  {rowTotals[rv.id]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function matrixCellColor(intensity: number): string {
  if (intensity === 0) return 'transparent'
  // Blue ramp for the 2D matrix to visually distinguish from one-axis bars.
  const alpha = 0.08 + intensity * 0.55
  return `rgba(59, 130, 246, ${alpha})`
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight">Map</h1>
      <p className="text-muted-foreground italic mt-1">
        Where in this document does each topic appear, and how do topics overlap?
      </p>
    </header>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-document view: one stacked bar per document
// ---------------------------------------------------------------------------

function PerDocumentView({ matrix }: { matrix: CoverageMatrix }) {
  if (!matrix.lensValues || !matrix.lensTotals) return null

  const docTotals = useMemo(() => {
    return matrix.documents.map((doc) => {
      const valuesForDoc = matrix.lensValues!.map((v) => ({
        value: v,
        count: matrix.lensTotals![doc.id]?.[v.id] ?? 0,
      }))
      const total = valuesForDoc.reduce((s, v) => s + v.count, 0)
      return { doc, valuesForDoc, total }
    })
  }, [matrix])

  // Find max total across all docs to size bars consistently.
  const maxTotal = Math.max(1, ...docTotals.map((d) => d.total))

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">{matrix.summary}</p>
      <ColourLegend lensValues={matrix.lensValues} />
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {docTotals.map(({ doc, valuesForDoc, total }) => (
              <tr key={doc.id}>
                <td className="px-3 py-2 align-top w-72 max-w-[18rem]">
                  <div className="font-medium truncate" title={doc.title ?? doc.filename}>
                    {doc.title ?? doc.filename}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[doc.year, doc.company].filter(Boolean).join(' · ') || ''}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {total === 0 ? (
                    <span className="text-xs text-muted-foreground italic">No matches</span>
                  ) : (
                    <StackedBar valuesForDoc={valuesForDoc} maxTotal={maxTotal} />
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums w-20 text-muted-foreground text-xs align-top">
                  {total} match{total === 1 ? '' : 'es'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StackedBar({
  valuesForDoc,
  maxTotal,
}: {
  valuesForDoc: Array<{ value: AxisValue; count: number }>
  maxTotal: number
}) {
  const docTotal = valuesForDoc.reduce((s, v) => s + v.count, 0)
  // Bar width is proportional to docTotal/maxTotal so larger-count docs
  // visually dominate; segments inside are proportional to their own
  // contribution to docTotal.
  const barWidthPct = (docTotal / maxTotal) * 100

  return (
    <div className="w-full">
      <div
        className="h-5 rounded-sm overflow-hidden flex bg-muted/30"
        style={{ width: `${barWidthPct}%`, minWidth: docTotal > 0 ? '2rem' : '0' }}
      >
        {valuesForDoc
          .filter((v) => v.count > 0)
          .map((v) => {
            const segPct = (v.count / docTotal) * 100
            return (
              <div
                key={v.value.id}
                className="h-full"
                style={{
                  width: `${segPct}%`,
                  backgroundColor: colourForValue(v.value),
                }}
                title={`${v.value.displayName ?? v.value.value}: ${v.count}`}
              />
            )
          })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aggregate view: project-wide bar chart per lens value
// ---------------------------------------------------------------------------

function AggregateView({ matrix }: { matrix: CoverageMatrix }) {
  if (!matrix.lensValues || !matrix.lensTotals) return null

  const aggregates = useMemo(() => {
    const sums: Record<string, number> = {}
    for (const doc of matrix.documents) {
      for (const value of matrix.lensValues!) {
        const v = matrix.lensTotals![doc.id]?.[value.id] ?? 0
        sums[value.id] = (sums[value.id] ?? 0) + v
      }
    }
    return matrix.lensValues!.map((v) => ({
      value: v,
      count: sums[v.id] ?? 0,
    }))
  }, [matrix])

  const max = Math.max(1, ...aggregates.map((a) => a.count))
  const grandTotal = aggregates.reduce((s, a) => s + a.count, 0)

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        {matrix.summary} · {grandTotal} total match{grandTotal === 1 ? '' : 'es'}
      </p>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {aggregates.map(({ value, count }) => {
              const pct = (count / max) * 100
              const sharePct = grandTotal > 0 ? (count / grandTotal) * 100 : 0
              return (
                <tr key={value.id}>
                  <td className="px-3 py-2 w-64 max-w-[18rem]">
                    <div className="text-sm font-medium truncate">
                      {value.displayName ?? value.value}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="h-5 bg-muted/30 rounded-sm overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: colourForValue(value),
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums w-32 text-muted-foreground text-xs">
                    {count} ({sharePct.toFixed(1)}%)
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Colour mapping
// ---------------------------------------------------------------------------

const PALETTE = [
  'rgb(34, 197, 94)',    // green-500
  'rgb(59, 130, 246)',   // blue-500
  'rgb(234, 88, 12)',    // orange-600
  'rgb(168, 85, 247)',   // purple-500
  'rgb(234, 179, 8)',    // yellow-500
  'rgb(220, 38, 38)',    // red-600
  'rgb(20, 184, 166)',   // teal-500
  'rgb(147, 51, 234)',   // violet-600
  'rgb(2, 132, 199)',    // sky-600
  'rgb(132, 204, 22)',   // lime-500
  'rgb(217, 70, 239)',   // fuchsia-500
  'rgb(245, 158, 11)',   // amber-500
  'rgb(99, 102, 241)',   // indigo-500
  'rgb(244, 114, 182)',  // pink-400
  'rgb(16, 185, 129)',   // emerald-500
  'rgb(139, 92, 246)',   // violet-500
  'rgb(8, 145, 178)',    // cyan-600
]

/**
 * Stable colour for an axis value. Uses the value's sortOrder to index
 * into the palette; falls back to the value string as a hash basis.
 */
function colourForValue(v: AxisValue): string {
  const idx = v.sortOrder > 0 ? v.sortOrder - 1 : hash(v.value)
  return PALETTE[idx % PALETTE.length]
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function ColourLegend({ lensValues }: { lensValues: AxisValue[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs">
      {lensValues.map((v) => (
        <div key={v.id} className="flex items-center gap-1.5">
          <div
            className={cn('w-3 h-3 rounded-sm shrink-0')}
            style={{ backgroundColor: colourForValue(v) }}
          />
          <span className="text-muted-foreground">
            {v.displayName ?? v.value}
          </span>
        </div>
      ))}
    </div>
  )
}

