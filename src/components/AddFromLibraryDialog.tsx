import { useState, useEffect } from 'react'
import { Library, FileText, Check, Search, CheckCircle, AlertTriangle, FileQuestion } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  getDocumentsNotInProject,
  addDocumentToProject,
  getDocumentStatus,
  type DocumentRecord,
  type DocumentStatus,
} from '@/services/documents'

interface AddFromLibraryDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  onAdded: () => void
}

export function AddFromLibraryDialog({
  open,
  onClose,
  projectId,
  onAdded,
}: AddFromLibraryDialogProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [documentStatuses, setDocumentStatuses] = useState<Record<string, DocumentStatus>>({})

  useEffect(() => {
    if (open) {
      loadAvailableDocuments()
      setSelectedIds(new Set())
      setSearchQuery('')
    }
  }, [open, projectId])

  const loadAvailableDocuments = async () => {
    try {
      setLoading(true)
      const docs = await getDocumentsNotInProject(projectId)
      setDocuments(docs)

      // Load statuses for all documents
      const statuses: Record<string, DocumentStatus> = {}
      for (const doc of docs) {
        statuses[doc.id] = await getDocumentStatus(doc)
      }
      setDocumentStatuses(statuses)
    } catch (error) {
      console.error('Failed to load documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (docId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDocuments.map((d) => d.id)))
    }
  }

  const handleAdd = async () => {
    if (selectedIds.size === 0) return

    setAdding(true)
    try {
      for (const docId of selectedIds) {
        await addDocumentToProject(docId, projectId)
      }
      onAdded()
      onClose()
    } catch (error) {
      console.error('Failed to add documents:', error)
    } finally {
      setAdding(false)
    }
  }

  const filteredDocuments = documents.filter((doc) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      doc.filename.toLowerCase().includes(query) ||
      doc.company_name?.toLowerCase().includes(query) ||
      doc.report_year?.toString().includes(query)
    )
  })

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Add Documents from Library
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by filename, company, or year..."
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents available to add</p>
              <p className="text-sm mt-1">
                All library documents are already in this project
              </p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No documents match your search</p>
            </div>
          ) : (
            <>
              {/* Select All */}
              <div className="flex items-center gap-2 pb-2 border-b mb-2">
                <Checkbox
                  id="select-all"
                  checked={selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select All ({filteredDocuments.length} documents)
                </label>
              </div>

              {/* Document List */}
              <div className="flex-1 overflow-y-auto space-y-1">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedIds.has(doc.id)
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted border border-transparent'
                    }`}
                    onClick={() => handleToggle(doc.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={() => handleToggle(doc.id)}
                    />
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.filename}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {doc.company_name && <span>{doc.company_name}</span>}
                        {doc.report_year && <span>{doc.report_year}</span>}
                        {doc.report_type && <span>{doc.report_type}</span>}
                      </div>
                      {documentStatuses[doc.id] && (
                        <div className="flex items-center gap-2 mt-1">
                          {documentStatuses[doc.id].textAvailable ? (
                            <span className="flex items-center gap-0.5 text-[10px] text-brass">
                              <CheckCircle className="h-2.5 w-2.5" />
                              Text
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              No text
                            </span>
                          )}
                          {documentStatuses[doc.id].pdfAvailable ? (
                            <span className="flex items-center gap-0.5 text-[10px] text-brass">
                              <CheckCircle className="h-2.5 w-2.5" />
                              PDF
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[10px] text-destructive">
                              <FileQuestion className="h-2.5 w-2.5" />
                              No PDF
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedIds.has(doc.id) && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || adding}
          >
            {adding ? 'Adding...' : `Add ${selectedIds.size} Document${selectedIds.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
