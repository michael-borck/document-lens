import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computeCoverage, type CoverageMatrix } from '@/services/coverage'
import { getKeywordListLenses } from '@/services/keyword-lists'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Lens, LensValue, KeywordPolarity } from '@/types/data'
import { cn } from '@/lib/utils'

type ViewMode = 'per-document' | 'aggregate'
type Polarity = KeywordPolarity | 'both'

/**
 * Map workflow — one-axis distribution view.
 *
 * Scope of v1: shows how each document distributes across the values of
 * a single keyword-attached lens (SDG or Pillar). Two-axis cross-
 * tabulation (e.g., SDG × Function) needs the Function classification
 * pipeline which depends on document-section embedding inference — that
 * lands in a follow-up commit. Until then, Function lens isn't
 * selectable here (filtered out as document-context).
 */
export function Map() {
  const vm = useOutletContext<ProjectViewModel>()
  const [eligibleLenses, setEligibleLenses] = useState<Lens[]>([])
  const [lensId, setLensId] = useState<string>('')
  const [polarity, setPolarity] = useState<Polarity>('positive')
  const [view, setView] = useState<ViewMode>('per-document')
  const [running, setRunning] = useState(false)
  const [matrix, setMatrix] = useState<CoverageMatrix | null>(null)

  // Eligible Map lenses = active project lenses that are keyword-attached
  // AND declared by the active keyword list.
  useEffect(() => {
    if (!vm.keywordList) {
      setEligibleLenses([])
      return
    }
    getKeywordListLenses(vm.keywordList.id).then((declaredIds) => {
      const projectLensIds = new Set(vm.lenses.map((l) => l.id))
      const eligible = vm.lenses.filter(
        (l) =>
          l.type === 'keyword-attached' &&
          declaredIds.includes(l.id) &&
          projectLensIds.has(l.id)
      )
      setEligibleLenses(eligible)
      // Auto-pick the first eligible lens if nothing chosen.
      setLensId((current) => current || eligible[0]?.id || '')
    })
  }, [vm.keywordList, vm.lenses])

  const handleRun = async () => {
    if (!vm.keywordList || !lensId) return
    setRunning(true)
    setMatrix(null)
    try {
      const m = await computeCoverage({
        projectId: vm.project.id,
        keywordListId: vm.keywordList.id,
        polarity,
        lensId,
      })
      setMatrix(m)
    } finally {
      setRunning(false)
    }
  }

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
  if (eligibleLenses.length === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No keyword-attached lenses active"
          description={
            <>
              Map needs at least one keyword-attached lens (SDG, Pillar, or
              similar) active on this project. Activate one on the Setup
              tab. The Function lens is{' '}
              <em>document-context</em> and needs a separate inference pass
              that's still in progress.
            </>
          }
        />
      </div>
    )
  }

  const selectedLens = eligibleLenses.find((l) => l.id === lensId)
  const hasResults = matrix !== null

  return (
    <div className="px-8 py-8 max-w-7xl">
      <Header />

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <Field label="Lens">
          <Select value={lensId} onValueChange={setLensId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eligibleLenses.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Polarity">
          <Select value={polarity} onValueChange={(v) => setPolarity(v as Polarity)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="positive">Positive only</SelectItem>
              <SelectItem value="counter">Counter only</SelectItem>
              <SelectItem value="both">Both combined</SelectItem>
            </SelectContent>
          </Select>
        </Field>
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
        <div className="flex-1" />
        <Button onClick={handleRun} disabled={running} className="gap-2">
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

      <div className="mb-3 text-xs text-muted-foreground border border-border rounded-md p-2 bg-muted/30">
        <strong>Note:</strong> v1 shows distribution across one lens.
        Two-axis cross-tabulation (e.g., SDG × Function) needs the Function
        classification pipeline, which lands in a follow-up.
      </div>

      {!hasResults && !running && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          {vm.documentCount} document{vm.documentCount === 1 ? '' : 's'} ·
          using <strong>{vm.keywordList.name}</strong> keywords ·
          mapped by <strong>{selectedLens?.name}</strong>. Click{' '}
          <strong>Run map</strong> to compute.
        </div>
      )}

      {matrix && view === 'per-document' && (
        <PerDocumentView matrix={matrix} />
      )}
      {matrix && view === 'aggregate' && (
        <AggregateView matrix={matrix} />
      )}
    </div>
  )
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
  valuesForDoc: Array<{ value: LensValue; count: number }>
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
 * Stable colour for a lens value. Uses the value's sortOrder to index
 * into the palette; falls back to the value string as a hash basis.
 */
function colourForValue(v: LensValue): string {
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

function ColourLegend({ lensValues }: { lensValues: LensValue[] }) {
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

