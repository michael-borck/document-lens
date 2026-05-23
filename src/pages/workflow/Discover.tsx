import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Play, Sparkles, ChevronRight, ChevronDown, FileText, Check, X, Plus } from 'lucide-react'
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
import { createSynonym, createKeyword, listKeywords } from '@/services/keyword-lists'
import {
  discoverSynonyms,
  type DiscoverSynonymsResult,
  type DiscoverSynonymsProgress,
  type SynonymCandidate,
} from '@/services/synonym-discovery'
import { toast } from '@/stores/toastStore'
import { EmptyState } from '@/components/EmptyState'
import { useAnalysis } from '@/hooks/useAnalysis'
import { MLCaveatBanner } from '@/components/workflow/MLCaveatBanner'
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
        <PhrasesTab vm={vm} />
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

function PhrasesTab({ vm }: { vm: ProjectViewModel }) {
  const projectId = vm.project.id
  const documentIds = vm.project.documentIds
  const [size, setSize] = useState<SizeFilter>('both')
  const [minCount, setMinCount] = useState<number>(3)
  const [scope, setScope] = useState<Scope>('all')
  const [singleDocId, setSingleDocId] = useState<string>('')
  const [docs, setDocs] = useState<Document[]>([])
  // Existing-keyword phrases on the active list (lower-cased) so the
  // "Add as keyword" button can show "Already added" instead of
  // letting the user create a duplicate. Refreshed on mount + after
  // each add.
  const [existingKeywordPhrases, setExistingKeywordPhrases] = useState<Set<string>>(new Set())

  // Load doc metadata for the single-doc picker.
  useEffect(() => {
    Promise.all(documentIds.map((id) => getDocument(id))).then((rows) => {
      setDocs(rows.filter((d): d is Document => d !== null))
    })
  }, [documentIds])

  // Load existing keyword phrases when the keyword list changes.
  useEffect(() => {
    const listId = vm.keywordList?.id
    if (!listId) {
      setExistingKeywordPhrases(new Set())
      return
    }
    listKeywords(listId).then((kws) => {
      setExistingKeywordPhrases(new Set(kws.map((k) => k.text.toLowerCase())))
    })
  }, [vm.keywordList?.id])

  const handleKeywordAdded = (phrase: string) => {
    setExistingKeywordPhrases((prev) => {
      const next = new Set(prev)
      next.add(phrase.toLowerCase())
      return next
    })
  }

  const { run, running, result, reset } = useAnalysis<ComputeNgramsResult>(async () => {
    if (scope === 'single' && !singleDocId) throw new Error('Pick a document for single-document scope.')
    const sizes: NgramSize[] = size === '2' ? [2] : size === '3' ? [3] : [2, 3]
    return computeNgrams({
      projectId,
      documentId: scope === 'single' ? singleDocId : undefined,
      sizes,
      minCount,
      topN: 200,
    })
  })

  return (
    <div>
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <Field label="Scope">
          <Select value={scope} onValueChange={(v) => { setScope(v as Scope); reset() }}>
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
          onClick={run}
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
        <PhrasesTable
          result={result}
          singleDocMode={scope === 'single'}
          keywordListId={vm.keywordList?.id ?? null}
          keywordListName={vm.keywordList?.name ?? null}
          existingKeywordPhrases={existingKeywordPhrases}
          onKeywordAdded={handleKeywordAdded}
        />
      )}
    </div>
  )
}

