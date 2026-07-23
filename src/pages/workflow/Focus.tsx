import { useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Play, Loader2, Target, ArrowUp, ArrowDown, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAnalysis } from '@/hooks/useAnalysis'
import { computeFocus, SIGNALS, type FocusResult } from '@/services/focus'
import { confidenceLabel } from '@/services/substance'
import { AiObservationsPanel } from '@/components/AiObservationsPanel'
import { observeProject } from '@/services/ai-observations'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'

/**
 * Focus — the deterministic "where should I look first?" view, and the
 * project's hub (ADR-0029). Ranks documents by how far they deviate from the
 * corpus across the substance signals + score, explains why each stands out,
 * and DEEP-LINKS every finding into the tool that explains it: signal chips
 * open Compare preset to that metric (or Score), document titles open Read on
 * that document. An optional, clearly-flagged AI narration reads the same
 * numbers.
 */

/** Where a signal finding drills down to. */
function signalPath(projectId: string, signal: string): string | null {
  if (signal === 'score') return `/projects/${projectId}/score`
  if (['repetition', 'diversity', 'intensity', 'evidence-reuse', 'coverage-spread'].includes(signal)) {
    return `/projects/${projectId}/compare?metric=${signal}`
  }
  return null
}

function readPath(projectId: string, documentId: string): string {
  return `/projects/${projectId}/read?doc=${documentId}`
}

/** Plain-English gloss for a signal key, for tooltips and the glossary. */
const SIGNAL_BY_KEY = new Map(SIGNALS.map((s) => [s.key, s]))

