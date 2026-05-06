import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  ExternalLink,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Download,
  Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { getDocument, type DocumentRecord } from '@/services/documents'
import { analyzeDocument, getDocumentAnalysis } from '@/services/analysis'
import { downloadDocumentJson } from '@/services/export'
import { KeywordSelector } from '@/components/KeywordSelector'
import { DocumentMetadataModal } from '@/components/DocumentMetadataModal'
import { toast } from '@/stores/toastStore'
import { highlightMatches } from '@/lib/highlightMatches'

interface PageData {
  page_number: number
  text: string
}

// Matches the actual backend /text endpoint response structure
interface ReadabilityData {
  flesch_score: number
  flesch_kincaid_grade: number
  interpretation: string
}

interface WritingQualityData {
  passive_voice_percentage: number
  sentence_variety: number
  academic_tone: number
  transition_words: number
  hedging_language: number
}

interface WordAnalysisData {
  unique_words: string[]
  vocabulary_richness: number
  top_words: Array<{ word: string; count: number; size?: number }>
  bigrams: Array<{ phrase: string; count: number }>
  trigrams: Array<{ phrase: string; count: number }>
}

interface TextMetricsData {
  word_count: number
  sentence_count: number
  paragraph_count: number
  avg_words_per_sentence: number
}

export function DocumentView() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>()
  const [document, setDocument] = useState<DocumentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  
  // Text tab state
  const [pages, setPages] = useState<PageData[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [textSearch, setTextSearch] = useState('')
  
  // Analysis tab state
  const [textMetrics, setTextMetrics] = useState<TextMetricsData | null>(null)
  const [readability, setReadability] = useState<ReadabilityData | null>(null)
  const [writingQuality, setWritingQuality] = useState<WritingQualityData | null>(null)
  const [wordAnalysis, setWordAnalysis] = useState<WordAnalysisData | null>(null)
  
  // Keywords tab state
  const [showKeywordSelector, setShowKeywordSelector] = useState(false)
  const [showMetadataEdit, setShowMetadataEdit] = useState(false)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [keywordMatches, setKeywordMatches] = useState<Record<string, { count: number; contexts: string[] }>>({})

  useEffect(() => {
    if (documentId) {
      loadDocument()
    }
  }, [documentId])

  const loadDocument = async () => {
    try {
      setLoading(true)
      const doc = await getDocument(documentId!)
      if (doc) {
        setDocument(doc)
        
        // Parse pages if available
        if (doc.extracted_pages) {
          try {
            const pagesData = JSON.parse(doc.extracted_pages)
            setPages(pagesData)
          } catch {
            // If no page data, create single page from full text
            if (doc.extracted_text) {
              setPages([{ page_number: 1, text: doc.extracted_text }])
            }
          }
        } else if (doc.extracted_text) {
          // Split text into pseudo-pages for navigation
          const chunkSize = 5000
          const text = doc.extracted_text
          const pageChunks: PageData[] = []
          for (let i = 0; i < text.length; i += chunkSize) {
            pageChunks.push({
              page_number: pageChunks.length + 1,
              text: text.substring(i, i + chunkSize),
            })
          }
          setPages(pageChunks)
        }
        
        // Load analysis results
        loadAnalysis(doc.id)
      }
    } catch (error) {
      console.error('Failed to load document:', error)
      toast.error('Couldn’t load this document', error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const loadAnalysis = async (docId: string) => {
    try {
      const analysis = await getDocumentAnalysis(docId)
      if (analysis.text_metrics) {
        setTextMetrics(analysis.text_metrics as TextMetricsData)
      }
      if (analysis.readability) {
        setReadability(analysis.readability as ReadabilityData)
      }
      if (analysis.writing_quality) {
        setWritingQuality(analysis.writing_quality as WritingQualityData)
      }
      if (analysis.word_analysis) {
        setWordAnalysis(analysis.word_analysis as WordAnalysisData)
      }
    } catch (error) {
      console.error('Failed to load analysis:', error)
    }
  }

  const handleAnalyze = async () => {
    if (!document || !document.extracted_text) return
    
    setAnalyzing(true)
    try {
      await analyzeDocument(document)
      await loadAnalysis(document.id)
      // Reload document to get updated status
      const updated = await getDocument(document.id)
      if (updated) setDocument(updated)
    } catch (error) {
      console.error('Analysis failed:', error)
      alert('Analysis failed. Make sure the backend is running.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleOpenPdf = async () => {
    if (!document) return
    try {
      await window.electron.openPath(document.file_path)
    } catch (error) {
      console.error('Failed to open PDF:', error)
    }
  }

  const handleKeywordSearch = (keywords: string[]) => {
    setSelectedKeywords(keywords)
    
    if (!document?.extracted_text || keywords.length === 0) {
      setKeywordMatches({})
      return
    }

    const matches: Record<string, { count: number; contexts: string[] }> = {}
    const text = document.extracted_text
    const lowerText = text.toLowerCase()

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase()
      const contexts: string[] = []
      let count = 0
      let pos = 0

      while (true) {
        const index = lowerText.indexOf(lowerKeyword, pos)
        if (index === -1) break
        count++
        
        // Extract context (150 chars around match)
        const start = Math.max(0, index - 75)
        const end = Math.min(text.length, index + keyword.length + 75)
        let context = text.substring(start, end)
        if (start > 0) context = '...' + context
        if (end < text.length) context = context + '...'
        
        if (contexts.length < 10) {
          contexts.push(context)
        }
        pos = index + 1
      }

      if (count > 0) {
        matches[keyword] = { count, contexts }
      }
    }

    setKeywordMatches(matches)
  }

  const currentPageData = useMemo(() => {
    return pages[currentPage - 1] || null
  }, [pages, currentPage])

  const highlightedText = useMemo(() => {
    if (!currentPageData) return null
    return highlightMatches(currentPageData.text, textSearch)
  }, [currentPageData, textSearch])

  const getReadabilityLabel = (score: number) => {
    if (score >= 90) return { label: 'Very Easy', color: 'text-brass' }
    if (score >= 80) return { label: 'Easy', color: 'text-brass' }
    if (score >= 70) return { label: 'Fairly Easy', color: 'text-lime-500' }
    if (score >= 60) return { label: 'Standard', color: 'text-muted-foreground' }
    if (score >= 50) return { label: 'Fairly Difficult', color: 'text-orange-500' }
    if (score >= 30) return { label: 'Difficult', color: 'text-primary' }
    return { label: 'Very Difficult', color: 'text-primary' }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (!document) {
    return (
      <div className="p-8">
        <p>Document not found</p>
        <Link to={`/project/${projectId}`}>
          <Button className="mt-4">Back to Project</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-4">
          <Link to={`/project/${projectId}`}>
            <Button variant="ghost" size="icon" className="-ml-2" aria-label="Go back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{document.filename}</h1>
            <p className="text-sm text-muted-foreground">
              {document.company_name || 'Unknown Company'}
              {document.report_year && ` - ${document.report_year}`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenPdf}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadDocumentJson(document.id, true)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={handleAnalyze}
              disabled={analyzing || !document.extracted_text}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : document.analysis_status === 'completed' ? (
                <RefreshCw className="h-4 w-4 mr-2" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              {analyzing ? 'Analyzing...' : document.analysis_status === 'completed' ? 'Re-analyze' : 'Analyze'}
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="text" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-4">
            <TabsList>
              <TabsTrigger value="text">
                <FileText className="h-4 w-4 mr-2" />
                Text
              </TabsTrigger>
              <TabsTrigger value="analysis">
                <BarChart3 className="h-4 w-4 mr-2" />
                Analysis
              </TabsTrigger>
              <TabsTrigger value="keywords">
                <Search className="h-4 w-4 mr-2" />
                Keywords
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Text Tab */}
          <TabsContent value="text" className="flex-1 flex flex-col overflow-hidden m-0 p-4">
            {/* Search and Navigation */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search in document..."
                  value={textSearch}
                  onChange={(e) => setTextSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm min-w-[100px] text-center">
                  Page {currentPage} of {pages.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(p => Math.min(pages.length, p + 1))}
                  disabled={currentPage >= pages.length}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Text Content */}
            <Card className="flex-1 overflow-hidden">
              <CardContent className="p-4 h-full overflow-y-auto">
                {currentPageData ? (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed font-mono">
                    {highlightedText}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No text content available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis Tab */}
          <TabsContent value="analysis" className="flex-1 overflow-y-auto m-0 p-4">
            {document.analysis_status !== 'completed' ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h2 className="text-lg font-medium mb-2">Analysis Not Available</h2>
                  <p className="text-muted-foreground mb-4">
                    Click "Analyze" to generate readability and writing quality metrics
                  </p>
                  <Button onClick={handleAnalyze} disabled={analyzing}>
                    {analyzing ? 'Analyzing...' : 'Analyze Document'}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Text Metrics */}
                {textMetrics && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Text Metrics</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-3xl font-bold">{textMetrics.word_count.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Words</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-3xl font-bold">{textMetrics.sentence_count.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Sentences</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-3xl font-bold">{textMetrics.paragraph_count.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Paragraphs</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-3xl font-bold">{textMetrics.avg_words_per_sentence.toFixed(1)}</div>
                          <div className="text-sm text-muted-foreground">Avg Words/Sentence</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Readability */}
                {readability && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Readability Scores</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-3xl font-bold">{readability.flesch_score.toFixed(1)}</div>
                          <div className="text-sm text-muted-foreground">Flesch Reading Ease</div>
                          <div className={`text-xs mt-1 ${getReadabilityLabel(readability.flesch_score).color}`}>
                            {getReadabilityLabel(readability.flesch_score).label}
                          </div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-3xl font-bold">{readability.flesch_kincaid_grade.toFixed(1)}</div>
                          <div className="text-sm text-muted-foreground">Grade Level</div>
                          <div className="text-xs mt-1 text-muted-foreground">Flesch-Kincaid</div>
                        </div>
                      </div>
                      <div className="mt-4 p-3 bg-muted/50 rounded-lg text-center">
                        <span className="text-sm text-muted-foreground">Interpretation: </span>
                        <span className="font-medium">{readability.interpretation}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Writing Quality */}
                {writingQuality && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Writing Quality</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Passive Voice Usage</span>
                            <span>{writingQuality.passive_voice_percentage.toFixed(1)}%</span>
                          </div>
                          <Progress value={writingQuality.passive_voice_percentage} className="h-2" />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Sentence Variety</span>
                            <span>{writingQuality.sentence_variety.toFixed(1)}%</span>
                          </div>
                          <Progress value={writingQuality.sentence_variety} className="h-2" />
                        </div>
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Academic Tone</span>
                            <span>{writingQuality.academic_tone.toFixed(1)}%</span>
                          </div>
                          <Progress value={writingQuality.academic_tone} className="h-2" />
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                          <div className="text-center">
                            <div className="text-2xl font-bold">{writingQuality.transition_words.toFixed(1)}%</div>
                            <div className="text-sm text-muted-foreground">Transition Words</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold">{writingQuality.hedging_language.toFixed(1)}%</div>
                            <div className="text-sm text-muted-foreground">Hedging Language</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Word Analysis */}
                {wordAnalysis && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Word Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">{wordAnalysis.unique_words.length.toLocaleString()}</div>
                          <div className="text-sm text-muted-foreground">Sample Content Words</div>
                          <div className="text-xs text-muted-foreground">(excluding common words)</div>
                        </div>
                        <div className="text-center p-4 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">{(wordAnalysis.vocabulary_richness * 100).toFixed(1)}%</div>
                          <div className="text-sm text-muted-foreground">Vocabulary Richness</div>
                        </div>
                      </div>

                      {wordAnalysis.top_words.length > 0 && (
                        <>
                          <h4 className="text-sm font-medium mb-2">Top Words</h4>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {wordAnalysis.top_words.slice(0, 30).map((word, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm"
                              >
                                {word.word}
                                <span className="text-xs text-muted-foreground">({word.count})</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}

                      {wordAnalysis.bigrams.length > 0 && (
                        <>
                          <h4 className="text-sm font-medium mb-2">Common Bigrams (2-word phrases)</h4>
                          <div className="flex flex-wrap gap-2 mb-4">
                            {wordAnalysis.bigrams.slice(0, 15).map((bigram, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary border border-border text-sm font-mono"
                              >
                                {bigram.phrase}
                                <span className="text-xs text-muted-foreground">({bigram.count})</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}

                      {wordAnalysis.trigrams.length > 0 && (
                        <>
                          <h4 className="text-sm font-medium mb-2">Common Trigrams (3-word phrases)</h4>
                          <div className="flex flex-wrap gap-2">
                            {wordAnalysis.trigrams.slice(0, 10).map((trigram, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brass/10 border border-brass/40 text-sm font-mono"
                              >
                                {trigram.phrase}
                                <span className="text-xs text-muted-foreground">({trigram.count})</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* Keywords Tab */}
          <TabsContent value="keywords" className="flex-1 overflow-y-auto m-0 p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Button onClick={() => setShowKeywordSelector(true)}>
                  Select Keywords
                </Button>
                {selectedKeywords.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {selectedKeywords.length} keywords selected, {Object.keys(keywordMatches).length} with matches
                  </span>
                )}
              </div>

              {Object.keys(keywordMatches).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-lg font-medium mb-2">No Keywords Selected</h2>
                    <p className="text-muted-foreground mb-4">
                      Select keywords from a framework list to find matches in this document
                    </p>
                    <Button onClick={() => setShowKeywordSelector(true)}>
                      Select Keywords
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(keywordMatches)
                          .sort((a, b) => b[1].count - a[1].count)
                          .map(([keyword, data]) => (
                            <span
                              key={keyword}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm"
                            >
                              {keyword}
                              <span className="bg-primary text-primary-foreground px-1.5 rounded-full text-xs">
                                {data.count}
                              </span>
                            </span>
                          ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Detailed Matches */}
                  {Object.entries(keywordMatches)
                    .sort((a, b) => b[1].count - a[1].count)
                    .map(([keyword, data]) => (
                      <Card key={keyword}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span>{keyword}</span>
                            <span className="text-sm font-normal text-muted-foreground">
                              {data.count} occurrences
                            </span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {data.contexts.map((context, i) => (
                              <div key={i} className="text-sm p-2 bg-muted/50 rounded">
                                {highlightMatches(context, keyword)}
                              </div>
                            ))}
                            {data.count > data.contexts.length && (
                              <p className="text-xs text-muted-foreground">
                                +{data.count - data.contexts.length} more occurrences
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Sidebar - Document Info */}
      <div className="w-72 border-l bg-muted/20 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Document Info</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMetadataEdit(true)}
            title="Edit document metadata (company, year, industry, etc.)"
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit metadata
          </Button>
        </div>
        
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-muted-foreground">Filename</div>
            <div className="font-medium truncate" title={document.filename}>
              {document.filename}
            </div>
          </div>
          
          <div>
            <div className="text-muted-foreground">Company</div>
            <div className="font-medium">{document.company_name || '-'}</div>
          </div>
          
          <div>
            <div className="text-muted-foreground">Report Year</div>
            <div className="font-medium">{document.report_year || '-'}</div>
          </div>
          
          <div>
            <div className="text-muted-foreground">Industry</div>
            <div className="font-medium">{document.industry || '-'}</div>
          </div>
          
          <div>
            <div className="text-muted-foreground">Country</div>
            <div className="font-medium">{document.country || '-'}</div>
          </div>

          <div className="pt-3 border-t">
            <div className="text-muted-foreground">Analysis Status</div>
            <div className={`font-medium ${
              document.analysis_status === 'completed' ? 'text-brass' :
              document.analysis_status === 'failed' ? 'text-destructive' :
              'text-muted-foreground'
            }`}>
              {document.analysis_status}
            </div>
            {document.analysis_status === 'failed' && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="text-xs text-primary hover:underline mt-1"
              >
                Retry Analysis
              </button>
            )}
          </div>

          {document.analyzed_at && (
            <div>
              <div className="text-muted-foreground">Analyzed</div>
              <div className="font-medium">
                {new Date(document.analyzed_at).toLocaleDateString()}
              </div>
            </div>
          )}

          <div>
            <div className="text-muted-foreground">Imported</div>
            <div className="font-medium">
              {new Date(document.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleOpenPdf}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open Original PDF
          </Button>
        </div>
      </div>

      {/* Keyword Selector Modal */}
      <KeywordSelector
        open={showKeywordSelector}
        onClose={() => setShowKeywordSelector(false)}
        onSelect={(keywords) => {
          handleKeywordSearch(keywords)
          setShowKeywordSelector(false)
        }}
      />

      {/* Metadata Edit Modal */}
      <DocumentMetadataModal
        open={showMetadataEdit}
        onClose={() => setShowMetadataEdit(false)}
        document={document}
        onSaved={() => {
          setShowMetadataEdit(false)
          loadDocument()
        }}
      />
    </div>
  )
}
