import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Play, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { runAudit, type AuditResult, type AuditProgress, type AuditFinding, type AuditMode } from '@/services/audit'
import { EmptyState } from '@/components/EmptyState'
import { useAnalysis } from '@/hooks/useAnalysis'
import { PolaritySelector, type Polarity } from '@/components/workflow/PolaritySelector'
import { MLCaveatBanner } from '@/components/workflow/MLCaveatBanner'
import { toast } from '@/stores/toastStore'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Axis } from '@/types/data'
import { cn } from '@/lib/utils'

type Severity = 'high' | 'medium' | 'low'

/**
 * Audit workflow — two modes for the methodology's "contextual relevance
 * check":
 *
 *   Anomalies — flags keyword-bearing sentences whose semantic domain
 *   differs from their parent section's. Surfaces mis-categorised
 *   disclosure or false-positive keyword detection.
 *
 *   Confirmations — surfaces keyword usages in sections whose semantic
 *   domain has been classified as the expected Function. The defensible
 *   "yes, this is being used in the right context" view a researcher
 *   can show a sceptical reviewer (US-F-03).
 */
export function Audit() {
  const vm = useOutletContext<ProjectViewModel>()

  const [mode, setMode] = useState<AuditMode>('anomalies')
  const [contextAxes, setContextAxes] = useState<Axis[]>([])
  const [axisId, setAxisId] = useState<string>('')
  const [polarity, setPolarity] = useState<Polarity>('both')
  const [threshold, setThreshold] = useState<number>(0.3)
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all')

  // Audit's progress is a rich object (per-document), so it keeps its own
  // progress state; useAnalysis owns running / error / result + cancel-safety.
  const [progress, setProgress] = useState<AuditProgress | null>(null)

  useEffect(() => {
    const docContextAxes = vm.axes.filter((a) => a.type === 'document-context')
    setContextAxes(docContextAxes)
    setAxisId((current) => current || docContextAxes[0]?.id || '')
  }, [vm.axes])

  const { run, running, error, result, reset } = useAnalysis<AuditResult>(async () => {
    if (!vm.keywordList || !axisId) throw new Error('Pick a keyword list and a context axis.')
    setProgress(null)
    try {
      const out = await runAudit(
        {
          projectId: vm.project.id,
          keywordListId: vm.keywordList.id,
          axisId,
          mode,
          threshold,
          polarity: polarity === 'both' ? undefined : polarity,
        },
        setProgress
      )
      const noun = mode === 'confirmations' ? 'confirmation' : 'anomaly'
      const plural = mode === 'confirmations' ? 'confirmations' : 'anomalies'
      const label = out.findings.length === 1 ? noun : plural
      const summary = `Found ${out.findings.length} ${label} in ${out.documentsAnalysed} document${out.documentsAnalysed === 1 ? '' : 's'}`
      if (out.documentsFailed > 0) {
        // Some documents analysed, some failed (e.g. too large for the engine).
        toast.info(
          `${summary}. ${out.documentsFailed} document${out.documentsFailed === 1 ? '' : 's'} couldn't be analysed`,
          'The analysis engine may have struggled with a large document. Check its status and re-run to retry.'
        )
      } else {
        toast.success(summary)
      }
      return out
    } finally {
      setProgress(null)
    }
  })

  // Errors surface once, in the inline banner below (which shows the actual
  // message) — no duplicate generic toast.

  if (!vm.keywordList) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState title="No keyword list" description="Pick a keyword list on the Setup tab to enable Audit." />
      </div>
    )
  }
  if (vm.documentCount === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to audit them."
        />
      </div>
    )
  }
  if (contextAxes.length === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No document-context axis active"
          description={
            <>
              Audit needs a document-context axis (e.g., Function) active on this project.
              Activate one on the Setup tab.
            </>
          }
        />
      </div>
    )
  }

  const filteredFindings = result
    ? result.findings.filter((f) => severityFilter === 'all' || f.severity === severityFilter)
    : []

  return (
    <div className="px-8 py-8 max-w-6xl">
      <Header />

      <ModeToggle mode={mode} onChange={(m) => { setMode(m); reset() }} />

      <CaveatBanner mode={mode} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Field label="Axis (domains)">
          <Select value={axisId} onValueChange={setAxisId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {contextAxes.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Polarity">
          <PolaritySelector value={polarity} onChange={setPolarity} width="w-full" />
        </Field>
        {mode === 'anomalies' ? (
          <Field label="Threshold (sensitivity)">
            <Select value={String(threshold)} onValueChange={(v) => setThreshold(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.2">0.2 (more findings, more noise)</SelectItem>
                <SelectItem value="0.3">0.3 (default)</SelectItem>
                <SelectItem value="0.4">0.4 (fewer findings, more confidence)</SelectItem>
                <SelectItem value="0.5">0.5 (only strong dislocations)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <div /> /* keep grid layout stable when threshold hides */
        )}
        <div className="flex items-end">
          <Button onClick={run} disabled={running} className="gap-2 w-full">
            {running ? (<><Loader2 className="h-4 w-4 animate-spin" /> Running…</>) :
              (<><Play className="h-4 w-4" /> {result ? 'Re-run' : `Run ${mode === 'confirmations' ? 'confirmations' : 'audit'}`}</>)}
          </Button>
        </div>
      </div>

      {progress && <AuditProgressBar progress={progress} />}

      {error && (
        <div className="mb-4 text-sm text-destructive border border-destructive/30 rounded-md p-3">{error}</div>
      )}

      {result && (
        <ResultsView
          result={result}
          findings={filteredFindings}
          severityFilter={severityFilter}
          onSeverityFilterChange={setSeverityFilter}
        />
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="mb-3">
      <h1 className="font-display text-2xl font-medium tracking-tight">Audit</h1>
      <p className="text-muted-foreground italic mt-1">
        Is each keyword being used in the right context?
      </p>
    </header>
  )
}

function ModeToggle({ mode, onChange }: { mode: AuditMode; onChange: (m: AuditMode) => void }) {
  return (
    <div role="group" aria-label="Audit mode" className="inline-flex items-center gap-0.5 text-xs border border-border rounded-md p-0.5 mb-3">
      <button
        type="button"
        aria-pressed={mode === 'anomalies'}
        onClick={() => onChange('anomalies')}
        className={cn(
          'px-3 py-1.5 rounded transition-colors inline-flex items-center gap-1.5',
          mode === 'anomalies' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40'
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        Anomalies
      </button>
      <button
        type="button"
        aria-pressed={mode === 'confirmations'}
        onClick={() => onChange('confirmations')}
        className={cn(
          'px-3 py-1.5 rounded transition-colors inline-flex items-center gap-1.5',
          mode === 'confirmations' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40'
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Confirmations
      </button>
    </div>
  )
}

function CaveatBanner({ mode }: { mode: AuditMode }) {
  if (mode === 'confirmations') {
    return (
      <div className="mb-6 text-xs border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 rounded-md p-3 leading-relaxed">
        <strong>Confirmations mode.</strong> Surfaces keyword usages that
        occur in sections whose semantic domain has been classified as
        the expected Function. Defensible "yes, this keyword is being
        used in the right context" evidence to back the analysis. Uses
        cached classifications from Setup — no backend call, instant.
        Severity reflects each section's classification confidence.
      </div>
    )
  }
  return (
    <MLCaveatBanner id="audit-anomalies">
      <strong>Anomalies mode.</strong> Surfaces sentences whose own
      semantic domain differs from their parent section's. When such a
      sentence contains an active keyword, it's flagged as an anomaly to
      investigate. Section + sentence domains are inferred from sentence-
      embedding similarity — treat each finding as a strong signal worth
      reading, not a definitive verdict.
    </MLCaveatBanner>
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

function AuditProgressBar({ progress }: { progress: AuditProgress }) {
  const pct = ((progress.documentIndex + 1) / progress.totalDocuments) * 100
  return (
    <div className="mb-4 border border-border rounded-md p-3 bg-muted/30">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="truncate">
          <Loader2 className="inline h-3 w-3 mr-1.5 animate-spin" />
          {progress.documentLabel}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {progress.documentIndex + 1} / {progress.totalDocuments}
        </span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-foreground transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function ResultsView({
  result,
  findings,
  severityFilter,
  onSeverityFilterChange,
}: {
  result: AuditResult
  findings: AuditFinding[]
  severityFilter: Severity | 'all'
  onSeverityFilterChange: (s: Severity | 'all') => void
}) {
  // Severity counts (across all unfiltered findings).
  const counts = {
    high: result.findings.filter((f) => f.severity === 'high').length,
    medium: result.findings.filter((f) => f.severity === 'medium').length,
    low: result.findings.filter((f) => f.severity === 'low').length,
  }

  // Mode peeked off the first finding (all findings in a result share
  // the same mode since they came from one runAudit call).
  const mode: AuditMode = result.findings[0]?.mode ?? 'anomalies'
  const noun = mode === 'confirmations' ? 'confirmation' : 'anomaly'
  const plural = mode === 'confirmations' ? 'confirmations' : 'anomalies'
  const label = result.findings.length === 1 ? noun : plural

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-muted-foreground">
          <strong>{result.findings.length}</strong> {label} found{' '}
          across <strong>{result.documentsAnalysed}</strong> document{result.documentsAnalysed === 1 ? '' : 's'}
          {mode === 'anomalies' && result.totalSentencesAnalysed > 0 && (
            <> ({result.totalSentencesAnalysed.toLocaleString()} sentences analysed)</>
          )}
          {result.cacheHits > 0 && (
            <> · {result.cacheHits} from cache</>
          )}
          {result.documentsUnavailable > 0 && (
            <> · {result.documentsUnavailable} doc{result.documentsUnavailable === 1 ? '' : 's'} skipped (no extracted text)</>
          )}
        </p>
        <SeverityFilter
          counts={counts}
          value={severityFilter}
          onChange={onSeverityFilterChange}
        />
      </div>

      {findings.length === 0 ? (
        result.findings.length === 0 ? (
          <EmptyState
            title={mode === 'confirmations' ? 'No confirmations' : 'No anomalies'}
            description={
              mode === 'confirmations'
                ? 'No keyword matches landed in classified sections. Run Function classification on Setup, or check that your active keyword list overlaps the corpus.'
                : 'No keyword-bearing sentences were classified as out-of-section. Either your corpus is well-categorised, or try lowering the threshold for more sensitivity.'
            }
          />
        ) : (
          <EmptyState
            title={`No ${plural} match this severity filter`}
            description="Switch the severity filter back to 'All' to see every finding."
          />
        )
      ) : (
        <ul className="space-y-3">
          {findings.map((f, i) => (
            <FindingCard key={i} finding={f} />
          ))}
        </ul>
      )}
    </div>
  )
}

function SeverityFilter({
  counts,
  value,
  onChange,
}: {
  counts: { high: number; medium: number; low: number }
  value: Severity | 'all'
  onChange: (s: Severity | 'all') => void
}) {
  const total = counts.high + counts.medium + counts.low
  const opts: Array<{ key: Severity | 'all'; label: string; count: number }> = [
    { key: 'all', label: 'All', count: total },
    { key: 'high', label: 'High', count: counts.high },
    { key: 'medium', label: 'Medium', count: counts.medium },
    { key: 'low', label: 'Low', count: counts.low },
  ]
  return (
    <div role="group" aria-label="Filter by severity" className="flex items-center gap-1 text-xs border border-border rounded-md p-0.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'px-2 py-1 rounded transition-colors',
            value === o.key ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/40'
          )}
        >
          {o.label} <span className="tabular-nums">({o.count})</span>
        </button>
      ))}
    </div>
  )
}

function FindingCard({ finding }: { finding: AuditFinding }) {
  const isConfirmation = finding.mode === 'confirmations'
  const accent = isConfirmation
    ? 'border-emerald-500/40'
    : 'border-yellow-500/40'
  return (
    <li className="border border-border rounded-md p-4">
      <div className="flex items-center gap-3 mb-2">
        <SeverityBadge mode={finding.mode} severity={finding.severity} score={finding.dislocationScore} />
        <span className="text-sm font-medium">
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{finding.keyword}</code>
          {finding.keywordPolarity === 'counter' && (
            <span className="ml-2 text-[10px] uppercase text-muted-foreground">counter</span>
          )}
        </span>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {finding.documentTitle}
          {finding.documentYear !== null && <span> ({finding.documentYear})</span>}
        </div>
      </div>

      <blockquote className={cn('text-sm border-l-2 pl-3 py-1 text-muted-foreground italic', accent)}>
        “{finding.sentenceText}”
      </blockquote>

      {isConfirmation ? (
        <div className="mt-3 border border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/10 rounded p-2 text-xs">
          <div className="text-emerald-800 dark:text-emerald-300 uppercase tracking-wide text-[10px]">
            Confirmed in section classified as
          </div>
          <div className="font-medium mt-0.5">{finding.sectionDomain}</div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="border border-border rounded p-2">
            <div className="text-muted-foreground uppercase tracking-wide text-[10px]">In section</div>
            <div className="font-medium mt-0.5">{finding.sectionDomain}</div>
          </div>
          <div className="border border-yellow-500/40 bg-yellow-50/50 dark:bg-yellow-950/10 rounded p-2">
            <div className="text-yellow-800 dark:text-yellow-300 uppercase tracking-wide text-[10px]">Reads as</div>
            <div className="font-medium mt-0.5">{finding.sentenceDomain}</div>
          </div>
        </div>
      )}
    </li>
  )
}

function SeverityBadge({ mode, severity, score }: { mode: AuditMode; severity: Severity; score: number }) {
  const isConfirmation = mode === 'confirmations'
  const styles: Record<Severity, string> = isConfirmation
    ? {
        high: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        medium: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        low: 'bg-muted text-muted-foreground border-border',
      }
    : {
        high: 'bg-red-100 text-red-800 border-red-300',
        medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        low: 'bg-muted text-muted-foreground border-border',
      }
  const Icon = isConfirmation ? CheckCircle2 : AlertTriangle
  const scoreLabel = isConfirmation
    ? `Section classification confidence: ${score.toFixed(2)} (cosine similarity to the section's classified Function)`
    : `Dislocation score: ${score.toFixed(2)}`
  // Confirmations: surface the raw confidence number alongside the
  // bucket label, since the bucket alone ("low") reads as a quality
  // judgement when it actually means "weakly classified". Anomalies:
  // bucket label is meaningful on its own (severity of the dislocation).
  const label = isConfirmation && score > 0
    ? `${severity} · ${(score * 100).toFixed(0)}%`
    : severity
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', styles[severity])}
      title={scoreLabel}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
