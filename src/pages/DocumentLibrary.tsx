import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  Search,
  Trash2,
  Upload,
  MoreVertical,
  ExternalLink,
  Pencil,
  FolderOpen,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  FileQuestion,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DocumentMetadataModal } from '@/components/DocumentMetadataModal'
import {
  getAllDocumentsWithStatus,
  deleteDocuments,
  getDocumentProjects,
  reExtractDocument,
  importDocuments,
  type DocumentRecord,
  type DocumentStatus,
  type ImportProgress,
} from '@/services/documents'
import { toast } from '@/stores/toastStore'

type SortField = 'filename' | 'company_name' | 'report_year' | 'created_at'
type SortDirection = 'asc' | 'desc'

interface DocumentWithProjects extends DocumentRecord {
  projects: Array<{ id: string; name: string }>
  status: DocumentStatus
}

export function DocumentLibrary() {
  const [documents, setDocuments] = useState<DocumentWithProjects[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [contextMenu, setContextMenu] = useState<string | null>(null)
  const [editingDocument, setEditingDocument] = useState<DocumentRecord | null>(null)
  const [reExtracting, setReExtracting] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const docs = await getAllDocumentsWithStatus()

      // Load projects for each document
      const docsWithProjects = await Promise.all(
        docs.map(async (doc) => {
          const projects = await getDocumentProjects(doc.id)
          return { ...doc, projects }
        })
      )

      setDocuments(docsWithProjects)
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleDeleteDocuments = async (ids: string[]) => {
    const count = ids.length
    let message: string

    if (count === 1) {
      // For single document, show which projects it's in
      const projects = await getDocumentProjects(ids[0])
      if (projects.length > 0) {
        const projectNames = projects.map(p => `• ${p.name}`).join('\n')
        message = `Permanently delete this document?\n\nIt is currently in ${projects.length} project(s):\n${projectNames}\n\nThis cannot be undone.`
      } else {
        message = 'Permanently delete this document from the library?\n\nThis cannot be undone.'
      }
    } else {
      message = `Permanently delete ${count} documents from the library?\n\nThey will be removed from ALL projects. This cannot be undone.`
    }

    if (!confirm(message)) {
      return
    }

    try {
      await deleteDocuments(ids)
      setSelectedIds(new Set())
      loadDocuments()
    } catch (error) {
      console.error('Failed to delete documents:', error)
    }
  }

  const handleImportToLibrary = async () => {
    try {
      // Open file dialog
      const result = await window.electron.openFileDialog({
        title: 'Select PDFs to import',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      })

      if (result.canceled || result.filePaths.length === 0) return

      const filePaths = result.filePaths

      setImporting(true)
      setImportProgress({ total: filePaths.length, current: 0, currentFile: '', status: 'importing' })

      const results = await importDocuments(null, filePaths, (progress) => {
        setImportProgress(progress)
      })

      // Show summary
      const successful = results.filter((r) => r.success).length
      const alreadyExisted = results.filter((r) => r.alreadyInLibrary).length
      const failed = results.filter((r) => !r.success && !r.alreadyInLibrary).length

      if (failed > 0) {
        alert(`Import complete.\n\n${successful} imported\n${alreadyExisted} already in library\n${failed} failed`)
      }

      loadDocuments()
    } catch (error) {
      console.error('Failed to import documents:', error)
      alert('Failed to import documents.')
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleOpenFile = async (doc: DocumentWithProjects) => {
    if (!doc.status.pdfAvailable) {
      alert('PDF file not found at original location. The file may have been moved or deleted.')
      return
    }
    try {
      await window.electron.openPath(doc.file_path)
    } catch (error) {
      console.error('Failed to open file:', error)
      alert('Failed to open PDF file.')
    }
  }

  const handleReExtract = async (doc: DocumentWithProjects) => {
    if (!doc.status.pdfAvailable) {
      toast.error('Cannot re-extract', 'PDF file not found at original location.')
      return
    }

    if (!confirm(`Re-extract text from "${doc.filename}"?\n\nThis will replace the existing extracted text and clear any analysis results.`)) {
      return
    }

    setReExtracting(doc.id)
    try {
      const result = await reExtractDocument(doc.id)
      if (result.success) {
        toast.success('Text re-extracted', doc.filename)
        loadDocuments()
      } else {
        toast.error('Re-extraction failed', result.error)
      }
    } catch (error) {
      console.error('Failed to re-extract:', error)
      toast.error('Failed to re-extract text', error instanceof Error ? error.message : String(error))
    } finally {
      setReExtracting(null)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDocuments.map((d) => d.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedIds(newSelection)
  }

  const filteredDocuments = documents.filter((doc) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      doc.filename.toLowerCase().includes(query) ||
      doc.company_name?.toLowerCase().includes(query) ||
      doc.report_year?.toString().includes(query) ||
      doc.projects.some((p) => p.name.toLowerCase().includes(query))
    )
  })

  const sortedDocuments = [...filteredDocuments].sort((a, b) => {
    let aVal: string | number | null = a[sortField]
    let bVal: string | number | null = b[sortField]

    if (aVal === null) aVal = ''
    if (bVal === null) bVal = ''

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
    }

    return 0
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    )
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
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Document Library</h1>
          <p className="text-muted-foreground">
            All documents across all projects
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unique Companies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(documents.map((d) => d.company_name).filter(Boolean)).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.filter((d) => d.projects.length > 0).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents..."
            className="pl-9"
          />
        </div>
        <Button onClick={handleImportToLibrary} disabled={importing}>
          <Upload className="h-4 w-4 mr-2" />
          {importing ? `Importing ${importProgress?.current || 0}/${importProgress?.total || 0}...` : 'Import PDFs'}
        </Button>
        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            onClick={() => handleDeleteDocuments(Array.from(selectedIds))}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Document Table */}
      <Card>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-lg font-medium mb-2">No documents in library</h2>
              <p className="text-muted-foreground mb-4">
                Import documents through a project to add them to your library.
              </p>
              <Link to="/">
                <Button>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Go to Projects
                </Button>
              </Link>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <Checkbox
                        checked={selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left px-3 py-3">
                      <button
                        className="flex items-center gap-1 text-sm font-medium hover:text-primary"
                        onClick={() => handleSort('filename')}
                      >
                        Document
                        <SortIcon field="filename" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-3">
                      <button
                        className="flex items-center gap-1 text-sm font-medium hover:text-primary"
                        onClick={() => handleSort('company_name')}
                      >
                        Company
                        <SortIcon field="company_name" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-3 w-24">
                      <button
                        className="flex items-center gap-1 text-sm font-medium hover:text-primary"
                        onClick={() => handleSort('report_year')}
                      >
                        Year
                        <SortIcon field="report_year" />
                      </button>
                    </th>
                    <th className="text-left px-3 py-3 w-32">
                      Status
                    </th>
                    <th className="text-left px-3 py-3">
                      Projects
                    </th>
                    <th className="w-20 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sortedDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      className="border-t hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selectedIds.has(doc.id)}
                          onCheckedChange={() => toggleSelect(doc.id)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[300px]" title={doc.filename}>
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-muted-foreground">
                          {doc.company_name || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm text-muted-foreground">
                          {doc.report_year || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {/* Text status */}
                          {doc.status.textAvailable ? (
                            <span className="flex items-center gap-1 text-xs text-brass" title="Text extracted">
                              <CheckCircle className="h-3 w-3" />
                              Text
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="No text extracted">
                              <AlertTriangle className="h-3 w-3" />
                              No text
                            </span>
                          )}
                          {/* PDF status */}
                          {doc.status.pdfAvailable ? (
                            <span className="flex items-center gap-1 text-xs text-brass" title="PDF available">
                              <CheckCircle className="h-3 w-3" />
                              PDF
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-destructive" title="PDF not found">
                              <FileQuestion className="h-3 w-3" />
                              No PDF
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {doc.projects.length === 0 ? (
                          <span className="text-sm text-muted-foreground italic">
                            Not in any project
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {doc.projects.map((project) => (
                              <Link
                                key={project.id}
                                to={`/project/${project.id}`}
                                className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary/20"
                              >
                                {project.name}
                              </Link>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setContextMenu(contextMenu === doc.id ? null : doc.id)}
                            aria-label="More actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>

                          {contextMenu === doc.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setContextMenu(null)}
                              />
                              <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-popover border rounded-md shadow-lg py-1">
                                <button
                                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                                  onClick={() => {
                                    setEditingDocument(doc)
                                    setContextMenu(null)
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit Metadata
                                </button>
                                <button
                                  className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted ${!doc.status.pdfAvailable ? 'text-muted-foreground' : ''}`}
                                  onClick={() => {
                                    handleOpenFile(doc)
                                    setContextMenu(null)
                                  }}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open PDF
                                  {!doc.status.pdfAvailable && <AlertTriangle className="h-3 w-3 text-destructive" />}
                                </button>
                                <button
                                  className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted ${!doc.status.pdfAvailable ? 'text-muted-foreground' : ''}`}
                                  onClick={() => {
                                    handleReExtract(doc)
                                    setContextMenu(null)
                                  }}
                                  disabled={reExtracting === doc.id}
                                >
                                  <RefreshCw className={`h-4 w-4 ${reExtracting === doc.id ? 'animate-spin' : ''}`} />
                                  {reExtracting === doc.id ? 'Re-extracting...' : 'Re-extract Text'}
                                </button>
                                <hr className="my-1 border-muted" />
                                <button
                                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-muted"
                                  onClick={() => {
                                    handleDeleteDocuments([doc.id])
                                    setContextMenu(null)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Metadata Modal */}
      <DocumentMetadataModal
        open={editingDocument !== null}
        onClose={() => setEditingDocument(null)}
        document={editingDocument}
        onSaved={loadDocuments}
      />
    </div>
  )
}
