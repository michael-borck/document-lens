/**
 * DocumentAnalysisPanel Component
 *
 * Shows detailed analysis for a single document including:
 * - Word count and text statistics
 * - Top keywords found
 * - Readability scores
 * - Writing quality metrics
 */

import { useState, useEffect } from 'react'
import {
  X,
  FileText,
  BarChart3,
  BookOpen,
  Hash,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { DocumentRecord } from '@/services/documents'

interface DocumentAnalysisPanelProps {
  document: DocumentRecord | null
  onClose: () => void
}

interface TextMetrics {
  word_count: number
  sentence_count: number
  paragraph_count: number
  avg_sentence_length: number
  avg_word_length: number
}

interface ReadabilityMetrics {
  flesch_reading_ease?: number
  flesch_score?: number
  flesch_kincaid_grade?: number
  gunning_fog?: number
  smog_index?: number
  coleman_liau?: number
  automated_readability?: number
}

interface WritingQuality {
  vocabulary_richness?: number
  avg_sentence_length?: number
  passive_voice_ratio?: number
}

interface WordAnalysis {
  top_words?: Array<{ word: string; count: number }>
  vocabulary_richness?: number
}

interface AnalysisResults {
  text_metrics?: TextMetrics
  readability?: ReadabilityMetrics
  writing_quality?: WritingQuality
  word_analysis?: WordAnalysis
}

export function DocumentAnalysisPanel({
  document,
  onClose,
}: DocumentAnalysisPanelProps) {
  const [loading, setLoading] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResults | null>(null)

  useEffect(() => {
    if (document) {
      loadAnalysis()
    } else {
      setAnalysis(null)
    }
  }, [document?.id])

  const loadAnalysis = async () => {
    if (!document) return

    setLoading(true)
    try {
      // Load analysis results from database
      const results = await window.electron.dbQuery<{
        analysis_type: string
        results: string
      }>(
        'SELECT analysis_type, results FROM analysis_results WHERE document_id = ?',
        [document.id]
      )

      const parsed: AnalysisResults = {}
      for (const row of results) {
        try {
          const data = JSON.parse(row.results)
          if (row.analysis_type === 'text_metrics') parsed.text_metrics = data
          if (row.analysis_type === 'readability') parsed.readability = data
          if (row.analysis_type === 'writing_quality') parsed.writing_quality = data
          if (row.analysis_type === 'word_analysis') parsed.word_analysis = data
        } catch {
          // Skip invalid JSON
        }
      }

      setAnalysis(parsed)
    } catch (error) {
      console.error('Failed to load analysis:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenFile = async () => {
    if (document) {
      await window.electron.openPath(document.file_path)
    }
  }

  const getReadabilityLabel = (score: number): string => {
    if (score >= 90) return 'Very Easy'
    if (score >= 80) return 'Easy'
    if (score >= 70) return 'Fairly Easy'
    if (score >= 60) return 'Standard'
    if (score >= 50) return 'Fairly Difficult'
    if (score >= 30) return 'Difficult'
    return 'Very Difficult'
  }

  const getReadabilityColor = (score: number): string => {
    if (score >= 70) return 'text-brass'
    if (score >= 50) return 'text-muted-foreground'
    return 'text-primary'
  }

  if (!document) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-background border-l shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="font-semibold truncate">{document.filename}</h2>
          <div className="text-sm text-muted-foreground">
            {document.company_name}
            {document.company_name && document.report_year && ' - '}
            {document.report_year}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !analysis || Object.keys(analysis).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No Analysis Available</h3>
              <p className="text-sm text-muted-foreground">
                Run analysis on this document from the project dashboard to see
                detailed metrics.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Text Statistics */}
            {analysis.text_metrics && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    Text Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Words</span>
                      <span className="font-medium">
                        {analysis.text_metrics.word_count?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sentences</span>
                      <span className="font-medium">
                        {analysis.text_metrics.sentence_count?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paragraphs</span>
                      <span className="font-medium">
                        {analysis.text_metrics.paragraph_count?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg Sentence</span>
                      <span className="font-medium">
                        {analysis.text_metrics.avg_sentence_length?.toFixed(1)} words
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Readability */}
            {analysis.readability && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Readability
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(analysis.readability.flesch_reading_ease ?? analysis.readability.flesch_score) !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Flesch Reading Ease</span>
                        <span className={`font-medium ${getReadabilityColor(
                          analysis.readability.flesch_reading_ease ?? analysis.readability.flesch_score ?? 0
                        )}`}>
                          {(analysis.readability.flesch_reading_ease ?? analysis.readability.flesch_score)?.toFixed(1)}
                          {' '}
                          ({getReadabilityLabel(analysis.readability.flesch_reading_ease ?? analysis.readability.flesch_score ?? 0)})
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, analysis.readability.flesch_reading_ease ?? analysis.readability.flesch_score ?? 0)}
                        className="h-2"
                      />
                    </div>
                  )}
                  {analysis.readability.flesch_kincaid_grade !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Grade Level</span>
                      <span className="font-medium">
                        {analysis.readability.flesch_kincaid_grade?.toFixed(1)}
                      </span>
                    </div>
                  )}
                  {analysis.readability.gunning_fog !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gunning Fog</span>
                      <span className="font-medium">
                        {analysis.readability.gunning_fog?.toFixed(1)}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Writing Quality */}
            {(analysis.writing_quality || analysis.word_analysis) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Writing Quality
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(analysis.word_analysis?.vocabulary_richness ?? analysis.writing_quality?.vocabulary_richness) !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Vocabulary Richness</span>
                      <span className="font-medium">
                        {((analysis.word_analysis?.vocabulary_richness ?? analysis.writing_quality?.vocabulary_richness ?? 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {analysis.writing_quality?.passive_voice_ratio !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Passive Voice</span>
                      <span className="font-medium">
                        {(analysis.writing_quality.passive_voice_ratio * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Top Words */}
            {analysis.word_analysis?.top_words && analysis.word_analysis.top_words.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Top Words
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {analysis.word_analysis.top_words.slice(0, 20).map((item) => (
                      <span
                        key={item.word}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm"
                      >
                        {item.word}
                        <span className="text-xs text-muted-foreground">
                          ({item.count})
                        </span>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Document Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Document Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {document.report_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span>{document.report_type}</span>
                  </div>
                )}
                {document.industry && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Industry</span>
                    <span>{document.industry}</span>
                  </div>
                )}
                {document.country && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Country</span>
                    <span>{document.country}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={
                    document.analysis_status === 'completed' ? 'text-brass' :
                    document.analysis_status === 'failed' ? 'text-red-600' :
                    'text-muted-foreground'
                  }>
                    {document.analysis_status}
                  </span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t">
        <Button variant="outline" className="w-full" onClick={handleOpenFile}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Open PDF
        </Button>
      </div>
    </div>
  )
}
