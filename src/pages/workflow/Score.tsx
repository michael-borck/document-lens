import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Play, CheckCircle2, Circle } from 'lucide-react'
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
import { listLensValues } from '@/services/lenses'
import { getClassificationStatus } from '@/services/classification'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Document, LensValue } from '@/types/data'
import { cn } from '@/lib/utils'

type ViewMode = 'per-document' | 'aggregate'
type Mode = 'full' | 'v1-prerequisite'

/**
 * Score workflow.
 *
 * Two modes auto-selected based on whether Function classification has
 * been run for the project:
 *
 * - **Full Wedding Cake Score** (when classification done): for each
 *   Function value (Teaching / Research / Engagement / Operations),
 *   check whether the document has positive matches in ALL required
 *   pillars (Biosphere, Society, Economy) WITH THAT FUNCTION TAG.
 *   Score = count of functions that satisfy. Range: 0 to N (typically
 *   0–4).
 *
 * - **v1 Pillar coverage prerequisite** (fallback): how many of the
 *   required pillars the document mentions positively (regardless of
 *   function context). Range: 0 to count(required pillars), typically
 *   0–3. Honest scoping banner points the user to Setup → Function
 *   classification to upgrade.
 */
export function Score() {
  const vm = useOutletContext<ProjectViewModel>()

  // Parse the active scoring rule's definition.
  const ruleDef = useMemo(() => {
    if (!vm.scoringRule) return null
    const def = vm.scoringRule.definition as {
      type?: string
      pillarLensId?: string
      functionLensId?: string
      requiredPillars?: string[]
    }
    if (def.type !== 'wedding-cake') return null
    return def
  }, [vm.scoringRule])

  const [requiredValues, setRequiredValues] = useState<LensValue[]>([])
  const [functionValues, setFunctionValues] = useState<LensValue[]>([])

  const [mode, setMode] = useState<Mode>('v1-prerequisite')
  const [matrixV1, setMatrixV1] = useState<CoverageMatrix | null>(null)
  const [matrixFull, setMatrixFull] = useState<CoverageMatrix2D | null>(null)
  const [view, setView] = useState<ViewMode>('per-document')
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [running, setRunning] = useState(false)

  // When the rule changes, load the required pillar values + function values.
  useEffect(() => {
    if (!ruleDef?.pillarLensId) {
      setRequiredValues([])
      return
    }
    listLensValues(ruleDef.pillarLensId).then((values) => {
      const required = (ruleDef.requiredPillars ?? [])
        .map((name) => values.find((v) => v.value === name))
        .filter((v): v is LensValue => Boolean(v))
      setRequiredValues(required)
    })
  }, [ruleDef])

  useEffect(() => {
    if (!ruleDef?.functionLensId) {
      setFunctionValues([])
      return
    }
    listLensValues(ruleDef.functionLensId).then(setFunctionValues)
  }, [ruleDef])

  // Detect whether to run full mode or v1 mode based on whether the
  // project has Function classification done.
  useEffect(() => {
    if (!ruleDef?.functionLensId || vm.documentCount === 0) {
      setMode('v1-prerequisite')
      return
    }
    getClassificationStatus(vm.project.id, ruleDef.functionLensId).then((s) => {
      const allClassified = s.totalDocuments > 0 && s.classifiedDocuments === s.totalDocuments
      setMode(allClassified ? 'full' : 'v1-prerequisite')
    })
  }, [ruleDef, vm.project.id, vm.documentCount])

  const handleRun = async () => {
    if (!vm.keywordList || !ruleDef?.pillarLensId) return
    setRunning(true)
    setMatrixV1(null)
    setMatrixFull(null)
    try {
      if (mode === 'full' && ruleDef.functionLensId) {
        const m = await computeCoverage2D({
          projectId: vm.project.id,
          keywordListId: vm.keywordList.id,
          rowLensId: ruleDef.pillarLensId,
          colLensId: ruleDef.functionLensId,
          polarity: 'positive',
        })
        setMatrixFull(m)
        setSelectedDocId(m.documents[0]?.id ?? '')
      } else {
        const m = await computeCoverage({
          projectId: vm.project.id,
          keywordListId: vm.keywordList.id,
          polarity: 'positive',
          lensId: ruleDef.pillarLensId,
        })
        setMatrixV1(m)
        setSelectedDocId(m.documents[0]?.id ?? '')
      }
    } finally {
      setRunning(false)
    }
  }

  // Empty / error states.
  if (!vm.keywordList) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState title="No keyword list" description="Pick a keyword list on the Setup tab to enable Score." />
      </div>
    )
  }
  if (!vm.scoringRule) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No scoring rule"
          description="Pick a scoring rule on the Setup tab. The default 5-level Wedding Cake Score is preloaded."
        />
      </div>
    )
  }
  if (!ruleDef?.pillarLensId) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="Active rule isn't supported here yet"
          description={
            <>
              v1 only evaluates the built-in <strong>5-level Wedding Cake Score</strong>{' '}
              rule (or custom rules with <code>type: "wedding-cake"</code>). Custom rule
              types beyond that need their own evaluator.
            </>
          }
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
          description="Add documents from the Library on the Setup tab to score them."
        />
      </div>
    )
  }

  const hasResults = mode === 'full' ? matrixFull !== null : matrixV1 !== null
  const matrixForDocList = mode === 'full' ? matrixFull : matrixV1
  const selectedDoc = matrixForDocList?.documents.find((d) => d.id === selectedDocId)

  return (
    <div className="px-8 py-8 max-w-5xl">
      <Header />

      {mode === 'v1-prerequisite' ? <V1Banner /> : <FullBanner />}

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <Field label="View">
          <Select value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per-document">Per document</SelectItem>
              <SelectItem value="aggregate">Project distribution</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {view === 'per-document' && hasResults && matrixForDocList && (
          <Field label="Document">
            <Select value={selectedDocId} onValueChange={setSelectedDocId}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matrixForDocList.documents.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title ?? doc.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
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
              {hasResults ? 'Re-run' : 'Run scoring'}
            </>
          )}
        </Button>
      </div>

      {!hasResults && !running && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          {vm.documentCount} document{vm.documentCount === 1 ? '' : 's'}
          {' '}· using <strong>{vm.keywordList.name}</strong> keywords
          {' '}· evaluated against <strong>{vm.scoringRule.name}</strong>
          {' · mode: '}<strong>{mode === 'full' ? 'full Wedding Cake' : 'v1 Pillar coverage prerequisite'}</strong>.
          {' '}Click <strong>Run scoring</strong> to compute.
        </div>
      )}

      {/* v1 mode results */}
      {mode === 'v1-prerequisite' && matrixV1 && view === 'per-document' && selectedDoc && (
        <V1PerDocumentScore doc={selectedDoc} matrix={matrixV1} requiredValues={requiredValues} />
      )}
      {mode === 'v1-prerequisite' && matrixV1 && view === 'aggregate' && (
        <V1AggregateScore matrix={matrixV1} requiredValues={requiredValues} />
      )}

      {/* Full mode results */}
      {mode === 'full' && matrixFull && view === 'per-document' && selectedDoc && (
        <FullPerDocumentScore
          doc={selectedDoc}
          matrix={matrixFull}
          requiredPillars={requiredValues}
          functionValues={functionValues}
        />
      )}
      {mode === 'full' && matrixFull && view === 'aggregate' && (
        <FullAggregateScore
          matrix={matrixFull}
          requiredPillars={requiredValues}
          functionValues={functionValues}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header + banners
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="mb-3">
      <h1 className="font-display text-2xl font-medium tracking-tight">Score</h1>
      <p className="text-muted-foreground italic mt-1">
        How does this document rate on your chosen rubric?
      </p>
    </header>
  )
}

