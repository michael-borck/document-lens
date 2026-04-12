/**
 * ImportBundleDialog Component
 *
 * Dialog for importing .lens bundle files with preview and deduplication options.
 */

import { useState } from 'react'
import {
  Package,
  Loader2,
  FileText,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  previewBundle,
  importBundle,
  type ImportPreview,
  type ImportProgress,
  type ImportResult,
} from '@/services/import'

interface ImportBundleDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onImported?: () => void
}

type Phase = 'select' | 'preview' | 'importing' | 'complete'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function ImportBundleDialog({
  open,
  onClose,
  projectId,
  onImported,
}: ImportBundleDialogProps) {
  const [phase, setPhase] = useState<Phase>('select')
  const [bundlePath, setBundlePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Import options
  const [importDocuments, setImportDocuments] = useState(true)
  const [importProfiles, setImportProfiles] = useState(true)
  const [skipDuplicates, setSkipDuplicates] = useState(true)

  // Import progress
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const resetState = () => {
    setPhase('select')
    setBundlePath(null)
    setPreview(null)
    setLoading(false)
    setError(null)
    setImportDocuments(true)
    setImportProfiles(true)
    setSkipDuplicates(true)
    setProgress(null)
    setResult(null)
  }

  const handleSelectFile = async () => {
    try {
      const result = await window.electron.openFileDialog({
        title: 'Select .lens bundle file',
        filters: [{ name: 'Lens Bundle', extensions: ['lens'] }],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return
      }

      const path = result.filePaths[0]
      setBundlePath(path)
      setLoading(true)
      setError(null)

      const previewData = await previewBundle(path, projectId)
      setPreview(previewData)
      setPhase('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read bundle')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!bundlePath) return

    setPhase('importing')
    setError(null)

    try {
      const importResult = await importBundle(
        bundlePath,
        projectId,
        {
          importDocuments,
          importProfiles,
          skipDuplicates,
        },
        setProgress
      )

      setResult(importResult)
      setPhase('complete')

      if (importResult.success) {
        onImported?.()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setPhase('preview')
    }
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Import .lens Bundle
          </DialogTitle>
          <DialogDescription>
            Import documents and profiles from a shared bundle
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Phase: Select File */}
          {phase === 'select' && (
            <div className="space-y-4">
              <div
                onClick={handleSelectFile}
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Reading bundle...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="font-medium">Select .lens bundle file</p>
                    <p className="text-sm text-muted-foreground">
                      Click to browse or drag and drop
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* Phase: Preview */}
          {phase === 'preview' && preview && (
            <div className="space-y-4">
              {/* Bundle Info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{preview.manifest.source.project_name}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatBytes(preview.estimatedSize)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Created {new Date(preview.manifest.created_at).toLocaleDateString()} •
                  App v{preview.manifest.source.app_version}
                </div>
              </div>

              {/* Contents Summary */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Bundle Contents</label>
                <div className="space-y-2">
                  {/* Documents */}
                  <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={importDocuments}
                      onCheckedChange={(checked) => setImportDocuments(checked === true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {preview.documents.total} Documents
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <div>
                          {preview.documents.newDocuments} new •{' '}
                          {preview.documents.duplicates} duplicates
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {preview.manifest.contents.includes_text && (
                            <span className="inline-flex items-center gap-1 text-brass">
                              <CheckCircle2 className="h-3 w-3" /> Text included
                            </span>
                          )}
                          {preview.manifest.contents.includes_analysis && (
                            <span className="inline-flex items-center gap-1 text-brass">
                              <CheckCircle2 className="h-3 w-3" /> Analysis included
                            </span>
                          )}
                          {preview.manifest.contents.includes_pdfs && (
                            <span className="inline-flex items-center gap-1 text-brass">
                              <CheckCircle2 className="h-3 w-3" /> PDFs included
                            </span>
                          )}
                          {!preview.manifest.contents.includes_pdfs && preview.manifest.contents.includes_text && (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <AlertTriangle className="h-3 w-3" /> PDFs not included
                            </span>
                          )}
                        </div>
                        {preview.documents.textOnly > 0 && (
                          <div className="text-destructive">
                            {preview.documents.textOnly} document{preview.documents.textOnly !== 1 ? 's' : ''} have text only (no PDF)
                          </div>
                        )}
                      </div>
                    </div>
                  </label>

                  {/* Profiles */}
                  {preview.profiles.length > 0 && (
                    <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                      <Checkbox
                        checked={importProfiles}
                        onCheckedChange={(checked) => setImportProfiles(checked === true)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {preview.profiles.length} Project Settings & Keywords
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {preview.profiles.map(p => p.name).join(', ')}
                        </div>
                        {preview.keywordLists.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Includes {preview.keywordLists.length} custom keyword list{preview.keywordLists.length !== 1 ? 's' : ''}:
                            {' '}{preview.keywordLists.map(kl => kl.name).join(', ')}
                          </div>
                        )}
                      </div>
                    </label>
                  )}
                </div>
              </div>

              {/* Deduplication Option */}
              {preview.documents.duplicates > 0 && (
                <div className="bg-brass/10 border border-brass/30 p-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={skipDuplicates}
                      onCheckedChange={(checked) => setSkipDuplicates(checked === true)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-brass">
                        Skip {preview.documents.duplicates} duplicate document
                        {preview.documents.duplicates !== 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        These documents already exist in your project (matched by content hash)
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!importDocuments && !importProfiles}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Import
                </Button>
              </div>
            </div>
          )}

          {/* Phase: Importing */}
          {phase === 'importing' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>

              {progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{progress.currentItem}</span>
                    <span className="text-muted-foreground ml-2">
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  <Progress
                    value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
                    className="h-2"
                  />
                </div>
              )}

              <p className="text-center text-sm text-muted-foreground">
                Importing bundle contents...
              </p>
            </div>
          )}

          {/* Phase: Complete */}
          {phase === 'complete' && result && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center gap-2">
                {result.success ? (
                  <CheckCircle2 className="h-12 w-12 text-brass" />
                ) : (
                  <XCircle className="h-12 w-12 text-destructive" />
                )}
                <h3 className="font-medium text-lg">
                  {result.success ? 'Import Complete' : 'Import Completed with Errors'}
                </h3>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Documents imported:</span>
                  <span className="font-medium">{result.documentsImported}</span>
                </div>
                {result.documentsSkipped > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Duplicates skipped:</span>
                    <span>{result.documentsSkipped}</span>
                  </div>
                )}
                {result.profilesImported > 0 && (
                  <div className="flex justify-between">
                    <span>Profiles imported:</span>
                    <span className="font-medium">{result.profilesImported}</span>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="bg-destructive/10 rounded-lg p-3 space-y-1">
                  <div className="font-medium text-destructive text-sm">
                    {result.errors.length} error{result.errors.length !== 1 ? 's' : ''}:
                  </div>
                  <ul className="text-xs text-destructive/80 list-disc list-inside">
                    {result.errors.slice(0, 5).map((err, i) => (
                      <li key={i} className="truncate">{err}</li>
                    ))}
                    {result.errors.length > 5 && (
                      <li>...and {result.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={handleClose}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