function PhrasesTable({
  result,
  singleDocMode,
  keywordListId,
  keywordListName,
  existingKeywordPhrases,
  onKeywordAdded,
}: {
  result: ComputeNgramsResult
  singleDocMode: boolean
  keywordListId: string | null
  keywordListName: string | null
  existingKeywordPhrases: Set<string>
  onKeywordAdded: (phrase: string) => void
}) {
  const max = result.results[0]?.count ?? 1
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // Phrases currently being added (button shows spinner during the
  // INSERT). Lower-cased for consistency with existingKeywordPhrases.
  const [adding, setAdding] = useState<Set<string>>(new Set())

  const toggle = (key: string) => {
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setExpanded(next)
  }

  const handleAdd = async (phrase: string) => {
    if (!keywordListId) return
    const lower = phrase.toLowerCase()
    setAdding((prev) => {
      const next = new Set(prev)
      next.add(lower)
      return next
    })
    try {
      await createKeyword({
        listId: keywordListId,
        text: phrase,
        polarity: 'positive',
        enabled: true,
      })
      onKeywordAdded(phrase)
      toast.success(`Added “${phrase}” as a positive keyword to ${keywordListName ?? 'list'}`)
    } catch (err) {
      toast.error(`Could not add keyword: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAdding((prev) => {
        const next = new Set(prev)
        next.delete(lower)
        return next
      })
    }
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
              <th className="text-center font-medium px-4 py-2 w-24">Add</th>
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
              const phraseLower = r.phrase.toLowerCase()
              const isAdded = existingKeywordPhrases.has(phraseLower)
              const isAdding = adding.has(phraseLower)
              return (
                <PhrasesRow
                  key={key}
                  ngram={r}
                  isExpanded={isExpanded}
                  expandable={expandable}
                  onToggle={() => toggle(key)}
                  pct={pct}
                  hasKeywordList={Boolean(keywordListId)}
                  isAdded={isAdded}
                  isAdding={isAdding}
                  onAdd={() => handleAdd(r.phrase)}
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
  hasKeywordList,
  isAdded,
  isAdding,
  onAdd,
}: {
  ngram: NgramResult
  isExpanded: boolean
  expandable: boolean
  onToggle: () => void
  pct: number
  hasKeywordList: boolean
  isAdded: boolean
  isAdding: boolean
  onAdd: () => void
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
        <td className="px-4 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
          {!hasKeywordList ? (
            <span
              className="text-[10px] text-muted-foreground italic"
              title="Pick a keyword list on the Setup tab to enable adding"
            >
              No list
            </span>
          ) : isAdded ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              title="Already in this keyword list"
            >
              <Check className="h-3 w-3" />
              Added
            </span>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={isAdding}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-border hover:bg-muted/50 disabled:opacity-50 transition-colors"
              title="Add as a positive keyword to the active list"
            >
              {isAdding ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Keyword
            </button>
          )}
        </td>
      </tr>
      {expandable && isExpanded && (
        <tr className="bg-muted/20">
          <td></td>
          <td colSpan={6} className="px-4 py-2">
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
  // Rich per-keyword progress stays local; useAnalysis owns running/error/result.
  const [progress, setProgress] = useState<DiscoverSynonymsProgress | null>(null)
  // Per-keyword rejected candidates (kept in component state; nothing
  // is persisted — Rejects just hide locally so the user can focus on
  // the remaining list).
  const [rejected, setRejected] = useState<Record<string, Set<string>>>({})
  // Per-keyword accepted (locally tracked so the UI immediately reflects
  // the user's action without a re-fetch).
  const [accepted, setAccepted] = useState<Record<string, Set<string>>>({})
  // Existing-keyword phrases in the active list (lower-cased). Used to
  // disable the "Add as keyword" button for candidates that match a
  // keyword already on the list. Refreshed on mount + after each add.
  const [existingKeywordPhrases, setExistingKeywordPhrases] = useState<Set<string>>(new Set())

  useEffect(() => {
    const listId = vm.keywordList?.id
    if (!listId) {
      setExistingKeywordPhrases(new Set())
      return
    }
    listKeywords(listId).then((kws) => {
      setExistingKeywordPhrases(new Set(kws.map((k) => k.text.toLowerCase())))
    })
  }, [vm.keywordList?.id])

  const { run, running, result, error } = useAnalysis<DiscoverSynonymsResult>(async () => {
    if (!vm.keywordList) throw new Error('Pick a keyword list on the Setup tab.')
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
      if (out.unavailable) {
        toast.error('Embedding model unavailable — backend returned 503.')
      } else {
        const total = out.perKeyword.reduce((s, k) => s + k.candidates.length, 0)
        toast.success(
          `Found ${total} candidate${total === 1 ? '' : 's'} across ${out.perKeyword.filter((k) => k.candidates.length > 0).length} keyword${out.perKeyword.length === 1 ? '' : 's'}`
        )
      }
      return out
    } finally {
      setProgress(null)
    }
  })

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

  // US-D-09: per-candidate "Add as new keyword" — grows the keyword
  // list directly with the candidate (inheriting the parent's polarity).
  // Distinct from Accept-as-synonym, which attaches under the parent.
  // Useful for counter-keyword discovery where the researcher wants a
  // first-class entry in the list, not a synonym hidden under another
  // term.
  const handleAcceptAsKeyword = async (keyword: Keyword, candidate: SynonymCandidate) => {
    if (!vm.keywordList) return
    try {
      await createKeyword({
        listId: vm.keywordList.id,
        text: candidate.text,
        polarity: keyword.polarity,
        enabled: true,
      })
      setExistingKeywordPhrases((prev) => {
        const next = new Set(prev)
        next.add(candidate.text.toLowerCase())
        return next
      })
      const polarityLabel = keyword.polarity === 'counter' ? 'counter-keyword' : 'positive keyword'
      toast.success(`Added “${candidate.text}” as a new ${polarityLabel}`)
    } catch (err) {
      toast.error(`Could not add keyword: ${err instanceof Error ? err.message : String(err)}`)
    }
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
      <MLCaveatBanner id="discover-synonyms">
        Candidates are <strong>suggestions only</strong> from a sentence-embedding model — they're
        approximate. Treat each one as a hint to evaluate. Two ways to keep one:{' '}
        <strong>Synonym</strong> attaches it under the parent keyword (preserves provenance);{' '}
        <strong>Keyword</strong> adds it as a first-class entry on the list with the same polarity
        — useful when the candidate stands on its own (e.g., a new {polarity === 'counter' ? 'counter-' : 'positive '}term that the list should start tracking directly).
      </MLCaveatBanner>

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
        <Button onClick={run} disabled={running} className="gap-2">
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
          existingKeywordPhrases={existingKeywordPhrases}
          onAccept={handleAccept}
          onAcceptAsKeyword={handleAcceptAsKeyword}
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
  existingKeywordPhrases,
  onAccept,
  onAcceptAsKeyword,
  onReject,
}: {
  result: DiscoverSynonymsResult
  rejected: Record<string, Set<string>>
  accepted: Record<string, Set<string>>
  existingKeywordPhrases: Set<string>
  onAccept: (keyword: Keyword, candidate: SynonymCandidate) => Promise<void>
  onAcceptAsKeyword: (keyword: Keyword, candidate: SynonymCandidate) => Promise<void>
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
                  const isAlreadyKeyword = existingKeywordPhrases.has(c.text.toLowerCase())
                  const polarityLabel = keyword.polarity === 'counter' ? 'counter-keyword' : 'positive keyword'
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
                          Synonym added
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
                            title={`Add as a synonym of "${keyword.text}"`}
                          >
                            <Check className="h-3 w-3" />
                            Synonym
                          </button>
                          {isAlreadyKeyword ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2"
                              title="This phrase is already a keyword on this list"
                            >
                              <Check className="h-3 w-3" />
                              In list
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onAcceptAsKeyword(keyword, c)}
                              className={cn(
                                'inline-flex items-center gap-1 text-xs px-2 py-1 rounded',
                                'text-foreground hover:bg-muted/40 transition-colors'
                              )}
                              title={`Add as a new ${polarityLabel} on the active list`}
                            >
                              <Plus className="h-3 w-3" />
                              Keyword
                            </button>
                          )}
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
