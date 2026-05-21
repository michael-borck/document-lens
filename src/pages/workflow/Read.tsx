import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Check, Copy, ExternalLink, Eye } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { findConcordance, type ConcordanceResult } from '@/services/concordance'
import { listKeywords, listEnabledSynonymsForKeywords } from '@/services/keyword-lists'
import { countConcept } from '@/services/_shared/keyword-match'
import { getDocument } from '@/services/documents'
import { listSections, type DocumentSection } from '@/services/sections'
import { getPageOffsets, findPageForOffset, type PageOffset } from '@/services/document-pages'
import { PdfViewerModal } from '@/components/pdf-viewer/PdfViewerModal'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Document, Keyword, KeywordPolarity } from '@/types/data'

type ContextWindow = 50 | 100 | 250
type PolarityFilter = KeywordPolarity | 'all'

export function Read() {
  const vm = useOutletContext<ProjectViewModel>()

  const [docs, setDocs] = useState<Document[]>([])
  const [keywords, setKeywords] = useState<Keyword[]>([])
  // Accepted (enabled) synonyms per keyword id — folded into match counts
  // and concordance so a synonym hit counts toward its parent keyword (US-A-04).
  const [synonymsByKeyword, setSynonymsByKeyword] = useState<Map<string, string[]>>(new Map())
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
  // Document sections — used to label each match with the section it
  // came from. Empty array if section detection hasn't been run for
  // this document (e.g., classification never run).
  const [sections, setSections] = useState<DocumentSection[]>([])
  // Per-page char offsets — used to map each match's offset to a page
  // number for the deep-link button. Empty if document_pages was never
  // populated (legacy import / non-PDF source).
  const [pageOffsets, setPageOffsets] = useState<PageOffset[]>([])

  useEffect(() => {
    Promise.all(vm.project.documentIds.map((id) => getDocument(id))).then((rows) => {
      setDocs(rows.filter((d): d is Document => d !== null))
    })
  }, [vm.project.documentIds])

  useEffect(() => {
    if (!vm.keywordList) return
    listKeywords(vm.keywordList.id).then(async (kws) => {
      setKeywords(kws)
      setSynonymsByKeyword(await listEnabledSynonymsForKeywords(kws.map((k) => k.id)))
    })
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
        counts[k.id] = countConcept(text, [k.text, ...(synonymsByKeyword.get(k.id) ?? [])])
      }
      setMatchCounts(counts)
      setCountingMatches(false)
    })
    return () => {
      cancelled = true
    }
  }, [docId, keywords, synonymsByKeyword])

  // Load sections for the picked doc so each concordance match can show
  // which section it came from. Sections only exist if classification
  // has populated them; otherwise the array is empty and labels hide.
  useEffect(() => {
    if (!docId) {
      setSections([])
      return
    }
    let cancelled = false
    listSections(docId).then((rows) => {
      if (!cancelled) setSections(rows)
    })
    return () => {
      cancelled = true
    }
  }, [docId])

  // Load per-page char offsets so each match's char position can map
  // to a page number. Empty array (silent no-op) for docs without
  // stored page rows.
  useEffect(() => {
    if (!docId) {
      setPageOffsets([])
      return
    }
    let cancelled = false
    getPageOffsets(docId).then((offsets) => {
      if (!cancelled) setPageOffsets(offsets)
    })
    return () => {
      cancelled = true
    }
  }, [docId])

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
      synonyms: synonymsByKeyword.get(keyword.id) ?? [],
      contextWords,
    })
      .then(setResult)
      .finally(() => setSearching(false))
  }, [docId, keywordId, contextWords, keywords, synonymsByKeyword])

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
          sections={sections}
          pageOffsets={pageOffsets}
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
function ConcordanceResults({
  result,
  documentLabel,
  documentPath,
  keywordLabel,
  sections,
  pageOffsets,
}: {
  result: ConcordanceResult
  documentLabel: string
  documentPath?: string
  keywordLabel: string
  sections: DocumentSection[]
  pageOffsets: PageOffset[]
}) {
  const openSourceFile = () => {
    if (!documentPath) return
    window.electron?.openPath(documentPath).catch(() => {
      /* user cancelled or system rejected */
    })
  }

  // Pre-sort sections by startOffset for the binary search below.
  // (listSections already returns by section_index, which == offset order.)
  const findSection = (offset: number): DocumentSection | null => {
    if (sections.length === 0) return null
    let lo = 0
    let hi = sections.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const s = sections[mid]
      if (offset < s.startOffset) hi = mid - 1
      else if (offset >= s.endOffset) lo = mid + 1
      else return s
    }
    return null
  }

  const totalPages = pageOffsets.length > 0
    ? pageOffsets[pageOffsets.length - 1].pageNumber
    : null

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
        {result.matches.map((m) => {
          const section = findSection(m.position)
          const page = findPageForOffset(pageOffsets, m.position)
          return (
            <MatchCard
              key={m.index}
              match={m}
              section={section}
              sectionsTotal={sections.length}
              page={page}
              totalPages={totalPages}
              documentPath={documentPath}
              documentLabel={documentLabel}
              keywordLabel={keywordLabel}
            />
          )
        })}
      </ul>
    </div>
  )
}

