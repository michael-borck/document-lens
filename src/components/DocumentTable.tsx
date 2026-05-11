import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Eye,
  FolderMinus,
  BarChart3,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  FileQuestion,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  type DocumentRecord,
  type DocumentStatus,
  getDocumentStatus,
  reExtractDocument,
} from '@/services/documents'
import { analyzeDocument } from '@/services/analysis'
import { toast } from '@/stores/toastStore'

type SortField = 'filename' | 'company_name' | 'report_year' | 'analysis_status' | 'created_at'
type SortDirection = 'asc' | 'desc'

interface DocumentTableProps {
  documents: DocumentRecord[]
  projectId: string
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  onEdit: (document: DocumentRecord) => void
  onDelete: (documentIds: string[]) => void
  onRemoveFromProject?: (documentIds: string[]) => void
  onOpenFile: (document: DocumentRecord) => void
  onViewStats?: (document: DocumentRecord) => void
  onRefresh?: () => void
}

export function DocumentTable({
  documents,
  projectId,
  selectedIds,
  onSelectionChange,
  onEdit,
  onDelete,
  onRemoveFromProject,
  onOpenFile,
  onViewStats,
  onRefresh,
}: DocumentTableProps) {
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number; openUp: boolean } | null>(null)
  const [documentStatuses, setDocumentStatuses] = useState<Record<string, DocumentStatus>>({})
  const [reExtracting, setReExtracting] = useState<string | null>(null)
  const [retryingAnalysis, setRetryingAnalysis] = useState<string | null>(null)

  const handleRetryAnalysis = async (doc: DocumentRecord) => {
    if (!doc.extracted_text) {
      toast.error('Cannot retry: no extracted text', 'Try re-extracting from the PDF first.')
      return
    }
    setRetryingAnalysis(doc.id)
    try {
      await analyzeDocument(doc)
      toast.success('Analysis complete', doc.filename)
      onRefresh?.()
    } catch (error) {
      console.error('Retry analysis failed:', error)
      toast.error('Analysis still failing', error instanceof Error ? error.message : String(error))
    } finally {
      setRetryingAnalysis(null)
    }
  }

  const openContextMenu = useCallback((docId: string, buttonElement: HTMLButtonElement) => {
    const rect = buttonElement.getBoundingClientRect()
    const menuHeight = 280 // Approximate menu height
    const viewportHeight = window.innerHeight
    const spaceBelow = viewportHeight - rect.bottom
    const openUp = spaceBelow < menuHeight && rect.top > menuHeight

    setContextMenu({
      id: docId,
      x: rect.right - 160, // Menu width is 160px (w-40)
      y: openUp ? rect.top : rect.bottom,
      openUp
    })
  }, [])

  // Load document statuses
  useEffect(() => {
    const loadStatuses = async () => {
      const statuses: Record<string, DocumentStatus> = {}
      for (const doc of documents) {
        statuses[doc.id] = await getDocumentStatus(doc)
      }
      setDocumentStatuses(statuses)
    }
    loadStatuses()
  }, [documents])

  const handleOpenFile = async (doc: DocumentRecord) => {
    const status = documentStatuses[doc.id]
    if (status && !status.pdfAvailable) {
      alert('PDF file not found at original location. The file may have been moved or deleted.')
      return
    }
    onOpenFile(doc)
  }

  const handleReExtract = async (doc: DocumentRecord) => {
    const status = documentStatuses[doc.id]
    if (status && !status.pdfAvailable) {
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
        onRefresh?.()
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedDocuments = [...documents].sort((a, b) => {
    let aVal: string | number | null = a[sortField]
    let bVal: string | number | null = b[sortField]

    // Handle null values
    if (aVal === null) aVal = ''
    if (bVal === null) bVal = ''

    // Compare
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

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(documents.map((d) => d.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelection = new Set(selectedIds)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    onSelectionChange(newSelection)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    )
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-brass/15 text-brass border border-brass/30',
      analyzing: 'bg-secondary text-foreground border border-border',
      failed: 'bg-destructive/10 text-destructive border border-destructive/30',
      pending: 'bg-muted text-muted-foreground border border-border',
    }
    return styles[status] || styles.pending
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="w-10 px-3 py-3">
              <Checkbox
                checked={selectedIds.size === documents.length && documents.length > 0}
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
            <th className="text-left px-3 py-3 w-28">
              <button
                className="flex items-center gap-1 text-sm font-medium hover:text-primary"
                onClick={() => handleSort('analysis_status')}
              >
                Analysis
                <SortIcon field="analysis_status" />
              </button>
            </th>
            <th className="text-left px-3 py-3 w-24">
              <span className="text-sm font-medium">Availability</span>
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
                <Link
                  to={`/project/${projectId}/document/${doc.id}`}
                  className="flex items-center gap-2 hover:text-primary transition-colors"
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate max-w-[300px] hover:underline" title={doc.filename}>
                    {doc.filename}
                  </span>
                </Link>
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
                <span
                  className={`text-xs px-2 py-1 rounded-full ${getStatusBadge(doc.analysis_status)}`}
                >
                  {doc.analysis_status}
                </span>
              </td>
              <td className="px-3 py-3">
                {documentStatuses[doc.id] && (
                  <div className="flex flex-col gap-0.5">
                    {documentStatuses[doc.id].textAvailable ? (
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
                    {documentStatuses[doc.id].pdfAvailable ? (
                      <span className="flex items-center gap-1 text-xs text-brass" title="PDF available">
                        <CheckCircle className="h-3 w-3" />
                        PDF
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-600" title="PDF not found">
                        <FileQuestion className="h-3 w-3" />
                        No PDF
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="px-3 py-3">
                <div className="relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="More actions"
                    onClick={(e) => {
                      if (contextMenu?.id === doc.id) {
                        setContextMenu(null)
                      } else {
                        openContextMenu(doc.id, e.currentTarget)
                      }
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>

                  {contextMenu?.id === doc.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setContextMenu(null)}
                      />
                      <div
                        className="fixed z-50 w-40 bg-popover border rounded-md shadow-lg py-1"
                        style={{
                          left: contextMenu.x,
                          ...(contextMenu.openUp
                            ? { bottom: window.innerHeight - contextMenu.y + 4 }
                            : { top: contextMenu.y + 4 })
                        }}
                      >
                        <Link
                          to={`/project/${projectId}/document/${doc.id}`}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                          onClick={() => setContextMenu(null)}
                        >
                          <Eye className="h-4 w-4" />
                          View Document
                        </Link>
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                          onClick={() => {
                            onEdit(doc)
                            setContextMenu(null)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Edit Metadata
                        </button>
                        <button
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted ${documentStatuses[doc.id] && !documentStatuses[doc.id].pdfAvailable ? 'text-muted-foreground' : ''}`}
                          onClick={() => {
                            handleOpenFile(doc)
                            setContextMenu(null)
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open PDF
                          {documentStatuses[doc.id] && !documentStatuses[doc.id].pdfAvailable && (
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                          )}
                        </button>
                        <button
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted ${documentStatuses[doc.id] && !documentStatuses[doc.id].pdfAvailable ? 'text-muted-foreground' : ''}`}
                          onClick={() => {
                            handleReExtract(doc)
                            setContextMenu(null)
                          }}
                          disabled={reExtracting === doc.id}
                        >
                          <RefreshCw className={`h-4 w-4 ${reExtracting === doc.id ? 'animate-spin' : ''}`} />
                          {reExtracting === doc.id ? 'Re-extracting...' : 'Re-extract Text'}
                        </button>
                        {doc.analysis_status === 'failed' && (
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-muted"
                            onClick={() => {
                              handleRetryAnalysis(doc)
                              setContextMenu(null)
                            }}
                            disabled={retryingAnalysis === doc.id}
                          >
                            <RefreshCw className={`h-4 w-4 ${retryingAnalysis === doc.id ? 'animate-spin' : ''}`} />
                            {retryingAnalysis === doc.id ? 'Retrying…' : 'Retry Analysis'}
                          </button>
                        )}
                        {onViewStats && (
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                            onClick={() => {
                              onViewStats(doc)
                              setContextMenu(null)
                            }}
                          >
                            <BarChart3 className="h-4 w-4" />
                            View Stats
                          </button>
                        )}
                        {onRemoveFromProject && (
                          <button
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                            onClick={() => {
                              onRemoveFromProject([doc.id])
                              setContextMenu(null)
                            }}
                          >
                            <FolderMinus className="h-4 w-4" />
                            Remove from Project
                          </button>
                        )}
                        <button
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-muted"
                          onClick={() => {
                            onDelete([doc.id])
                            setContextMenu(null)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete from Library
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
  )
}
