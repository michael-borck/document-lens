import { useOutletContext } from 'react-router-dom'
import { Play, Loader2, Target, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAnalysis } from '@/hooks/useAnalysis'
import { computeFocus, type FocusResult } from '@/services/focus'
import { confidenceLabel } from '@/services/substance'
import { AiObservationsPanel } from '@/components/AiObservationsPanel'
import { observeProject } from '@/services/ai-observations'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'

/**
 * Focus — the deterministic "where should I look first?" view. Ranks documents
 * by how far they deviate from the corpus across the substance signals + score,
 * explains why each stands out, and shows per-signal extremes. An optional,
 * clearly-flagged AI narration reads the same numbers.
 */
export function Focus() {
  const vm = useOutletContext<ProjectViewModel>()

  const { run, running, result, error } = useAnalysis<FocusResult>(async () =>
    computeFocus({
      projectId: vm.project.id,
      keywordListId: vm.keywordList!.id,
      scoringRule: vm.scoringRule,
    })
  )

  if (!vm.setupComplete || !vm.keywordList) {
    return (
      <div className="px-8 py-10 max-w-3xl">
        <Header />
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6">
          Finish Setup (a keyword list, ideally a scoring rule, and some documents) to rank documents by notability.
        </p>
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

      <div className="flex items-center gap-3 mb-6">
        <Button onClick={run} disabled={running || vm.documentCount === 0} className="gap-2">
          {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Ranking…</> : <><Play className="h-4 w-4" /> {result ? 'Re-run' : 'Rank documents'}</>}
        </Button>
        {vm.documentCount === 0 && <span className="text-xs text-muted-foreground">Add documents in Setup first.</span>}
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      {result && (
        <div className="space-y-8">
          <NotableDocuments result={result} />
          <SignalExtremes result={result} />
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

function NotableDocuments({ result }: { result: FocusResult }) {
  const notable = result.documents.filter((d) => d.hits.length > 0).slice(0, 20)
  return (
    <section>
      <h2 className="font-medium text-sm mb-1">Most notable documents</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Documents that deviate most from the corpus, and why. Discount low-confidence rows
        (thin evidence). {result.documents.length - notable.length > 0 && `${result.documents.length - notable.length} unremarkable document(s) hidden.`}
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
                  {doc.title}
                  {doc.year ? <span className="text-muted-foreground font-normal"> ({doc.year})</span> : null}
                  {doc.company ? <span className="text-muted-foreground font-normal"> · {doc.company}</span> : null}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {doc.hits.map((h) => (
                    <span
                      key={h.signal}
                      className="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-muted text-foreground/80"
                    >
                      {h.direction === 'high' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {h.reason} ({h.z > 0 ? '+' : ''}{h.z.toFixed(1)}σ)
                    </span>
                  ))}
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

function SignalExtremes({ result }: { result: FocusResult }) {
  const fmt = (v: number | null) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(2))
  return (
    <section>
      <h2 className="font-medium text-sm mb-3">Per-signal extremes</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {result.extremes.map((ex) => (
          <div key={ex.signal} className="border border-border rounded-md p-3">
            <div className="text-sm font-medium mb-1.5">{ex.label}</div>
            <div className="text-xs flex items-start gap-1.5">
              <ArrowUp className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <span className="min-w-0">
                <span className="truncate block">{ex.highTitle ?? '—'}</span>
                <span className="text-muted-foreground tabular-nums">{fmt(ex.highValue)}</span>
              </span>
            </div>
            <div className="text-xs flex items-start gap-1.5 mt-1.5">
              <ArrowDown className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
              <span className="min-w-0">
                <span className="truncate block">{ex.lowTitle ?? '—'}</span>
                <span className="text-muted-foreground tabular-nums">{fmt(ex.lowValue)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