function MatchCard({
  match,
  section,
  sectionsTotal,
  page,
  totalPages,
  documentPath,
  documentLabel,
  keywordLabel,
}: {
  match: ConcordanceResult['matches'][number]
  section: DocumentSection | null
  sectionsTotal: number
  page: number | null
  totalPages: number | null
  documentPath?: string
  documentLabel: string
  keywordLabel: string
}) {
  const [copied, setCopied] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Only PDFs render in the embedded viewer; other formats fall back
  // to the OS handler via "Open at page" / "Open source file".
  const isPdf = (documentPath ?? '').toLowerCase().endsWith('.pdf')

  const copyPhrase = async () => {
    const phrase = buildSearchPhrase(match.matched, match.after, match.before)
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard rejected (e.g., insecure context) — silently no-op */
    }
  }

  const openAtPage = () => {
    if (!documentPath || page === null) return
    // shell.openExternal honours `file://…#page=N` on macOS Preview /
    // Acrobat. Viewers that don't understand the fragment silently
    // ignore it and open at page 1 — that's the graceful fallback.
    const fileUrl = `file://${encodeURI(documentPath)}#page=${page}`
    window.electron?.openExternal(fileUrl).catch(() => {
      /* fall back to plain open if URL form is rejected */
      if (documentPath) window.electron?.openPath(documentPath).catch(() => {})
    })
  }

  return (
    <li className="border border-border rounded-md p-3 text-sm leading-relaxed">
      <span className="text-muted-foreground">…{match.before} </span>
      <mark className="bg-yellow-200 px-0.5 rounded font-medium not-italic">
        {match.matched}
      </mark>
      <span className="text-muted-foreground"> {match.after}…</span>
      <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
        <span className="tabular-nums">Match {match.index + 1}</span>
        {page !== null && (
          <span className="tabular-nums">
            · Page {page}{totalPages ? ` of ${totalPages}` : ''}
          </span>
        )}
        {section && (
          <span>
            · § {section.sectionIndex + 1}/{sectionsTotal}{' '}
            <span className="text-foreground/70">— {sectionSnippet(section.text)}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={copyPhrase}
            className="hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-transparent hover:border-border transition-colors"
            title="Copy a search phrase to paste into your PDF viewer's Find (Cmd-F)"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy phrase'}
          </button>
          {isPdf && documentPath && (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-transparent hover:border-border transition-colors"
              title="Preview the PDF inside the app, with the keyword highlighted"
            >
              <Eye className="h-3 w-3" />
              Preview
            </button>
          )}
          {page !== null && documentPath && (
            <button
              type="button"
              onClick={openAtPage}
              className="hover:text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-transparent hover:border-border transition-colors"
              title={`Open the source PDF at page ${page} in the OS viewer (some viewers ignore the page hint and open at page 1)`}
            >
              <ExternalLink className="h-3 w-3" />
              Open at page {page}
            </button>
          )}
        </span>
      </div>
      {isPdf && documentPath && (
        <PdfViewerModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          filePath={documentPath}
          documentLabel={documentLabel}
          initialPage={page ?? 1}
          highlight={keywordLabel}
        />
      )}
    </li>
  )
}

/**
 * First ~80 chars of a section's text, collapsed onto one line and
 * truncated. Annual-report paragraphs often start with their heading
 * ("Risk Management", "Our Approach", etc.), so this gives the user
 * an at-a-glance "what section is this from".
 */
function sectionSnippet(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= 80) return `"${oneLine}"`
  return `"${oneLine.slice(0, 78).trim()}…"`
}

/**
 * Build a short search phrase the user can paste into a PDF viewer's
 * Find: one word before + keyword + one word after. Longer phrases
 * tend to drag in footnote / header text that the extractor inlined
 * adjacent to the keyword but doesn't appear adjacent in the rendered
 * PDF, which makes Cmd-F miss. Three words is usually distinctive
 * enough and resilient to whitespace/hyphenation oddities.
 */
function buildSearchPhrase(matched: string, after: string, before: string): string {
  const beforeWord = before.split(/\s+/).filter(Boolean).slice(-1)[0] ?? ''
  const afterWord = after.split(/\s+/).filter(Boolean)[0] ?? ''
  return [beforeWord, matched, afterWord].filter(Boolean).join(' ')
}
