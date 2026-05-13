import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Play, Sparkles, ChevronRight, ChevronDown, FileText, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computeNgrams, type ComputeNgramsResult, type NgramSize, type NgramResult } from '@/services/ngrams'
import { getDocument } from '@/services/documents'
import { createSynonym } from '@/services/keyword-lists'
import {
  discoverSynonyms,
  type DiscoverSynonymsResult,
  type DiscoverSynonymsProgress,
  type SynonymCandidate,
} from '@/services/synonym-discovery'
import { toast } from '@/stores/toastStore'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Document, Keyword, KeywordPolarity } from '@/types/data'

type SizeFilter = '2' | '3' | 'both'
type Scope = 'all' | 'single'

export function Discover() {
  const vm = useOutletContext<ProjectViewModel>()
  const [activeTab, setActiveTab] = useState<'phrases' | 'synonyms'>('phrases')

  if (vm.documentCount === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to discover phrases and synonyms."
        />
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <Header />

      <div className="border-b border-border mb-6 flex">
        <TabButton
          label="Phrases"
          subtitle="Frequent 2-3 word phrases in your corpus"
          active={activeTab === 'phrases'}
          onClick={() => setActiveTab('phrases')}
        />
        <TabButton
          label="Synonyms"
          subtitle="Corpus terms close to your keywords"
          active={activeTab === 'synonyms'}
          onClick={() => setActiveTab('synonyms')}
        />
      </div>

      {activeTab === 'phrases' ? (
        <PhrasesTab projectId={vm.project.id} documentIds={vm.project.documentIds} />
      ) : (
        <SynonymsTab vm={vm} />
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight">Discover</h1>
      <p className="text-muted-foreground italic mt-1">
        What words is your corpus using that you should know about?
      </p>
    </header>
  )
}

function TabButton({
  label,
  subtitle,
  active,
  onClick,
}: {
  label: string
  subtitle: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px text-left ${
        active
          ? 'border-foreground text-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      <div>{label}</div>
      <div className="text-[10px] text-muted-foreground font-normal mt-0.5">{subtitle}</div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Phrases sub-tab
// ---------------------------------------------------------------------------

function PhrasesTab({
  projectId,
  documentIds,
}: {
  projectId: string
  documentIds: string[]
}) {
  const [size, setSize] = useState<SizeFilter>('both')
  const [minCount, setMinCount] = useState<number>(3)
  const [scope, setScope] = useState<Scope>('all')
  const [singleDocId, setSingleDocId] = useState<string>('')
  const [docs, setDocs] = useState<Document[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ComputeNgramsResult | null>(null)

  // Load doc metadata for the single-doc picker.
  useEffect(() => {
    Promise.all(documentIds.map((id) => getDocument(id))).then((rows) => {
      setDocs(rows.filter((d): d is Document => d !== null))
    })
  }, [documentIds])

  const handleRun = async () => {
    if (scope === 'single' && !singleDocId) return
    setRunning(true)
    try {
      const sizes: NgramSize[] = size === '2' ? [2] : size === '3' ? [3] : [2, 3]
      const r = await computeNgrams({
        projectId,
        documentId: scope === 'single' ? singleDocId : undefined,
        sizes,
        minCount,
        topN: 200,
      })
      setResult(r)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <Field label="Scope">
          <Select value={scope} onValueChange={(v) => { setScope(v as Scope); setResult(null) }}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All project documents</SelectItem>
              <SelectItem value="single">Single document</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {scope === 'single' && (
          <Field label="Document">
            <Select value={singleDocId} onValueChange={setSingleDocId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Pick a document" />
              </SelectTrigger>
              <SelectContent>
                {docs.map((doc) => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.title || doc.filename}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Size">
          <Select value={size} onValueChange={(v) => setSize(v as SizeFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Bigrams + Trigrams</SelectItem>
              <SelectItem value="2">Bigrams (2 words)</SelectItem>
              <SelectItem value="3">Trigrams (3 words)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Min frequency">
          <Select value={String(minCount)} onValueChange={(v) => setMinCount(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">≥ 2</SelectItem>
              <SelectItem value="3">≥ 3</SelectItem>
              <SelectItem value="5">≥ 5</SelectItem>
              <SelectItem value="10">≥ 10</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex-1" />
        <Button
          onClick={handleRun}
          disabled={running || (scope === 'single' && !singleDocId)}
          className="gap-2"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              {result ? 'Re-run' : 'Run discovery'}
            </>
          )}
        </Button>
      </div>

      {!result ? (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          Click <strong>Run discovery</strong> to extract frequent 2- and 3-word phrases.
        </div>
      ) : result.results.length === 0 ? (
        <EmptyState
          title="No phrases above the minimum frequency"
          description="Lower the minimum frequency or add more documents to surface more phrases."
        />
      ) : (
        <PhrasesTable result={result} singleDocMode={scope === 'single'} />
      )}
    </div>
  )
}

function PhrasesTable({
  result,
  singleDocMode,
}: {
  result: ComputeNgramsResult
  singleDocMode: boolean
}) {
  const max = result.results[0]?.count ?? 1
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        {result.results.length} phrase{result.results.length === 1 ? '' : 's'} from{' '}
        {result.documentCount} document{result.documentCount === 1 ? '' : 's'} ·{' '}
        {result.totalTokens.toLocaleString()} total tokens analysed
      </p>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="font-medium w-8"></th>
              <th className="text-left font-medium px-4 py-2 w-16">Size</th>
              <th className="text-left font-medium px-4 py-2">Phrase</th>
              <th className="text-right font-medium px-4 py-2 w-24">Count</th>
              <th className="text-right font-medium px-4 py-2 w-24">In docs</th>
              <th className="text-left font-medium px-4 py-2 w-48">Frequency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.results.map((r) => {
              const key = `${r.size}:${r.phrase}`
              const isExpanded = expanded.has(key)
              const pct = (r.count / max) * 100
              // In single-doc mode, the only source is the doc the user
              // already picked — no useful info to expand. In multi-doc
              // mode (scope=All) we always allow expansion: even when a
              // phrase appears in only one document, the user wants to
              // know WHICH document.
              const expandable = !singleDocMode && r.sources.length >= 1
              return (
                <PhrasesRow
                  key={key}
                  ngram={r}
                  isExpanded={isExpanded}
                  expandable={expandable}
                  onToggle={() => toggle(key)}
                  pct={pct}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PhrasesRow({
  ngram,
  isExpanded,
  expandable,
  onToggle,
  pct,
}: {
  ngram: NgramResult
  isExpanded: boolean
  expandable: boolean
  onToggle: () => void
  pct: number
}) {
  return (
    <>
      <tr
        className={`hover:bg-muted/30 transition-colors ${expandable ? 'cursor-pointer' : ''}`}
        onClick={expandable ? onToggle : undefined}
      >
        <td className="px-2 py-1.5 text-center text-muted-foreground">
          {expandable && (
            isExpanded
              ? <ChevronDown className="h-3.5 w-3.5 inline" />
              : <ChevronRight className="h-3.5 w-3.5 inline" />
          )}
        </td>
        <td className="px-4 py-1.5 text-xs text-muted-foreground tabular-nums">
          {ngram.size}-gram
        </td>
        <td className="px-4 py-1.5 font-medium">{ngram.phrase}</td>
        <td className="px-4 py-1.5 text-right tabular-nums">{ngram.count.toLocaleString()}</td>
        <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
          {ngram.documentCount}
        </td>
        <td className="px-4 py-1.5">
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-foreground/60" style={{ width: `${pct}%` }} />
          </div>
        </td>
      </tr>
      {expandable && isExpanded && (
        <tr className="bg-muted/20">
          <td></td>
          <td colSpan={5} className="px-4 py-2">
            <div className="text-xs text-muted-foreground mb-1.5">Sources:</div>
            <ul className="space-y-1">
              {ngram.sources.map((src) => (
                <li key={src.documentId} className="flex items-center gap-2 text-xs">
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">
                    {src.title}
                    {src.year !== null && (
                      <span className="text-muted-foreground"> ({src.year})</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {src.count} match{src.count === 1 ? '' : 'es'}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Synonyms sub-tab — embedding-based candidate suggestions
// ---------------------------------------------------------------------------

function SynonymsTab({ vm }: { vm: ProjectViewModel }) {
  const [polarity, setPolarity] = useState<KeywordPolarity>('positive')
  const [minSimilarity, setMinSimilarity] = useState<number>(0.5)
  const [topN, setTopN] = useState<number>(8)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<DiscoverSynonymsProgress | null>(null)
  const [result, setResult] = useState<DiscoverSynonymsResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Per-keyword rejected candidates (kept in component state; nothing
  // is persisted — Rejects just hide locally so the user can focus on
  // the remaining list).
  const [rejected, setRejected] = useState<Record<string, Set<string>>>({})
  // Per-keyword accepted (locally tracked so the UI immediately reflects
  // the user's action without a re-fetch).
  const [accepted, setAccepted] = useState<Record<string, Set<string>>>({})

  const handleRun = async () => {
    if (!vm.keywordList) return
    setRunning(true)
    setError(null)
    setResult(null)
    setRejected({})
    setAccepted({})
    setProgress(null)
    try {
      const out = await discoverSynonyms(
        {
          projectId: vm.project.id,
          keywordListId: vm.keywordList.id,
          polarity,
          minSimilarity,
          topN,
        },
        setProgress
      )
      setResult(out)
      if (out.unavailable) {
        toast.error('Embedding model unavailable — backend returned 503.')
      } else {
        const total = out.perKeyword.reduce((s, k) => s + k.candidates.length, 0)
        toast.success(
          `Found ${total} candidate${total === 1 ? '' : 's'} across ${out.perKeyword.filter((k) => k.candidates.length > 0).length} keyword${out.perKeyword.length === 1 ? '' : 's'}`
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  const handleAccept = async (keyword: Keyword, candidate: SynonymCandidate) => {
    try {
      await createSynonym({
        keywordId: keyword.id,
        text: candidate.text,
        source: 'ai-suggested-accepted',
      })
      setAccepted((prev) => {
        const next = { ...prev }
        const set = new Set(next[keyword.id] ?? [])
        set.add(candidate.text)
        next[keyword.id] = set
        return next
      })
      toast.success(`Added "${candidate.text}" as a synonym for "${keyword.text}"`)
    } catch (err) {
      toast.error(`Failed to add synonym: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleReject = (keyword: Keyword, candidate: SynonymCandidate) => {
    setRejected((prev) => {
      const next = { ...prev }
      const set = new Set(next[keyword.id] ?? [])
      set.add(candidate.text)
      next[keyword.id] = set
      return next
    })
  }

  if (!vm.keywordList) {
    return (
      <EmptyState
        title="No keyword list"
        description="Pick a keyword list on the Setup tab to enable synonym discovery."
      />
    )
  }

  return (
    <div>
      <div className="mb-6 text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 leading-relaxed">
        Candidates are <strong>suggestions only</strong> from a sentence-embedding model — they're
        approximate. Treat each one as a hint to evaluate, not an authoritative synonym. Accepted
        candidates attach to the parent keyword (preserving provenance) and count in Coverage
        automatically.
      </div>

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <Field label="Polarity">
          <Select value={polarity} onValueChange={(v) => setPolarity(v as KeywordPolarity)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="positive">Positive keywords</SelectItem>
              <SelectItem value="counter">Counter keywords</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Min similarity">
          <Select value={String(minSimilarity)} onValueChange={(v) => setMinSimilarity(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0.3">0.3 (loose)</SelectItem>
              <SelectItem value="0.4">0.4</SelectItem>
              <SelectItem value="0.5">0.5 (default)</SelectItem>
              <SelectItem value="0.6">0.6</SelectItem>
              <SelectItem value="0.7">0.7 (strict)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Top per keyword">
          <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="8">8</SelectItem>
              <SelectItem value="12">12</SelectItem>
              <SelectItem value="20">20</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex-1" />
        <Button onClick={handleRun} disabled={running} className="gap-2">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress ? progress.message : 'Running…'}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {result ? 'Re-run' : 'Discover synonyms'}
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="mb-4 text-sm text-destructive border border-destructive/30 rounded-md p-3">{error}</div>
      )}

      {result && (
        <SynonymsResults
          result={result}
          rejected={rejected}
          accepted={accepted}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
    </div>
  )
}

function SynonymsResults({
  result,
  rejected,
  accepted,
  onAccept,
  onReject,
}: {
  result: DiscoverSynonymsResult
  rejected: Record<string, Set<string>>
  accepted: Record<string, Set<string>>
  onAccept: (keyword: Keyword, candidate: SynonymCandidate) => Promise<void>
  onReject: (keyword: Keyword, candidate: SynonymCandidate) => void
}) {
  if (result.unavailable) {
    return (
      <EmptyState
        icon={<Sparkles className="h-12 w-12" />}
        title="Embedding model unavailable"
        description="The backend's sentence-transformers model failed to load. Check the analysis-engine status in the app shell and try again."
      />
    )
  }

  const keywordsWithCandidates = result.perKeyword.filter((k) => k.candidates.length > 0)
  if (keywordsWithCandidates.length === 0) {
    return (
      <EmptyState
        title="No candidates above the similarity threshold"
        description="Try lowering Min similarity, or import more documents so the candidate pool of corpus phrases is richer."
      />
    )
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        {keywordsWithCandidates.length} keyword{keywordsWithCandidates.length === 1 ? '' : 's'} with candidate{keywordsWithCandidates.length === 1 ? '' : 's'} ·
        candidate pool: {result.candidatePoolSize.toLocaleString()} corpus phrases
      </p>
      <ul className="space-y-3">
        {keywordsWithCandidates.map(({ keyword, candidates }) => {
          const rej = rejected[keyword.id] ?? new Set<string>()
          const acc = accepted[keyword.id] ?? new Set<string>()
          const visibleCandidates = candidates.filter((c) => !rej.has(c.text))
          if (visibleCandidates.length === 0) return null
          return (
            <li key={keyword.id} className="border border-border rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-medium">{keyword.text}</code>
                {keyword.polarity === 'counter' && (
                  <span className="text-[10px] uppercase text-muted-foreground">counter</span>
                )}
              </div>
              <ul className="divide-y divide-border">
                {visibleCandidates.map((c) => {
                  const isAccepted = acc.has(c.text)
                  return (
                    <li
                      key={c.text}
                      className="flex items-center gap-3 py-1.5 text-sm"
                    >
                      <span className="flex-1 truncate">{c.text}</span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0" title="Cosine similarity">
                        {c.similarity.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0" title="Corpus frequency">
                        {c.count}× in {c.documentCount} doc{c.documentCount === 1 ? '' : 's'}
                      </span>
                      {isAccepted ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 px-2">
                          <Check className="h-3 w-3" />
                          Accepted
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onAccept(keyword, c)}
                            className={cn(
                              'inline-flex items-center gap-1 text-xs px-2 py-1 rounded',
                              'text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors'
                            )}
                            title="Add as a synonym for this keyword"
                          >
                            <Check className="h-3 w-3" />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => onReject(keyword, c)}
                            className={cn(
                              'inline-flex items-center gap-1 text-xs px-2 py-1 rounded',
                              'text-muted-foreground hover:bg-muted/40 transition-colors'
                            )}
                            title="Hide this candidate (not stored — re-running may resurface it)"
                          >
                            <X className="h-3 w-3" />
                            Reject
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ul>
    </>
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
