import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Download,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  analyzeNgrams,
  getNgramContexts,
  type NgramAnalysisResult,
  type NgramProgress,
} from '@/services/ngrams'
import { exportNgramResults } from '@/services/export'
import { DocumentFilter } from '@/components/DocumentFilter'
import type { DocumentRecord } from '@/services/documents'
import { useProjectStore } from '@/stores/projectStore'
import { ProjectContextBar } from '@/components/ProjectContextBar'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

export function NgramAnalysis() {
  const { projectId } = useParams<{ projectId: string }>()
  const loadProject = useProjectStore(s => s.loadProject)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<NgramProgress | null>(null)

  // Document filter - null means all documents
  const [filteredDocIds, setFilteredDocIds] = useState<string[] | null>(null)

  // Get filtered documents based on selection
  const activeDocuments = useMemo(() => {
    if (filteredDocIds === null) return documents
    return documents.filter((d) => filteredDocIds.includes(d.id))
  }, [documents, filteredDocIds])

  // Analysis parameters
  const [ngramType, setNgramType] = useState<2 | 3>(2)
  const [filterTerms, setFilterTerms] = useState('')
  const [topK, setTopK] = useState(100)

  // Results
  const [results, setResults] = useState<NgramAnalysisResult | null>(null)

  // View state
  const [viewMode, setViewMode] = useState<'aggregated' | 'by-document'>('aggregated')
  const [expandedPhrases, setExpandedPhrases] = useState<Set<string>>(new Set())
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [searchFilter, setSearchFilter] = useState('')
  const [, setSelectedPhrase] = useState<string | null>(null)
  const [phraseContexts, setPhraseContexts] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (projectId) {
      loadProject(projectId)
      loadDocuments()
    }
  }, [projectId])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const result = await window.electron.dbQuery<DocumentRecord>(
        `SELECT d.* FROM documents d
         INNER JOIN project_documents pd ON pd.document_id = d.id
         WHERE pd.project_id = ? AND d.extracted_text IS NOT NULL`,
        [projectId]
      )
      setDocuments(result)
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const runAnalysis = async () => {
    if (activeDocuments.length === 0) return

    setAnalyzing(true)
    setProgress(null)
    setResults(null)
    setExpandedPhrases(new Set())
    setPhraseContexts({})

    try {
      // Parse filter terms
      const filters = filterTerms
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const analysisResults = await analyzeNgrams(
        activeDocuments,
        ngramType,
        topK,
        filters.length > 0 ? filters : undefined,
        setProgress
      )

      setResults(analysisResults)

      // Auto-expand first few phrases
      const topPhrases = analysisResults.aggregated.slice(0, 5).map((n) => n.phrase)
      setExpandedPhrases(new Set(topPhrases))
    } catch (error) {
      console.error('N-gram analysis failed:', error)
      alert('Analysis failed. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const togglePhraseExpand = (phrase: string) => {
    const newExpanded = new Set(expandedPhrases)
    if (newExpanded.has(phrase)) {
      newExpanded.delete(phrase)
    } else {
      newExpanded.add(phrase)
    }
    setExpandedPhrases(newExpanded)
  }

  const toggleDocExpand = (docId: string) => {
    const newExpanded = new Set(expandedDocs)
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId)
    } else {
      newExpanded.add(docId)
    }
    setExpandedDocs(newExpanded)
  }

  const loadPhraseContext = (phrase: string, documentId: string) => {
    const doc = documents.find((d) => d.id === documentId)
    if (!doc?.extracted_text) return

    const key = `${documentId}:${phrase}`
    if (phraseContexts[key]) return // Already loaded

    const contexts = getNgramContexts(doc.extracted_text, phrase, 150, 5)
    setPhraseContexts((prev) => ({ ...prev, [key]: contexts }))
  }

  const debouncedSearchFilter = useDebouncedValue(searchFilter, 200)

  const filteredAggregated = useMemo(() => {
    if (!results) return []
    if (!debouncedSearchFilter) return results.aggregated
    const q = debouncedSearchFilter.toLowerCase()
    return results.aggregated.filter((ngram) => ngram.phrase.toLowerCase().includes(q))
  }, [results, debouncedSearchFilter])

  const filteredByDocument = useMemo(() => {
    if (!results) return []

    return results.documents
      .filter((doc) => doc.ngrams.length > 0)
      .sort((a, b) => {
        const aTotal = a.ngrams.reduce((sum, n) => sum + n.count, 0)
        const bTotal = b.ngrams.reduce((sum, n) => sum + n.count, 0)
        return bTotal - aTotal
      })
  }, [results])

  const highlightPhrase = (text: string, phrase: string) => {
    const regex = new RegExp(
      `(${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi'
    )
    const parts = text.split(regex)

    return parts.map((part, i) => {
      const isMatch = part.toLowerCase() === phrase.toLowerCase()
      return isMatch ? (
        <mark key={i} className="bg-brass/25 text-foreground px-0.5">
          {part}
        </mark>
      ) : (
        <span key={i}>{part}</span>
      )
    })
  }

  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx')

  const exportResults = () => {
    if (!results) return
    const filename = `ngram-analysis-${ngramType}gram-${new Date().toISOString().split('T')[0]}`
    exportNgramResults(results, filename, exportFormat)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <ProjectContextBar />
      <div className="p-8">

      {/* Analysis Controls */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Document Filter */}
            <div className="flex items-center gap-4">
              <DocumentFilter
                documents={documents}
                selectedIds={filteredDocIds}
                onChange={setFilteredDocIds}
              />
            </div>

            {/* N-gram Type Toggle */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">N-gram Type:</span>
              <div className="flex rounded-md border">
                <button
                  onClick={() => setNgramType(2)}
                  className={`px-4 py-2 text-sm ${
                    ngramType === 2
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  Bigrams (2-word)
                </button>
                <button
                  onClick={() => setNgramType(3)}
                  className={`px-4 py-2 text-sm border-l ${
                    ngramType === 3
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  Trigrams (3-word)
                </button>
              </div>
            </div>

            {/* Filter Terms */}
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-md">
                <div className="flex gap-2">
                  <Input
                    placeholder="Filter terms (optional): e.g., carbon, climate, emissions"
                    value={filterTerms}
                    onChange={(e) => setFilterTerms(e.target.value)}
                    className="flex-1"
                  />
                  {useProjectStore.getState().resolvedKeywords.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const keywords = useProjectStore.getState().resolvedKeywords
                        setFilterTerms(keywords.join(', '))
                      }}
                    >
                      Use Profile ({useProjectStore.getState().resolvedKeywords.length})
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Only show n-grams containing these terms (comma-separated)
                </p>
              </div>
              <div className="w-32">
                <Input
                  type="number"
                  min={10}
                  max={500}
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value) || 100)}
                  placeholder="Top K"
                />
                <p className="text-xs text-muted-foreground mt-1">Results limit</p>
              </div>
            </div>

            {/* Run Button */}
            <div className="flex items-center gap-4">
              <Button
                onClick={runAnalysis}
                disabled={analyzing || activeDocuments.length === 0}
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <BarChart3 className="h-4 w-4 mr-2" />
                )}
                {analyzing ? 'Analyzing...' : 'Run Analysis'}
              </Button>
              {progress && analyzing && (
                <span className="text-sm text-muted-foreground">
                  Processing {progress.current} of {progress.total}:{' '}
                  {progress.currentDocument}
                </span>
              )}
            </div>

            {/* Progress */}
            {analyzing && progress && (
              <Progress
                value={(progress.current / progress.total) * 100}
                className="h-2"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>Results Summary</CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'csv' | 'xlsx')}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="xlsx">Excel</option>
                    <option value="csv">CSV</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={exportResults}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <div className="text-2xl font-bold">
                    {results.summary.uniqueNgrams}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Unique {ngramType === 2 ? 'Bigrams' : 'Trigrams'}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {results.summary.totalNgrams.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Occurrences
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {results.summary.totalDocuments}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Documents Analyzed
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {results.filterTerms?.length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">Filter Terms</div>
                </div>
              </div>

              {/* Top Phrases Preview */}
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Top {ngramType === 2 ? 'Bigrams' : 'Trigrams'}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {results.aggregated.slice(0, 15).map((ngram) => (
                    <span
                      key={ngram.phrase}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded-full text-sm cursor-pointer hover:bg-muted/80"
                      onClick={() => {
                        setSelectedPhrase(ngram.phrase)
                        setExpandedPhrases(new Set([ngram.phrase]))
                      }}
                    >
                      {ngram.phrase}
                      <span className="text-xs bg-primary/20 px-1.5 rounded-full">
                        {ngram.totalCount}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* View Controls */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex rounded-md border">
              <button
                onClick={() => setViewMode('aggregated')}
                className={`px-4 py-2 text-sm ${
                  viewMode === 'aggregated'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                Aggregated View
              </button>
              <button
                onClick={() => setViewMode('by-document')}
                className={`px-4 py-2 text-sm border-l ${
                  viewMode === 'by-document'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
              >
                By Document
              </button>
            </div>
            <div className="flex-1" />
            <Input
              placeholder="Filter phrases..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-48"
            />
          </div>

          {/* Aggregated View */}
          {viewMode === 'aggregated' && (
            <div className="space-y-2">
              {filteredAggregated.map((ngram) => {
                const isExpanded = expandedPhrases.has(ngram.phrase)

                return (
                  <Card key={ngram.phrase}>
                    <button
                      onClick={() => togglePhraseExpand(ngram.phrase)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{ngram.phrase}</div>
                        <div className="text-sm text-muted-foreground">
                          Found in {ngram.documentCount} document
                          {ngram.documentCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{ngram.totalCount}</div>
                        <div className="text-xs text-muted-foreground">
                          occurrences
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <CardContent className="pt-0 border-t">
                        <div className="space-y-3 mt-4">
                          {ngram.byDocument.map((docRef) => {
                            const key = `${docRef.documentId}:${ngram.phrase}`
                            const contexts = phraseContexts[key]

                            // Load contexts on first expand
                            if (!contexts) {
                              loadPhraseContext(ngram.phrase, docRef.documentId)
                            }

                            return (
                              <div
                                key={docRef.documentId}
                                className="bg-muted/30 rounded p-3"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium text-sm">
                                      {docRef.documentName}
                                    </span>
                                  </div>
                                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                                    {docRef.count} occurrences
                                  </span>
                                </div>
                                {contexts && contexts.length > 0 && (
                                  <div className="space-y-2 mt-2">
                                    {contexts.map((ctx, i) => (
                                      <div
                                        key={i}
                                        className="text-sm text-muted-foreground bg-background p-2 rounded"
                                      >
                                        {highlightPhrase(ctx, ngram.phrase)}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

          {/* By Document View */}
          {viewMode === 'by-document' && (
            <div className="space-y-2">
              {filteredByDocument.map((doc) => {
                const isExpanded = expandedDocs.has(doc.documentId)
                const totalCount = doc.ngrams.reduce((sum, n) => sum + n.count, 0)

                const filteredNgrams = debouncedSearchFilter
                  ? doc.ngrams.filter((n) =>
                      n.phrase.toLowerCase().includes(debouncedSearchFilter.toLowerCase())
                    )
                  : doc.ngrams

                return (
                  <Card key={doc.documentId}>
                    <button
                      onClick={() => toggleDocExpand(doc.documentId)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {doc.documentName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {doc.companyName || 'Unknown Company'}
                          {doc.reportYear && ` - ${doc.reportYear}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{doc.ngrams.length}</div>
                        <div className="text-xs text-muted-foreground">
                          unique phrases ({totalCount} total)
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <CardContent className="pt-0 border-t">
                        <div className="mt-4">
                          <div className="flex flex-wrap gap-2">
                            {filteredNgrams
                              .sort((a, b) => b.count - a.count)
                              .map((ngram) => (
                                <span
                                  key={ngram.phrase}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm"
                                >
                                  {ngram.phrase}
                                  <span className="text-xs text-muted-foreground">
                                    ({ngram.count})
                                  </span>
                                </span>
                              ))}
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* No Results */}
      {!results && !analyzing && documents.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Ready to Analyze</h2>
            <p className="text-muted-foreground mb-4">
              Extract frequent {ngramType === 2 ? '2-word' : '3-word'} phrases
              from your documents to discover common terminology and patterns
            </p>
          </CardContent>
        </Card>
      )}

      {/* No Documents */}
      {documents.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">No Documents Available</h2>
            <p className="text-muted-foreground mb-4">
              Import PDF documents to your project first, then return here for
              n-gram analysis
            </p>
            <Link to={`/project/${projectId}`}>
              <Button>Go to Project</Button>
            </Link>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