export function Focus() {
  const vm = useOutletContext<ProjectViewModel>()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [stratify, setStratify] = useState<'year' | 'corpus'>('year')
  const [yearMin, setYearMin] = useState<string>('')
  const [yearMax, setYearMax] = useState<string>('')

  const { run, running, result, error } = useAnalysis<FocusResult>(async () =>
    computeFocus({
      projectId: vm.project.id,
      keywordListId: vm.keywordList!.id,
      scoringRule: vm.scoringRule,
      stratify,
      yearMin: yearMin ? Number(yearMin) : undefined,
      yearMax: yearMax ? Number(yearMax) : undefined,
    })
  )

  if (!vm.setupComplete || !vm.keywordList) {
    return (
      <div className="px-8 py-10 max-w-3xl">
        <Header />
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 flex items-center justify-between gap-4">
          <span>
            Finish Setup (a keyword list, ideally a scoring rule, and some documents) to rank documents by notability.
          </span>
          <Button variant="outline" onClick={() => navigate(`/projects/${projectId}/setup`)} className="gap-1.5 shrink-0">
            Go to Setup
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-5xl">
      <Header />
      <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
        Ranks documents by how far they deviate from the rest of this corpus across the
        deterministic signals (pillar coverage, repetition, diversity, intensity, evidence
        reuse, coverage spread), so you know where to look first. Fully reproducible — the
        same corpus and configuration always give the same ranking.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="text-xs">
          <span className="block text-muted-foreground mb-1">Compare each document against</span>
          <select
            value={stratify}
            onChange={(e) => setStratify(e.target.value as 'year' | 'corpus')}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="year">Others from the same year</option>
            <option value="corpus">The whole corpus</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground mb-1">Year ≥</span>
          <Input type="number" value={yearMin} onChange={(e) => setYearMin(e.target.value)} placeholder="(all)" className="w-28" />
        </label>
        <label className="text-xs">
          <span className="block text-muted-foreground mb-1">Year ≤</span>
          <Input type="number" value={yearMax} onChange={(e) => setYearMax(e.target.value)} placeholder="(all)" className="w-28" />
        </label>
        <Button onClick={run} disabled={running || vm.documentCount === 0} className="gap-2">
          {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Ranking…</> : <><Play className="h-4 w-4" /> {result ? 'Re-run' : 'Rank documents'}</>}
        </Button>
        {vm.documentCount === 0 && <span className="text-xs text-muted-foreground">Add documents in Setup first.</span>}
      </div>
      <p className="text-xs text-muted-foreground mb-6 max-w-3xl">
        A corpus spanning years is a moving target: disclosure norms shift, so pooling every
        year would rank the oldest documents as notable simply for being old. Comparing within
        the year answers &ldquo;unusual <em>for its year</em>&rdquo;. Switch to the whole corpus
        for a single-year corpus, or when the drift is what you want to see.
      </p>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <SignalGlossary />

      {result && projectId && (
        <div className="space-y-8">
          <NotableDocuments result={result} projectId={projectId} />
          <SignalExtremes result={result} projectId={projectId} />
        </div>
      )}

      <div className="mt-10">
        <AiObservationsPanel
          label="Interpret the project"
          onRun={() =>
            observeProject({
              projectId: vm.project.id,
              projectName: vm.project.name,
              keywordListId: vm.keywordList!.id,
              keywordListName: vm.keywordList!.name,
              scoringRule: vm.scoringRule,
            })
          }
        />
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="mb-2">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5" />
        <h1 className="font-display text-2xl font-medium tracking-tight">Focus</h1>
      </div>
      <p className="text-muted-foreground italic mt-1">Which documents should you look at first?</p>
    </header>
  )
}

/**
 * Plain-English explanation of what Focus measures, collapsed by default so it
 * doesn't crowd the ranking but is always one click away. Researchers using
 * this are domain experts, not statisticians: nothing here assumes the reader
 * knows what a standard deviation is.
 */
function SignalGlossary() {
  return (
    <details className="mb-6 border border-border rounded-md">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">
        What do these signals mean?
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-4 text-sm">
        <p className="text-muted-foreground max-w-3xl">
          Every document is measured on six signals, then compared with the rest of your
          corpus. A document is called out when it sits near the top or bottom on one of
          them — not because a high or low value is good or bad, but because a document
          unlike its neighbours is the one worth reading first.
        </p>

        <dl className="space-y-3">
          {SIGNALS.map((s) => (
            <div key={s.key}>
              <dt className="font-medium">{s.label}</dt>
              <dd className="text-muted-foreground max-w-3xl">
                {s.plain}
                <span className="block mt-0.5 text-xs">
                  <strong className="font-medium text-foreground/70">Near the top:</strong> {s.meansHigh}{' '}
                  <strong className="font-medium text-foreground/70">Near the bottom:</strong> {s.meansLow}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <dl className="space-y-3 border-t border-border pt-3">
          <div>
            <dt className="font-medium">The σ figure on each chip</dt>
            <dd className="text-muted-foreground max-w-3xl">
              How far this document sits from the corpus average on that signal. Around 1
              means unusual, 2 means markedly unusual, 3 means it stands well apart from
              everything else. The sign says which direction: + is above average, − below.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Notability</dt>
            <dd className="text-muted-foreground max-w-3xl">
              The overall &ldquo;how unlike the rest of the corpus is this?&rdquo; figure that
              orders the list. It adds up how far the document sits from average across all
              six signals, then scales that down when the evidence is thin. Bigger means
              read it sooner; the number has no meaning on its own, only relative to the
              others in this corpus.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Confidence</dt>
            <dd className="text-muted-foreground max-w-3xl">
              How much evidence the signals rest on — a long document with plenty of keyword
              matches reads &ldquo;high&rdquo;; a short one with a handful of matches reads
              &ldquo;low&rdquo;, and its ranking should be taken with a pinch of salt. A
              document with no stored word count is judged on match volume alone.
            </dd>
          </div>
        </dl>
      </div>
    </details>
  )
}

function NotableDocuments({ result, projectId }: { result: FocusResult; projectId: string }) {
  const notable = result.documents.filter((d) => d.hits.length > 0).slice(0, 20)
  return (
    <section>
      <h2 className="font-medium text-sm mb-1">Most notable documents</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Documents that deviate most from {result.stratify === 'year' ? 'others of their own year' : 'the rest of the corpus'}, and why.
        Discount low-confidence rows (thin evidence). Click a document to read it, or a signal
        to see the corpus ranked on it. {result.documents.length - notable.length > 0 && `${result.documents.length - notable.length} unremarkable document(s) hidden.`}
        {result.fellBackToCorpus > 0 && ` ${result.fellBackToCorpus} document(s) had too few peers in their year and were compared against the whole corpus instead.`}
      </p>
      {notable.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-border rounded-md p-4">
          Nothing stands out — every document sits close to the corpus average on every signal.
        </p>
      ) : (
        <ol className="border border-border rounded-md divide-y divide-border">
          {notable.map((doc, i) => (
            <li key={doc.documentId} className="px-4 py-3 flex items-start gap-3">
              <span className="text-sm tabular-nums text-muted-foreground w-6 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  <Link
                    to={readPath(projectId, doc.documentId)}
                    className="hover:underline underline-offset-2"
                    title="Read this document"
                  >
                    {doc.title}
                  </Link>
                  {doc.year ? <span className="text-muted-foreground font-normal"> ({doc.year})</span> : null}
                  {doc.company ? <span className="text-muted-foreground font-normal"> · {doc.company}</span> : null}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {doc.hits.map((h) => {
                    const chip = (
                      <>
                        {h.direction === 'high' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {h.reason} ({h.z > 0 ? '+' : ''}{h.z.toFixed(1)}σ)
                      </>
                    )
                    const path = signalPath(projectId, h.signal)
                    const def = SIGNAL_BY_KEY.get(h.signal)
                    const tip = def
                      ? `${def.plain}\n\n${h.direction === 'high' ? def.meansHigh : def.meansLow}` +
                        (path ? `\n\nClick to see the whole corpus ranked on ${def.label.toLowerCase()}.` : '')
                      : `See the whole corpus ranked on ${h.label.toLowerCase()}`
                    return path ? (
                      <Link
                        key={h.signal}
                        to={path}
                        title={tip}
                        className="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-muted text-foreground/80 hover:bg-muted/70 hover:text-foreground transition-colors"
                      >
                        {chip}
                      </Link>
                    ) : (
                      <span
                        key={h.signal}
                        title={tip}
                        className="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-muted text-foreground/80"
                      >
                        {chip}
                      </span>
                    )
                  })}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0 text-right">
                <div className="tabular-nums font-medium text-foreground">{doc.notability.toFixed(1)}</div>
                <div>conf: {confidenceLabel(doc.confidence)}</div>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function SignalExtremes({ result, projectId }: { result: FocusResult; projectId: string }) {
  const fmt = (v: number | null) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(2))
  const extremeTitle = (docId: string | null, title: string | null) => {
    if (!docId || !title) return <span className="truncate block">—</span>
    return (
      <Link to={readPath(projectId, docId)} className="truncate block hover:underline underline-offset-2" title="Read this document">
        {title}
      </Link>
    )
  }
  return (
    <section>
      <h2 className="font-medium text-sm mb-3">Per-signal extremes</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {result.extremes.map((ex) => {
          const path = signalPath(projectId, ex.signal)
          const def = SIGNAL_BY_KEY.get(ex.signal)
          return (
            <div key={ex.signal} className="border border-border rounded-md p-3">
              <div className="text-sm font-medium mb-1.5">
                {path ? (
                  <Link
                    to={path}
                    className="hover:underline underline-offset-2"
                    title={def ? `${def.plain}\n\nClick to see the whole corpus ranked on this signal.` : 'See the whole corpus ranked on this signal'}
                  >
                    {ex.label}
                  </Link>
                ) : (
                  ex.label
                )}
              </div>
              {def && <p className="text-xs text-muted-foreground mb-2">{def.plain}</p>}
              <div className="text-xs flex items-start gap-1.5">
                <ArrowUp className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <span className="min-w-0">
                  {extremeTitle(ex.highDocId, ex.highTitle)}
                  <span className="text-muted-foreground tabular-nums">{fmt(ex.highValue)}</span>
                </span>
              </div>
              <div className="text-xs flex items-start gap-1.5 mt-1.5">
                <ArrowDown className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <span className="min-w-0">
                  {extremeTitle(ex.lowDocId, ex.lowTitle)}
                  <span className="text-muted-foreground tabular-nums">{fmt(ex.lowValue)}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
