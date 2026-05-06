import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, FileText, BarChart3, Search, Trash2, Loader2, Hash, PieChart, Download, Package, Library, FolderMinus, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DocumentTable } from '@/components/DocumentTable'
import { DocumentMetadataModal } from '@/components/DocumentMetadataModal'
import { ImportProgressDialog } from '@/components/ImportProgressDialog'
import { ExportOptionsModal } from '@/components/ExportOptionsModal'
import { ProfileSelector } from '@/components/ProfileSelector'
import { ProfileEditor } from '@/components/ProfileEditor'
import { KeywordPicker } from '@/components/KeywordPicker'
import { useProjectStore } from '@/stores/projectStore'
import { ImportBundleDialog } from '@/components/ImportBundleDialog'
import { AddFromLibraryDialog } from '@/components/AddFromLibraryDialog'
import { DocumentAnalysisPanel } from '@/components/DocumentAnalysisPanel'
import { HelpButton } from '@/components/HelpButton'
import {
  importDocuments,
  deleteDocuments,
  removeDocumentFromProject,
  getProjectDocuments,
  type DocumentRecord,
  type ImportProgress,
  type ImportResult,
} from '@/services/documents'
import {
  analyzeDocuments,
  type AnalysisProgress,
} from '@/services/analysis'
import { duplicateProject } from '@/services/projects'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export function ProjectDashboard() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false)
  
  // Import state
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  
  // Analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  
  // Modal state
  const [editingDocument, setEditingDocument] = useState<DocumentRecord | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const [showKeywordPicker, setShowKeywordPicker] = useState(false)
  const { resolvedKeywords, profile: storeProfile, loadProject: loadStoreProject } = useProjectStore()
  const [showImportBundle, setShowImportBundle] = useState(false)
  const [showAddFromLibrary, setShowAddFromLibrary] = useState(false)
  const [statsDocument, setStatsDocument] = useState<DocumentRecord | null>(null)
  const [duplicating, setDuplicating] = useState(false)

  useEffect(() => {
    if (projectId) {
      loadProject()
      loadDocuments()
      loadStoreProject(projectId)
    }
  }, [projectId])

  const loadProject = async () => {
    try {
      const result = await window.electron.dbQuery<Project>(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      )
      if (result.length > 0) {
        setProject(result[0])
      }
    } catch (error) {
      console.error('Failed to load project:', error)
    }
  }

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const result = await getProjectDocuments(projectId!)
      setDocuments(result)
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleImportFiles = async (filePaths?: string[]) => {
    try {
      let paths = filePaths
      
      if (!paths) {
        const result = await window.electron.openFileDialog({
          title: 'Select PDF files to import',
          filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
        })

        if (result.canceled || result.filePaths.length === 0) {
          return
        }
        paths = result.filePaths
      }

      setImporting(true)
      setImportResults([])
      setImportProgress({
        total: paths.length,
        current: 0,
        currentFile: '',
        status: 'pending',
      })

      const results = await importDocuments(projectId!, paths, setImportProgress)
      setImportResults(results)
      
      // Reload documents after import
      loadDocuments()
      
      // Auto-close dialog after 3 seconds if all successful
      const allSuccess = results.every((r) => r.success)
      if (allSuccess) {
        setTimeout(() => {
          setImporting(false)
          setImportProgress(null)
          setImportResults([])
        }, 2000)
      }
    } catch (error) {
      console.error('Import failed:', error)
      setImportProgress({
        total: 0,
        current: 0,
        currentFile: '',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleRemoveFromProject = async (documentIds: string[]) => {
    const count = documentIds.length
    const message = count === 1
      ? 'Remove this document from the project?\n\nThe document will remain in your library and can be added to other projects.'
      : `Remove ${count} documents from the project?\n\nThey will remain in your library and can be added to other projects.`

    if (!confirm(message)) {
      return
    }

    try {
      for (const docId of documentIds) {
        await removeDocumentFromProject(docId, projectId!)
      }
      setSelectedIds(new Set())
      loadDocuments()
    } catch (error) {
      console.error('Failed to remove documents:', error)
    }
  }

  const handleDeleteDocuments = async (documentIds: string[]) => {
    const count = documentIds.length
    const message = count === 1
      ? 'Permanently delete this document from the library?\n\nThis will remove it from ALL projects and cannot be undone.'
      : `Permanently delete ${count} documents from the library?\n\nThis will remove them from ALL projects and cannot be undone.`

    if (!confirm(message)) {
      return
    }

    try {
      await deleteDocuments(documentIds)
      setSelectedIds(new Set())
      loadDocuments()
    } catch (error) {
      console.error('Failed to delete documents:', error)
    }
  }

  const handleOpenFile = async (document: DocumentRecord) => {
    try {
      await window.electron.openPath(document.file_path)
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  const handleDuplicateProject = async () => {
    const newName = prompt(
      'Enter a name for the duplicated project:',
      `${project?.name} (Copy)`
    )
    if (!newName?.trim()) return

    try {
      setDuplicating(true)
      const newProjectId = await duplicateProject(projectId!, newName.trim())
      // Navigate to the new project
      navigate(`/project/${newProjectId}`)
    } catch (error) {
      console.error('Failed to duplicate project:', error)
      alert('Failed to duplicate project. Please try again.')
    } finally {
      setDuplicating(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!confirm('Delete this project?\n\nDocuments will remain in your library and can be added to other projects.')) {
      return
    }

    try {
      await window.electron.dbRun('DELETE FROM projects WHERE id = ?', [projectId])
      navigate('/')
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project. Please try again.')
    }
  }

  const handleAnalyzeAll = async (forceRedo = false) => {
    // Get documents that need analysis (have text but not completed, or all if forceRedo)
    const docsToAnalyze = forceRedo
      ? documents.filter(d => d.extracted_text)
      : documents.filter(d => d.extracted_text && d.analysis_status !== 'completed')

    if (docsToAnalyze.length === 0) {
      alert('No documents available to analyze (all documents need extracted text).')
      return
    }

    setAnalyzing(true)
    setAnalysisProgress({
      total: docsToAnalyze.length,
      current: 0,
      currentDocument: '',
      status: 'pending',
    })

    try {
      const result = await analyzeDocuments(docsToAnalyze, setAnalysisProgress)
      
      // Show completion message
      if (result.failed > 0) {
        alert(`Analysis complete: ${result.success} succeeded, ${result.failed} failed`)
      }
      
      // Reload documents to show updated status
      loadDocuments()
    } catch (error) {
      console.error('Analysis failed:', error)
      alert('Analysis failed. Please try again.')
    } finally {
      setAnalyzing(false)
      setAnalysisProgress(null)
    }
  }

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    const pdfFiles = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    
    if (pdfFiles.length > 0) {
      // Note: In Electron, we can get the file path from the File object
      const filePaths = pdfFiles.map((f) => (f as any).path).filter(Boolean)
      if (filePaths.length > 0) {
        handleImportFiles(filePaths)
      }
    }
  }, [projectId])

  if (!project) {
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
    <div 
      className="p-8 min-h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-primary/5 border-[3px] border-dashed border-primary flex items-center justify-center backdrop-blur-[1px]">
          <div className="text-center">
            <Upload className="h-14 w-14 mx-auto text-primary mb-4" strokeWidth={1.25} />
            <p className="font-display text-3xl font-medium text-primary">Drop PDF files here</p>
            <p className="label-masthead mt-2">Release to import</p>
          </div>
        </div>
      )}

      {/* Masthead */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="-ml-2" aria-label="Go back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="label-masthead">The Reading Room · Project</div>
        </div>
        <div className="flex items-end justify-between gap-6 border-b-2 border-foreground pb-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-4xl lg:text-5xl font-medium leading-[1.05] tracking-tight text-foreground">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-2 font-display italic text-base text-muted-foreground leading-snug max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 pb-1">
            <ProfileSelector
              projectId={projectId!}
              onManageProfiles={() => setShowProfileEditor(true)}
            />
            <Button variant="ghost" size="icon" onClick={handleDuplicateProject} disabled={duplicating} title="Duplicate project" aria-label="Duplicate project">
              {duplicating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDeleteProject} title="Delete project" aria-label="Delete project">
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
          </div>
        </div>
      </header>

      {/* Stats strip — editorial figures row */}
      {(() => {
        const analyzed = documents.filter((d) => d.analysis_status === 'completed').length
        const pending = documents.filter((d) => d.analysis_status !== 'completed').length
        const failed = documents.filter((d) => d.analysis_status === 'failed').length
        const companies = new Set(documents.map((d) => d.company_name).filter(Boolean)).size
        const items = [
          { label: 'Documents', value: documents.length },
          { label: 'Analyzed', value: analyzed },
          { label: 'Pending', value: pending, sub: failed > 0 ? `${failed} failed` : undefined },
          { label: 'Companies', value: companies },
        ]
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mb-8 border border-border bg-card divide-x divide-border">
            {items.map((item) => (
              <div key={item.label} className="px-5 py-4">
                <div className="label-masthead">{item.label}</div>
                <div className="font-display text-4xl font-medium tabular mt-1 text-foreground leading-none">
                  {String(item.value).padStart(2, '0')}
                </div>
                {item.sub && (
                  <div className="text-[10px] tabular text-destructive uppercase tracking-wider font-medium mt-1.5">
                    {item.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })()}

      {/* Keywords Configuration Card */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Keywords</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowKeywordPicker(true)}>
              {resolvedKeywords.length > 0 ? 'Edit' : 'Select Keywords'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {resolvedKeywords.length > 0 ? (
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {/* Show enabled lists from profile config */}
                {storeProfile && Object.entries(storeProfile.config.keywords)
                  .filter(([_, v]) => v.enabled && v.selected.length > 0)
                  .map(([key, val]) => (
                    <span key={key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs">
                      <span className="font-medium">{key}</span>
                      <span className="opacity-70">{val.selected.length}</span>
                    </span>
                  ))
                }
              </div>
              <div className="text-sm text-muted-foreground">
                {resolvedKeywords.length} keywords active
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              No keywords configured yet.{' '}
              <button
                onClick={() => setShowKeywordPicker(true)}
                className="text-primary hover:underline"
              >
                Select keyword lists
              </button>
              {' '}to start analyzing your documents.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis workflow — editorial step list */}
      {!localStorage.getItem('hideWorkflowGuide') && (
        <div className="mb-8 border border-border bg-card p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="label-masthead">Method</div>
              <h3 className="font-display text-xl font-medium mt-1">The Analysis Workflow</h3>
            </div>
            <button
              onClick={() => {
                localStorage.setItem('hideWorkflowGuide', 'true')
                setDocuments([...documents])
              }}
              className="label-masthead hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { n: '01', title: 'Import & Analyze', desc: 'Import PDFs and run document-level analysis: readability, writing quality, word frequency.', link: null },
              { n: '02', title: 'Keyword Search', desc: 'Search framework terms across documents. Use taxonomy hierarchies for tier-level analysis.', link: `/project/${projectId}/search` },
              { n: '03', title: 'N-gram Discovery', desc: 'Find frequently-occurring 2–3 word phrases to surface patterns and terminology.', link: `/project/${projectId}/ngrams` },
              { n: '04', title: 'Visualize', desc: 'Generate charts comparing keyword usage, trends, and document coverage.', link: `/project/${projectId}/visualize` },
            ].map((step, i, arr) => (
              <div key={step.n} className={cn('relative', i < arr.length - 1 && 'md:pr-6 md:border-r md:border-border')}>
                <div className="font-mono tabular text-primary text-sm mb-2">{step.n}</div>
                <div className="font-display text-base font-medium mb-1">
                  {step.link ? (
                    <Link to={step.link} className="link-editorial">{step.title}</Link>
                  ) : step.title}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button onClick={() => handleImportFiles()}>
          <Upload className="h-4 w-4 mr-2" />
          Import PDFs
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowAddFromLibrary(true)}
        >
          <Library className="h-4 w-4 mr-2" />
          Add from Library
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowImportBundle(true)}
        >
          <Package className="h-4 w-4 mr-2" />
          Import Bundle
        </Button>
        {(() => {
          const analyzedCount = documents.filter(d => d.analysis_status === 'completed').length
          const analyzableCount = documents.filter(d => d.extracted_text).length
          const failedCount = documents.filter(d => d.analysis_status === 'failed').length
          const allAnalyzed = analyzedCount === analyzableCount && analyzableCount > 0
          const pendingCount = analyzableCount - analyzedCount

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  disabled={documents.length === 0 || analyzing}
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4 mr-2" />
                  )}
                  {analyzing ? 'Analyzing...' : allAnalyzed ? 'Analysis Complete' : `Analyze (${pendingCount})`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {!allAnalyzed && pendingCount > 0 && (
                  <DropdownMenuItem onClick={() => handleAnalyzeAll(false)}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Analyze Pending ({pendingCount})
                  </DropdownMenuItem>
                )}
                {failedCount > 0 && (
                  <DropdownMenuItem onClick={() => {
                    const failedDocs = documents.filter(d => d.analysis_status === 'failed' && d.extracted_text)
                    if (failedDocs.length > 0) handleAnalyzeAll(false)
                  }}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry Failed ({failedCount})
                  </DropdownMenuItem>
                )}
                {analyzableCount > 0 && (
                  <DropdownMenuItem onClick={() => handleAnalyzeAll(true)}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {allAnalyzed ? 'Redo All Analysis' : `Redo All (${analyzableCount})`}
                  </DropdownMenuItem>
                )}
                {analyzableCount === 0 && (
                  <DropdownMenuItem disabled>
                    No documents with text to analyze
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        })()}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            disabled={documents.length === 0}
            onClick={() => navigate(`/project/${projectId}/search`)}
          >
            <Search className="h-4 w-4 mr-2" />
            Keyword Search
          </Button>
          <HelpButton section="user-guide" tooltip="Learn about keyword search" />
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            disabled={documents.length === 0}
            onClick={() => navigate(`/project/${projectId}/ngrams`)}
          >
            <Hash className="h-4 w-4 mr-2" />
            N-gram Analysis
          </Button>
          <HelpButton section="analysis-workflows" tooltip="Learn about N-gram analysis" />
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            disabled={documents.length === 0}
            onClick={() => navigate(`/project/${projectId}/visualize`)}
          >
            <PieChart className="h-4 w-4 mr-2" />
            Visualizations
          </Button>
          <HelpButton section="user-guide" tooltip="Learn about visualizations" />
        </div>
        <Button
          variant="outline"
          disabled={documents.length === 0}
          onClick={() => setShowExportModal(true)}
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>

        {/* Selection-based actions */}
        {selectedIds.size > 0 && (
          <>
            <Button
              variant="outline"
              onClick={() => handleRemoveFromProject(Array.from(selectedIds))}
            >
              <FolderMinus className="h-4 w-4 mr-2" />
              Remove from Project ({selectedIds.size})
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDeleteDocuments(Array.from(selectedIds))}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete from Library ({selectedIds.size})
            </Button>
          </>
        )}
      </div>

      {/* Analysis Progress */}
      {analyzing && analysisProgress && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Analyzing: {analysisProgress.currentDocument}
                </p>
                <p className="text-xs text-muted-foreground">
                  {analysisProgress.current} of {analysisProgress.total} documents
                </p>
              </div>
            </div>
            <Progress 
              value={(analysisProgress.current / analysisProgress.total) * 100} 
              className="h-2" 
            />
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-md">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-4" strokeWidth={1.25} />
              <h2 className="font-display text-2xl font-medium mb-2">No documents in this project yet</h2>
              <p className="font-display italic text-muted-foreground mb-6 max-w-md mx-auto">
                Drop PDFs anywhere on this page, or pick a starting point:
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => handleImportFiles()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import PDFs from your computer
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddFromLibrary(true)}
                >
                  <Library className="h-4 w-4 mr-2" />
                  Add from Library
                </Button>
              </div>
            </div>
          ) : (
            <DocumentTable
              documents={documents}
              projectId={projectId!}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onEdit={setEditingDocument}
              onDelete={handleDeleteDocuments}
              onRemoveFromProject={handleRemoveFromProject}
              onOpenFile={handleOpenFile}
              onViewStats={setStatsDocument}
              onRefresh={loadDocuments}
            />
          )}
        </CardContent>
      </Card>

      {/* Import Progress Dialog */}
      <ImportProgressDialog
        open={importing}
        progress={importProgress}
        results={importResults}
        onClose={() => setImporting(false)}
      />

      {/* Document Metadata Modal */}
      <DocumentMetadataModal
        open={editingDocument !== null}
        onClose={() => setEditingDocument(null)}
        document={editingDocument}
        onSaved={loadDocuments}
      />

      {/* Export Options Modal */}
      <ExportOptionsModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        projectId={projectId!}
        projectName={project?.name || 'project'}
        documentCount={documents.length}
      />

      {/* Keyword Picker */}
      <KeywordPicker
        open={showKeywordPicker}
        onClose={() => setShowKeywordPicker(false)}
      />

      {/* Profile Editor Modal */}
      <ProfileEditor
        open={showProfileEditor}
        onClose={() => setShowProfileEditor(false)}
        projectId={projectId!}
        projectName={project?.name}
        onSaved={() => loadStoreProject(projectId!)}
      />

      {/* Import Bundle Dialog */}
      <ImportBundleDialog
        open={showImportBundle}
        onClose={() => setShowImportBundle(false)}
        projectId={projectId!}
        onImported={loadDocuments}
      />

      {/* Add From Library Dialog */}
      <AddFromLibraryDialog
        open={showAddFromLibrary}
        onClose={() => setShowAddFromLibrary(false)}
        projectId={projectId!}
        onAdded={loadDocuments}
      />

      {/* Document Analysis Panel */}
      <DocumentAnalysisPanel
        document={statsDocument}
        onClose={() => setStatsDocument(null)}
      />
    </div>
  )
}
