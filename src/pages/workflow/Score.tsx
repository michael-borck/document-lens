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
import { listLensValues } from '@/services/lenses'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Document, LensValue } from '@/types/data'
import { cn } from '@/lib/utils'

type ViewMode = 'per-document' | 'aggregate'

/**
 * Score workflow — v1 scope: Pillar coverage prerequisite.
 *
 * The full 5-level Wedding Cake Score requires per-section Function
 * classification (counts how many of the four Functions deliver SDGs in
 * all three required Pillars simultaneously) — that's the Phase 3.5
 * embedding pipeline, still pending.
 *
 * Until then, this shows the structural prerequisite of the full
 * score: how many of the required pillars (Biosphere, Society, Economy)
 * the document mentions positively. A document scoring 3/3 here is the
 * universe of documents *eligible* to score above 0 in the full
 * Wedding Cake Score; one scoring 0/3 is guaranteed to be Level 0.
 *
 * Honest framing — display name is "Pillar coverage", a banner explains
 * the relationship to the full score.
 */
export function Score() {
  const vm = useOutletContext<ProjectViewModel>()
  const [pillarLensId, setPillarLensId] = useState<string | null>(null)
  const [requiredPillarValues, setRequiredPillarValues] = useState<string[]>([])
  const [matrix, setMatrix] = useState<CoverageMatrix | null>(null)
  const [requiredValues, setRequiredValues] = useState<LensValue[]>([])
  const [view, setView] = useState<ViewMode>('per-document')
  const [selectedDocId, setSelectedDocId] = useState<string>('')
  const [running, setRunning] = useState(false)

  // Parse the active scoring rule's definition to find the Pillar lens
  // and which pillars are required. v1 only handles the "wedding-cake"
  // rule type seeded by default; custom rules need their own evaluators.
  useEffect(() => {
    if (!vm.scoringRule) {
      setPillarLensId(null)
      setRequiredPillarValues([])
      return
    }
    const def = vm.scoringRule.definition as {
      type?: string
      pillarLensId?: string
      requiredPillars?: string[]
    }
    if (def.type === 'wedding-cake' && def.pillarLensId) {
      setPillarLensId(def.pillarLensId)
      setRequiredPillarValues(def.requiredPillars ?? [])
    } else {
      setPillarLensId(null)
      setRequiredPillarValues([])
    }
  }, [vm.scoringRule])

  // Resolve required pillar value strings -> LensValue rows.
  useEffect(() => {
    if (!pillarLensId) {
      setRequiredValues([])
      return
    }
    listLensValues(pillarLensId).then((values) => {
      const required = requiredPillarValues
        .map((name) => values.find((v) => v.value === name))
        .filter((v): v is LensValue => Boolean(v))
      setRequiredValues(required)
    })
  }, [pillarLensId, requiredPillarValues])

  const handleRun = async () => {
    if (!vm.keywordList || !pillarLensId) return
    setRunning(true)
    setMatrix(null)
    try {
      const m = await computeCoverage({
        projectId: vm.project.id,
        keywordListId: vm.keywordList.id,
        polarity: 'positive',
        lensId: pillarLensId,
      })
      setMatrix(m)
      setSelectedDocId(m.documents[0]?.id ?? '')
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
          description="Pick a keyword list on the Setup tab to enable Score."
        />
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
  if (!pillarLensId) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="Active rule isn't supported here yet"
          description={
            <>
              v1 only evaluates the built-in <strong>5-level Wedding Cake Score</strong>
              {' '}rule. Custom rules need their own evaluator (form-based rule
              editor + evaluator engine — Phase 3.5+).
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

  const hasResults = matrix !== null
  const selectedDoc = matrix?.documents.find((d) => d.id === selectedDocId)

  return (
    <div className="px-8 py-8 max-w-5xl">
      <Header />

      <ScopeBanner />

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
        {view === 'per-document' && hasResults && (
          <Field label="Document">
            <Select value={selectedDocId} onValueChange={setSelectedDocId}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {matrix!.documents.map((doc) => (
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
          . Click <strong>Run scoring</strong> to compute.
        </div>
      )}

      {matrix && view === 'per-document' && selectedDoc && (
        <PerDocumentScore
          doc={selectedDoc}
          matrix={matrix}
          requiredValues={requiredValues}
        />
      )}
      {matrix && view === 'aggregate' && (
        <AggregateScore matrix={matrix} requiredValues={requiredValues} />
      )}
    </div>
  )
}

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

function ScopeBanner() {
  return (
    <div className="mb-6 text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 leading-relaxed">
      <strong>v1 scope: Pillar coverage prerequisite.</strong> The full
      5-level Wedding Cake Score counts <em>how many of the four Functions
      (Teaching / Research / Engagement / Operations) deliver SDGs in all
      three required Pillars at the same time</em>. That needs Function
      classification per document section, which depends on the embedding
      pipeline (Phase 3.5). Until then, this shows the structural
      prerequisite: <strong>how many of the required pillars (Biosphere,
      Society, Economy) the document mentions positively</strong>. A
      document at <strong>3/3</strong> here is the universe of documents
      eligible to score above Level 0 in the full score; one at{' '}
      <strong>0/3</strong> is guaranteed Level 0.
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
// Per-document score
// ---------------------------------------------------------------------------

interface PillarStatus {
  value: LensValue
  hit: boolean
  matchCount: number
}

function pillarStatusForDoc(
  matrix: CoverageMatrix,
  documentId: string,
  requiredValues: LensValue[]
): PillarStatus[] {
  const totals = matrix.lensTotals?.[documentId] ?? {}
  return requiredValues.map((value) => {
    const matchCount = totals[value.id] ?? 0
    return { value, hit: matchCount > 0, matchCount }
  })
}

function PerDocumentScore({
  doc,
  matrix,
  requiredValues,
}: {
  doc: Document
  matrix: CoverageMatrix
  requiredValues: LensValue[]
}) {
  const pillars = useMemo(
    () => pillarStatusForDoc(matrix, doc.id, requiredValues),
    [matrix, doc.id, requiredValues]
  )
  const score = pillars.filter((p) => p.hit).length
  const max = requiredValues.length

  return (
    <div className="space-y-6">
      <div className="border border-border rounded-md p-6 flex items-center gap-6">
        <div className="font-display text-5xl font-semibold tabular-nums leading-none">
          {score}
          <span className="text-2xl text-muted-foreground"> / {max}</span>
        </div>
        <div className="flex-1">
          <div className="font-medium">{scoreLabel(score, max)}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {scoreDescription(score, max)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 italic">
            {doc.title ?? doc.filename}
            {doc.year ? ` (${doc.year})` : ''}
          </div>
        </div>
      </div>

      <div>
        <h2 className="font-medium text-sm mb-2">Pillar-by-pillar</h2>
        <div className="border border-border rounded-md divide-y divide-border">
          {pillars.map((p) => (
            <div key={p.value.id} className="flex items-center gap-3 px-4 py-3">
              {p.hit ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {p.value.displayName ?? p.value.value}
                </div>
                {p.value.description && (
                  <div className="text-xs text-muted-foreground">{p.value.description}</div>
                )}
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

function scoreLabel(score: number, max: number): string {
  if (score === max) return `Full pillar coverage`
  if (score === 0) return `No pillar coverage`
  return `Partial pillar coverage`
}

function scoreDescription(score: number, max: number): string {
  if (score === max) {
    return 'This document mentions all required pillars positively. Eligible to score above Level 0 in the full Wedding Cake Score once Function classification lands.'
  }
  if (score === 0) {
    return 'No positive matches in any required pillar. Will score Level 0 in the full Wedding Cake Score.'
  }
  return `This document mentions ${score} of ${max} required pillars positively. Will score Level 0 in the full Wedding Cake Score until all ${max} are covered.`
}

// ---------------------------------------------------------------------------
// Project aggregate (distribution)
// ---------------------------------------------------------------------------

function AggregateScore({
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
      const pillars = pillarStatusForDoc(matrix, doc.id, requiredValues)
      const score = pillars.filter((p) => p.hit).length
      buckets[score]++
    }
    return buckets
  }, [matrix, requiredValues, max])

  const totalDocs = matrix.documents.length
  const maxBucket = Math.max(1, ...Object.values(distribution))

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Distribution of {totalDocs} document{totalDocs === 1 ? '' : 's'} by pillar coverage score.
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
                    <div className="text-xs text-muted-foreground">
                      {scoreLabel(score, max)}
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
