import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Loader2, Play, CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  evaluateScore,
  SUPPORTED_RULE_TYPES,
  type ScoreEvaluation,
  type DocScore,
  type TraceStep,
} from '@/services/scoring'
import { EmptyState } from '@/components/EmptyState'
import { useAnalysis } from '@/hooks/useAnalysis'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Document } from '@/types/data'
import { cn } from '@/lib/utils'

type ViewMode = 'per-document' | 'aggregate'

/**
 * Score workflow.
 *
 * All scoring goes through the Score Evaluator (services/scoring.ts): it
 * resolves the rule's mode (full Wedding Cake vs v1 Pillar-coverage
 * prerequisite), runs the right evaluator from the Rule Evaluator Registry,
 * and returns a per-document score plus a generic Evaluation Trace. This page
 * just renders that trace — it no longer knows the Wedding-Cake math, so a new
 * rule type would render here for free.
 */
export function Score() {
  const vm = useOutletContext<ProjectViewModel>()

  const ruleType = useMemo(
    () => (vm.scoringRule?.definition as { type?: string } | undefined)?.type,
    [vm.scoringRule]
  )

  const [view, setView] = useState<ViewMode>('per-document')
  const [selectedDocId, setSelectedDocId] = useState<string>('')

  // Manual run; the hook owns running/error/result + cancel-safety.
  const { run, running, error, result: evaluation } = useAnalysis<ScoreEvaluation>(async () => {
    if (!vm.keywordList || !vm.scoringRule) {
      throw new Error('Pick a keyword list and scoring rule on the Setup tab.')
    }
    return evaluateScore({
      projectId: vm.project.id,
      keywordListId: vm.keywordList.id,
      definition: vm.scoringRule.definition,
      polarity: 'positive',
    })
  })

  // Default the document picker to the first scored document after each run.
  useEffect(() => {
    if (evaluation) setSelectedDocId(evaluation.documents[0]?.id ?? '')
  }, [evaluation])

  // Empty / unsupported gates.
  if (!vm.keywordList) {
    return (
      <Gate>
        <EmptyState title="No keyword list" description="Pick a keyword list on the Setup tab to enable Score." />
      </Gate>
    )
  }
  if (!vm.scoringRule) {
    return (
      <Gate>
        <EmptyState
          title="No scoring rule"
          description="Pick a scoring rule on the Setup tab. The default Wedding Cake Score is preloaded."
        />
      </Gate>
    )
  }
  if (!ruleType || !SUPPORTED_RULE_TYPES.has(ruleType)) {
    return (
      <Gate>
        <EmptyState
          title="Scoring rule type not supported"
          description={
            <>
              This rule uses type <code>{ruleType ?? '(none)'}</code> which has no
              evaluator registered. Supported types: <code>cross-coverage</code>,{' '}
              <code>coverage-count</code>.
            </>
          }
        />
      </Gate>
    )
  }
  if (vm.documentCount === 0) {
    return (
      <Gate>
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to score them."
        />
      </Gate>
    )
  }

  const hasResults = evaluation !== null
  const docs = evaluation?.documents ?? []
  const selectedDoc = docs.find((d) => d.id === selectedDocId)
  const selectedScore = selectedDoc ? evaluation?.perDocument.get(selectedDoc.id) : undefined

  return (
    <div className="px-8 py-8 max-w-5xl">
      <Header />

      {evaluation && ruleType === 'coverage-count' && <CoverageCountBanner />}
      {evaluation && ruleType !== 'coverage-count' && (evaluation.mode === 'v1-prerequisite' ? <V1Banner /> : <FullBanner />)}
      {error && (
        <div className="mb-6 text-xs border border-red-500/30 bg-red-50 dark:bg-red-950/20 rounded-md p-3">
          {error}
        </div>
      )}

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
        {view === 'per-document' && hasResults && docs.length > 0 && (
          <Field label="Document">
            <Select value={selectedDocId} onValueChange={setSelectedDocId}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {docs.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title ?? doc.filename}
                  </SelectItem>
                ))}
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
              {hasResults ? 'Re-run' : 'Run scoring'}
            </>
          )}
        </Button>
      </div>

      {!hasResults && !running && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          {vm.documentCount} document{vm.documentCount === 1 ? '' : 's'}
          {' '}· using <strong>{vm.keywordList.name}</strong> keywords
          {' '}· evaluated against <strong>{vm.scoringRule.name}</strong>.
          {' '}Click <strong>Run scoring</strong> to compute.
        </div>
      )}

      {hasResults && view === 'per-document' && selectedDoc && selectedScore && (
        <PerDocumentScore doc={selectedDoc} score={selectedScore} />
      )}
      {hasResults && view === 'aggregate' && evaluation && (
        <AggregateScore evaluation={evaluation} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Header + banners + small layout helpers
// ---------------------------------------------------------------------------

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-8 py-10">
      <Header />
      {children}
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

function V1Banner() {
  return (
    <div className="mb-6 flex items-start gap-3 text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 leading-relaxed">
      <div className="flex-1 min-w-0">
        <strong>Mode: Layer coverage only.</strong> Documents haven't been
        Subject-classified yet, so only layer-level coverage is shown — how many
        required layers the document mentions positively. Run{' '}
        <strong>Function classification</strong> on the Setup tab to unlock the
        full cross-coverage score.
      </div>
      <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
        <Link to={{ pathname: '../setup', hash: '#classification' }}>
          Classify now
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  )
}

function FullBanner() {
  return (
    <div className="mb-6 text-xs border border-green-500/30 bg-green-50 dark:bg-green-950/20 rounded-md p-3 leading-relaxed">
      <strong>Mode: Full cross-coverage score.</strong> All documents have been
      Subject-classified. Each document's score counts how many Subject values
      deliver positive keyword matches in ALL required Layers at the same time.
    </div>
  )
}

function CoverageCountBanner() {
  return (
    <div className="mb-6 text-xs border border-blue-500/30 bg-blue-50 dark:bg-blue-950/20 rounded-md p-3 leading-relaxed">
      <strong>Mode: Coverage count.</strong> Score = how many of the
      rule's categories this document covers with positive keyword matches.
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
// Per-document score + the generic "Why this score" panel (Evaluation Trace)
// ---------------------------------------------------------------------------

function PerDocumentScore({ doc, score }: { doc: Document; score: DocScore }) {
  return (
    <div className="space-y-6">
      <BigScore score={score.score} max={score.max} doc={doc} />
      <WhyThisScorePanel trace={score.trace} />
    </div>
  )
}

function WhyThisScorePanel({ trace }: { trace: TraceStep[] }) {
  return (
    <div>
      <h2 className="font-medium text-sm mb-2">Why this score</h2>
      <div className="border border-border rounded-md divide-y divide-border">
        {trace.map((step, i) => (
          <div key={`${step.label}-${i}`} className="flex items-center gap-3 px-4 py-3">
            {step.status === 'met' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{step.label}</div>
              {step.detail && <div className="text-xs text-muted-foreground">{step.detail}</div>}
            </div>
            <div className="text-sm tabular-nums text-muted-foreground">
              {step.count} match{step.count === 1 ? '' : 'es'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BigScore({ score, max, doc }: { score: number; max: number; doc: Document }) {
  return (
    <div className="border border-border rounded-md p-6 flex items-center gap-6">
      <div className="font-display text-5xl font-semibold tabular-nums leading-none">
        {score}
        <span className="text-2xl text-muted-foreground"> / {max}</span>
      </div>
      <div className="flex-1">
        <div className="font-medium">
          {score === max ? `Level ${score} — full score` : `Level ${score}`}
        </div>
        <div className="text-sm text-muted-foreground mt-1">
          {score} of {max} criteria met.
        </div>
        <div className="text-xs text-muted-foreground mt-1 italic">
          {doc.title ?? doc.filename}
          {doc.year ? ` (${doc.year})` : ''}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Project distribution
// ---------------------------------------------------------------------------

function AggregateScore({ evaluation }: { evaluation: ScoreEvaluation }) {
  const { distribution, max, total } = useMemo(() => {
    const scores = evaluation.documents
      .map((d) => evaluation.perDocument.get(d.id))
      .filter((s): s is DocScore => Boolean(s))
    const maxVal = scores[0]?.max ?? 0
    const buckets: Record<number, number> = {}
    for (let i = 0; i <= maxVal; i++) buckets[i] = 0
    for (const s of scores) buckets[s.score] = (buckets[s.score] ?? 0) + 1
    return { distribution: buckets, max: maxVal, total: scores.length }
  }, [evaluation])

  return <Histogram distribution={distribution} max={max} totalDocs={total} />
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