function V1Banner() {
  return (
    <div className="mb-6 text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 leading-relaxed">
      <strong>Mode: v1 Pillar coverage prerequisite.</strong> Documents in this
      project haven't been Function-classified yet, so we can't compute the
      full 5-level Wedding Cake Score. This view shows the structural
      prerequisite: how many of the required pillars the document mentions
      positively. Run <strong>Function classification</strong> on the Setup
      tab to upgrade to the full score.
    </div>
  )
}

function FullBanner() {
  return (
    <div className="mb-6 text-xs border border-green-500/30 bg-green-50 dark:bg-green-950/20 rounded-md p-3 leading-relaxed">
      <strong>Mode: Full Wedding Cake Score.</strong> All documents have been
      Function-classified. Each document's score counts how many Function
      values (Teaching / Research / Engagement / Operations) deliver positive
      keyword matches in ALL the rule's required pillars at the same time.
    </div>
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
// v1 mode: Pillar coverage prerequisite
// ---------------------------------------------------------------------------

interface V1PillarStatus {
  value: LensValue
  hit: boolean
  matchCount: number
}

function v1PillarStatus(matrix: CoverageMatrix, documentId: string, requiredValues: LensValue[]): V1PillarStatus[] {
  const totals = matrix.lensTotals?.[documentId] ?? {}
  return requiredValues.map((value) => {
    const matchCount = totals[value.id] ?? 0
    return { value, hit: matchCount > 0, matchCount }
  })
}

function V1PerDocumentScore({
  doc,
  matrix,
  requiredValues,
}: {
  doc: Document
  matrix: CoverageMatrix
  requiredValues: LensValue[]
}) {
  const pillars = useMemo(
    () => v1PillarStatus(matrix, doc.id, requiredValues),
    [matrix, doc.id, requiredValues]
  )
  const score = pillars.filter((p) => p.hit).length
  const max = requiredValues.length
  return (
    <div className="space-y-6">
      <BigScore score={score} max={max} doc={doc} fullMode={false} />
      <div>
        <h2 className="font-medium text-sm mb-2">Pillar-by-pillar</h2>
        <div className="border border-border rounded-md divide-y divide-border">
          {pillars.map((p) => (
            <div key={p.value.id} className="flex items-center gap-3 px-4 py-3">
              {p.hit ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{p.value.displayName ?? p.value.value}</div>
                {p.value.description && <div className="text-xs text-muted-foreground">{p.value.description}</div>}
              </div>
              <div className="text-sm tabular-nums text-muted-foreground">
                {p.matchCount} match{p.matchCount === 1 ? '' : 'es'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function V1AggregateScore({
  matrix,
  requiredValues,
}: {
  matrix: CoverageMatrix
  requiredValues: LensValue[]
}) {
  const max = requiredValues.length
  const distribution = useMemo(() => {
    const buckets: Record<number, number> = {}
    for (let i = 0; i <= max; i++) buckets[i] = 0
    for (const doc of matrix.documents) {
      const score = v1PillarStatus(matrix, doc.id, requiredValues).filter((p) => p.hit).length
      buckets[score]++
    }
    return buckets
  }, [matrix, requiredValues, max])
  return <Histogram distribution={distribution} max={max} totalDocs={matrix.documents.length} />
}

// ---------------------------------------------------------------------------
// Full mode: Wedding Cake Score
// ---------------------------------------------------------------------------

interface FunctionStatus {
  value: LensValue
  satisfies: boolean
  /** For each required pillar: matchCount in this function. */
  pillarHits: Array<{ pillar: LensValue; matchCount: number; hit: boolean }>
}

function functionStatusForDoc(
  cells: Record<string, Record<string, number>>,
  requiredPillars: LensValue[],
  functionValues: LensValue[]
): FunctionStatus[] {
  return functionValues.map((fn) => {
    const pillarHits = requiredPillars.map((pillar) => {
      const matchCount = cells[pillar.id]?.[fn.id] ?? 0
      return { pillar, matchCount, hit: matchCount > 0 }
    })
    const satisfies = pillarHits.every((p) => p.hit)
    return { value: fn, satisfies, pillarHits }
  })
}

function FullPerDocumentScore({
  doc,
  matrix,
  requiredPillars,
  functionValues,
}: {
  doc: Document
  matrix: CoverageMatrix2D
  requiredPillars: LensValue[]
  functionValues: LensValue[]
}) {
  const functions = useMemo(
    () => functionStatusForDoc(matrix.cells[doc.id] ?? {}, requiredPillars, functionValues),
    [matrix, doc.id, requiredPillars, functionValues]
  )
  const score = functions.filter((f) => f.satisfies).length
  const max = functionValues.length

  return (
    <div className="space-y-6">
      <BigScore score={score} max={max} doc={doc} fullMode={true} />

      <div>
        <h2 className="font-medium text-sm mb-2">Function-by-function</h2>
        <div className="border border-border rounded-md divide-y divide-border">
          {functions.map((fn) => (
            <div key={fn.value.id} className="px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                {fn.satisfies ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div className="font-medium text-sm flex-1">
                  {fn.value.displayName ?? fn.value.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fn.satisfies
                    ? 'Delivers all required pillars'
                    : `Missing ${fn.pillarHits.filter((p) => !p.hit).length} of ${fn.pillarHits.length}`}
                </div>
              </div>
              <div className="ml-8 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {fn.pillarHits.map((p) => (
                  <div
                    key={p.pillar.id}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded border',
                      p.hit ? 'border-green-500/40 bg-green-50' : 'border-border bg-muted/20'
                    )}
                  >
                    <div className="font-medium">{p.pillar.displayName ?? p.pillar.value}</div>
                    <div className="text-muted-foreground tabular-nums">
                      {p.matchCount} match{p.matchCount === 1 ? '' : 'es'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FullAggregateScore({
  matrix,
  requiredPillars,
  functionValues,
}: {
  matrix: CoverageMatrix2D
  requiredPillars: LensValue[]
  functionValues: LensValue[]
}) {
  const max = functionValues.length
  const distribution = useMemo(() => {
    const buckets: Record<number, number> = {}
    for (let i = 0; i <= max; i++) buckets[i] = 0
    for (const doc of matrix.documents) {
      const score = functionStatusForDoc(
        matrix.cells[doc.id] ?? {},
        requiredPillars,
        functionValues
      ).filter((f) => f.satisfies).length
      buckets[score]++
    }
    return buckets
  }, [matrix, requiredPillars, functionValues, max])
  return <Histogram distribution={distribution} max={max} totalDocs={matrix.documents.length} />
}

// ---------------------------------------------------------------------------
// Shared widgets
// ---------------------------------------------------------------------------

function BigScore({
  score,
  max,
  doc,
  fullMode,
}: {
  score: number
  max: number
  doc: Document
  fullMode: boolean
}) {
  const label = scoreLabel(score, max, fullMode)
  const description = scoreDescription(score, max, fullMode)
  return (
    <div className="border border-border rounded-md p-6 flex items-center gap-6">
      <div className="font-display text-5xl font-semibold tabular-nums leading-none">
        {score}
        <span className="text-2xl text-muted-foreground"> / {max}</span>
      </div>
      <div className="flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground mt-1">{description}</div>
        <div className="text-xs text-muted-foreground mt-1 italic">
          {doc.title ?? doc.filename}
          {doc.year ? ` (${doc.year})` : ''}
        </div>
      </div>
    </div>
  )
}

function scoreLabel(score: number, max: number, fullMode: boolean): string {
  if (fullMode) {
    if (score === max) return `Level ${score} — full score`
    if (score === 0) return `Level ${score}`
    return `Level ${score}`
  }
  if (score === max) return 'Full pillar coverage'
  if (score === 0) return 'No pillar coverage'
  return 'Partial pillar coverage'
}

function scoreDescription(score: number, max: number, fullMode: boolean): string {
  if (fullMode) {
    if (score === max) return `All ${max} function values deliver positive matches in every required pillar.`
    if (score === 0) return `No function value delivers positive matches in every required pillar.`
    return `${score} of ${max} function values deliver positive matches in every required pillar.`
  }
  if (score === max) {
    return 'This document mentions all required pillars positively. Eligible to score above Level 0 in the full Wedding Cake Score once Function classification is run.'
  }
  if (score === 0) {
    return 'No positive matches in any required pillar. Will score Level 0 in the full Wedding Cake Score.'
  }
  return `This document mentions ${score} of ${max} required pillars positively. Will score Level 0 in the full Wedding Cake Score until all ${max} are covered.`
}

function Histogram({
  distribution,
  max,
  totalDocs,
}: {
  distribution: Record<number, number>
  max: number
  totalDocs: number
}) {
  const maxBucket = Math.max(1, ...Object.values(distribution))
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Distribution of {totalDocs} document{totalDocs === 1 ? '' : 's'} by score.
      </p>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {Array.from({ length: max + 1 }, (_, score) => {
              const count = distribution[score] ?? 0
              const widthPct = (count / maxBucket) * 100
              const sharePct = totalDocs > 0 ? (count / totalDocs) * 100 : 0
              return (
                <tr key={score}>
                  <td className="px-4 py-2.5 w-32 align-top">
                    <div className="font-display text-lg font-medium tabular-nums">
                      {score} <span className="text-muted-foreground text-base">/ {max}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-5 bg-muted/30 rounded-sm overflow-hidden">
                      <div
                        className={cn(
                          'h-full',
                          score === max ? 'bg-green-600' : score === 0 ? 'bg-red-500/60' : 'bg-yellow-500/60'
                        )}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums w-32 text-muted-foreground text-xs">
                    {count} doc{count === 1 ? '' : 's'} ({sharePct.toFixed(1)}%)
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
