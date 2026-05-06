import { useState, useEffect } from 'react'
import { Download, Loader2, FileText, FileSpreadsheet, Archive, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  exportProjectSummary,
  exportFullProject,
  exportLensBundle,
  estimateBundleSize,
  type ExportFormat,
  type ProjectExportOptions,
  type LensBundleOptions,
  type LensBundleProgress,
} from '@/services/export'

interface ExportOptionsModalProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectName: string
  documentCount: number
}

type ExportType = 'summary' | 'full' | 'bundle'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function ExportOptionsModal({
  open,
  onClose,
  projectId,
  projectName,
  documentCount,
}: ExportOptionsModalProps) {
  const [exportType, setExportType] = useState<ExportType>('summary')
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [exporting, setExporting] = useState(false)

  // Full export options
  const [includeDocumentSummary, setIncludeDocumentSummary] = useState(true)
  const [includeDocumentText, setIncludeDocumentText] = useState(false)
  const [includeAnalysisResults, setIncludeAnalysisResults] = useState(true)
  const [includeKeywordResults, setIncludeKeywordResults] = useState(true)
  const [includeNgramResults, setIncludeNgramResults] = useState(true)

  // Bundle export options
  const [bundleIncludeText, setBundleIncludeText] = useState(true)
  const [bundleIncludeAnalysis, setBundleIncludeAnalysis] = useState(true)
  const [bundleIncludeProfiles, setBundleIncludeProfiles] = useState(true)
  const [bundleIncludePdfs, setBundleIncludePdfs] = useState(false)
  const [bundleEstimate, setBundleEstimate] = useState<{ size: number; documentCount: number } | null>(null)
  const [bundleProgress, setBundleProgress] = useState<LensBundleProgress | null>(null)

  // Estimate bundle size when options change
  useEffect(() => {
    if (exportType !== 'bundle' || !open) return

    const estimateSize = async () => {
      const options: LensBundleOptions = {
        includeText: bundleIncludeText,
        includeAnalysis: bundleIncludeAnalysis,
        includeProfiles: bundleIncludeProfiles,
        includePdfs: bundleIncludePdfs,
      }
      const estimate = await estimateBundleSize(projectId, options)
      setBundleEstimate(estimate)
    }

    estimateSize()
  }, [
    exportType,
    open,
    projectId,
    bundleIncludeText,
    bundleIncludeAnalysis,
    bundleIncludeProfiles,
    bundleIncludePdfs,
  ])

  const handleExport = async () => {
    setExporting(true)
    setBundleProgress(null)

    try {
      if (exportType === 'summary') {
        await exportProjectSummary(
          projectId,
          projectName,
          format as 'csv' | 'xlsx'
        )
      } else if (exportType === 'full') {
        const options: ProjectExportOptions = {
          includeDocumentSummary,
          includeDocumentText,
          includeAnalysisResults,
          includeKeywordResults,
          includeNgramResults,
          format,
        }
        await exportFullProject(projectId, projectName, options)
      } else {
        // Bundle export
        const options: LensBundleOptions = {
          includeText: bundleIncludeText,
          includeAnalysis: bundleIncludeAnalysis,
          includeProfiles: bundleIncludeProfiles,
          includePdfs: bundleIncludePdfs,
        }
        await exportLensBundle(projectId, projectName, options, setBundleProgress)
      }
      onClose()
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
      setBundleProgress(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Project</DialogTitle>
          <DialogDescription>
            Choose an export format for your project data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Export Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Export Type</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setExportType('summary')}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  exportType === 'summary'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <FileSpreadsheet className="h-5 w-5 mb-1.5 text-primary" />
                <div className="font-medium text-sm">Summary</div>
                <div className="text-xs text-muted-foreground">
                  Metadata & metrics
                </div>
              </button>
              <button
                onClick={() => setExportType('full')}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  exportType === 'full'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <Archive className="h-5 w-5 mb-1.5 text-primary" />
                <div className="font-medium text-sm">Full Export</div>
                <div className="text-xs text-muted-foreground">
                  ZIP with all data
                </div>
              </button>
              <button
                onClick={() => setExportType('bundle')}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  exportType === 'bundle'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/30'
                }`}
              >
                <Package className="h-5 w-5 mb-1.5 text-primary" />
                <div className="font-medium text-sm">.lens Bundle</div>
                <div className="text-xs text-muted-foreground">
                  Shareable project
                </div>
              </button>
            </div>
          </div>

          {/* Format Selection - Summary & Full only */}
          {exportType !== 'bundle' && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Format</label>
              <div className="flex gap-2">
                {exportType === 'summary' ? (
                  <>
                    <Button
                      variant={format === 'xlsx' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormat('xlsx')}
                    >
                      Excel (.xlsx)
                    </Button>
                    <Button
                      variant={format === 'csv' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormat('csv')}
                    >
                      CSV
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant={format === 'xlsx' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormat('xlsx')}
                    >
                      Excel files
                    </Button>
                    <Button
                      variant={format === 'csv' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormat('csv')}
                    >
                      CSV files
                    </Button>
                    <Button
                      variant={format === 'json' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFormat('json')}
                    >
                      JSON
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Full Export Options */}
          {exportType === 'full' && (
            <div className="space-y-3">
              <label className="text-sm font-medium">Include in ZIP</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeDocumentSummary}
                    onCheckedChange={(checked) =>
                      setIncludeDocumentSummary(checked === true)
                    }
                  />
                  Project summary spreadsheet
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeAnalysisResults}
                    onCheckedChange={(checked) =>
                      setIncludeAnalysisResults(checked === true)
                    }
                  />
                  Analysis results (readability, writing quality)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeDocumentText}
                    onCheckedChange={(checked) =>
                      setIncludeDocumentText(checked === true)
                    }
                  />
                  Extracted text (larger file size)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeKeywordResults}
                    onCheckedChange={(checked) =>
                      setIncludeKeywordResults(checked === true)
                    }
                  />
                  Keyword search results
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeNgramResults}
                    onCheckedChange={(checked) =>
                      setIncludeNgramResults(checked === true)
                    }
                  />
                  N-gram analysis results
                </label>
              </div>
            </div>
          )}

          {/* Bundle Export Options */}
          {exportType === 'bundle' && (
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-medium">Bundle Contents</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={bundleIncludeText}
                      onCheckedChange={(checked) =>
                        setBundleIncludeText(checked === true)
                      }
                    />
                    Extracted text (enables text-only analysis on import)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={bundleIncludeAnalysis}
                      onCheckedChange={(checked) =>
                        setBundleIncludeAnalysis(checked === true)
                      }
                    />
                    Analysis results (readability, writing quality, word analysis)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={bundleIncludeProfiles}
                      onCheckedChange={(checked) =>
                        setBundleIncludeProfiles(checked === true)
                      }
                    />
                    Analysis profiles (keyword selections, domains)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={bundleIncludePdfs}
                      onCheckedChange={(checked) =>
                        setBundleIncludePdfs(checked === true)
                      }
                    />
                    <span className="flex-1">
                      PDF files (significantly larger file size)
                    </span>
                  </label>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="text-muted-foreground">
                  The .lens bundle format allows you to share projects with colleagues
                  or sync across devices. Documents are matched by content hash to
                  avoid duplicates on import.
                </p>
                {bundleEstimate && (
                  <p className="font-medium">
                    Estimated size: ~{formatBytes(bundleEstimate.size)}
                  </p>
                )}
                {bundleIncludePdfs && bundleEstimate && bundleEstimate.size > 100 * 1024 * 1024 && (
                  <p className="text-brass">
                    Warning: Large bundle. Consider exporting without PDFs for faster transfer.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Summary info for non-bundle exports */}
          {exportType !== 'bundle' && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>
                  {documentCount} document{documentCount !== 1 ? 's' : ''} will be
                  exported
                </span>
              </div>
            </div>
          )}

          {/* Bundle Progress */}
          {bundleProgress && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="flex-1 truncate">
                  {bundleProgress.phase === 'packaging'
                    ? 'Creating bundle...'
                    : `${bundleProgress.phase}: ${bundleProgress.currentItem}`}
                </span>
                <span className="text-muted-foreground">
                  {bundleProgress.current}/{bundleProgress.total}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={exporting}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {exporting
                ? 'Exporting...'
                : exportType === 'bundle'
                ? 'Export .lens'
                : 'Export'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
