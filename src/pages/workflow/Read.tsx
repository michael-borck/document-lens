import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { findConcordance, type ConcordanceResult } from '@/services/concordance'
import { listKeywords } from '@/services/keyword-lists'
import { getDocument } from '@/services/documents'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Document, Keyword, KeywordPolarity } from '@/types/data'

type ContextWindow = 50 | 100 | 250
type PolarityFilter = KeywordPolarity | 'all'

export function Read() {
  const vm = useOutletContext<ProjectViewModel>()

  const [docs, setDocs] = useState<Document[]>([])
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [docId, setDocId] = useState<string>('')
  const [keywordId, setKeywordId] = useState<string>('')
  const [contextWords, setContextWords] = useState<ContextWindow>(50)
  const [polarityFilter, setPolarityFilter] = useState<PolarityFilter>('all')
  const [result, setResult] = useState<ConcordanceResult | null>(null)
  const [searching, setSearching] = useState(false)
  // Per-document keyword match counts (keywordId -> count). Computed
  // after a document is picked so the keyword dropdown can be filtered
  // to "what's actually in this document". null = not yet computed.
  const [matchCounts, setMatchCounts] = useState<Record<string, number> | null>(null)
  const [countingMatches, setCountingMatches] = useState(false)

  useEffect(() => {
    Promise.all(vm.project.documentIds.map((id) => getDocument(id))).then((rows) => {
      setDocs(rows.filter((d): d is Document => d !== null))
    })
  }, [vm.project.documentIds])

  useEffect(() => {
    if (!vm.keywordList) return
    listKeywords(vm.keywordList.id).then(setKeywords)
  }, [vm.keywordList])

  // When the document changes, compute match counts for every enabled
  // keyword. These drive the dropdown filter (show only keywords that
  // actually appear in this document) and the per-row counts.
  useEffect(() => {
    if (!docId || keywords.length === 0) {
      setMatchCounts(null)
      return
    }
    let cancelled = false
    setCountingMatches(true)
    setKeywordId('')  // reset selection — old keyword may not have matches in the new doc
    getDocument(docId).then((doc) => {
      if (cancelled) return
      const text = doc?.extractedText ?? ''
      const counts: Record<string, number> = {}
      for (const k of keywords) {
        if (!k.enabled) continue
        counts[k.id] = countOccurrences(text, k.text)
      }
      setMatchCounts(counts)
      setCountingMatches(false)
    })
    return () => {
      cancelled = true
    }
  }, [docId, keywords])

  const filteredKeywords = useMemo(() => {
    return keywords
      .filter((k) => k.enabled)
      .filter((k) => polarityFilter === 'all' ? true : k.polarity === polarityFilter)
      // After a document is picked, hide keywords with zero matches in
      // that document. Before a document is picked (matchCounts === null),
      // show everything so the user can see what's available.
      .filter((k) => matchCounts === null || (matchCounts[k.id] ?? 0) > 0)
  }, [keywords, polarityFilter, matchCounts])

  // Run search whenever doc + keyword + contextWords are all set.
  useEffect(() => {
    if (!docId || !keywordId) {
      setResult(null)
      return
    }
    const keyword = keywords.find((k) => k.id === keywordId)
    if (!keyword) return
    setSearching(true)
    findConcordance({
      documentId: docId,
      keyword: keyword.text,
      contextWords,
    })
      .then(setResult)
      .finally(() => setSearching(false))
  }, [docId, keywordId, contextWords, keywords])

  if (!vm.keywordList) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No keyword list"
          description="Pick a keyword list on the Setup tab to choose what keywords to read in context."
        />
      </div>
    )
  }
  if (docs.length === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to read them in context."
        />
      </div>
    )
  }

  const selectedDoc = docs.find((d) => d.id === docId)
  const selectedKeyword = filteredKeywords.find((k) => k.id === keywordId)

  return (
    <div className="px-8 py-8 max-w-5xl">
      <Header />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Field label="Document">
          <Select value={docId} onValueChange={setDocId}>
            <SelectTrigger>
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
        <Field label="Polarity">
          <Select
            value={polarityFilter}
            onValueChange={(v) => setPolarityFilter(v as PolarityFilter)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="counter">Counter</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={`Keyword${matchCounts ? ` (${filteredKeywords.length} with hits)` : ''}`}>
          <Select value={keywordId} onValueChange={setKeywordId} disabled={!docId || countingMatches}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !docId
                    ? 'Pick a document first'
                    : countingMatches
                      ? 'Counting matches…'
                      : filteredKeywords.length === 0
                        ? 'No keywords with hits'
                        : 'Pick a keyword'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {filteredKeywords.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {matchCounts === null
                    ? 'No keywords match'
                    : `No ${polarityFilter === 'all' ? '' : polarityFilter + ' '}keywords appear in this document.`}
                </div>
              ) : (
                filteredKeywords.map((kw) => (
                  <SelectItem key={kw.id} value={kw.id}>
                    <span className="flex items-center justify-between gap-3 w-full">
                      <span className="flex-1 truncate">{kw.text}</span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        {kw.polarity === 'counter' && (
                          <span className="text-[10px] uppercase text-muted-foreground">counter</span>
                        )}
                        {matchCounts && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            ({matchCounts[kw.id]})
                          </span>
                        )}
                      </span>
                    </span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Context">
          <Select
            value={String(contextWords)}
            onValueChange={(v) => setContextWords(Number(v) as ContextWindow)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 words</SelectItem>
              <SelectItem value="100">100 words</SelectItem>
              <SelectItem value="250">250 words</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {!docId || !keywordId ? (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          Pick a document and a keyword to read in context.
        </div>
      ) : searching ? (
        <div className="text-sm text-muted-foreground py-4">Searching…</div>
      ) : !result ? null : result.unavailable ? (
        <EmptyState
          title="Document text not available"
          description="This document hasn't been extracted yet (status not 'Ready'). Re-import or check the Library page."
        />
      ) : result.matches.length === 0 ? (
        <EmptyState
          title="No matches"
          description={
            <>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {selectedKeyword?.text}
              </code>{' '}
              doesn't appear in{' '}
              <strong>{selectedDoc?.title ?? selectedDoc?.filename}</strong>.
            </>
          }
        />
      ) : (
        <ConcordanceResults
          result={result}
          documentLabel={selectedDoc?.title ?? selectedDoc?.filename ?? ''}
          documentPath={selectedDoc?.filePath}
          keywordLabel={selectedKeyword?.text ?? ''}
        />
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight">Read</h1>
      <p className="text-muted-foreground italic mt-1">
        What does each document actually say about a topic?
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

/**
 * Match-count helper for the keyword dropdown filter. Same regex shape
 * as services/coverage.ts (case-insensitive whole-word for single-token
 * keywords, literal phrase for multi-token) so the count agrees with
 * what Coverage shows.
 */
function countOccurrences(text: string, keyword: string): number {
  if (!text || !keyword) return 0
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = /\s/.test(keyword)
    ? new RegExp(escaped, 'gi')
    : new RegExp(`\\b${escaped}\\b`, 'gi')
  const matches = text.match(pattern)
  return matches ? matches.length : 0
}

function ConcordanceResults({
  result,
  documentLabel,
  documentPath,
  keywordLabel,
}: {
  result: ConcordanceResult
  documentLabel: string
  documentPath?: string
  keywordLabel: string
}) {
  const openSourceFile = () => {
    if (!documentPath) return
    window.electron?.openPath(documentPath).catch(() => {
      /* user cancelled or system rejected */
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm">
          <strong>{result.matches.length}</strong> match{result.matches.length === 1 ? '' : 'es'}
          {' '}for <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{keywordLabel}</code>
          {' '}in <strong>{documentLabel}</strong>
        </p>
        {documentPath && (
          <button
            type="button"
            onClick={openSourceFile}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            title="Open the source file in the system viewer"
          >
            Open source file
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      <ul className="space-y-3">
        {result.matches.map((m) => (
          <li
            key={m.index}
            className="border border-border rounded-md p-3 text-sm leading-relaxed"
          >
            <span className="text-muted-foreground">…{m.before} </span>
            <mark className="bg-yellow-200 px-0.5 rounded font-medium not-italic">
              {m.matched}
            </mark>
            <span className="text-muted-foreground"> {m.after}…</span>
            <div className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">
              Match {m.index + 1} · char {m.position.toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
