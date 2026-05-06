/**
 * DocumentFilter Component
 *
 * Quick filter dropdown for selecting which documents to include in analysis.
 * Supports "All Documents" or selecting specific documents.
 */

import { useState, useEffect } from 'react'
import { Filter, FileText, Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { DocumentRecord } from '@/services/documents'

interface DocumentFilterProps {
  documents: DocumentRecord[]
  selectedIds: string[] | null // null means "all documents"
  onChange: (selectedIds: string[] | null) => void
}

export function DocumentFilter({
  documents,
  selectedIds,
  onChange,
}: DocumentFilterProps) {
  const [open, setOpen] = useState(false)
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set())

  // Sync local selection when dialog opens
  useEffect(() => {
    if (open) {
      if (selectedIds === null) {
        setLocalSelection(new Set(documents.map((d) => d.id)))
      } else {
        setLocalSelection(new Set(selectedIds))
      }
    }
  }, [open, selectedIds, documents])

  const isAllSelected = selectedIds === null
  const selectedCount = selectedIds?.length ?? documents.length

  const handleToggleDocument = (docId: string) => {
    const newSelection = new Set(localSelection)
    if (newSelection.has(docId)) {
      newSelection.delete(docId)
    } else {
      newSelection.add(docId)
    }
    setLocalSelection(newSelection)
  }

  const handleApply = () => {
    if (localSelection.size === documents.length) {
      onChange(null) // All selected = null
    } else if (localSelection.size === 0) {
      onChange([]) // None selected
    } else {
      onChange(Array.from(localSelection))
    }
    setOpen(false)
  }

  const handleSelectNone = () => {
    setLocalSelection(new Set())
  }

  const handleSelectAll = () => {
    setLocalSelection(new Set(documents.map((d) => d.id)))
  }

  const handleQuickAll = () => {
    onChange(null)
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Filter className="h-4 w-4" />
        {isAllSelected ? (
          <span>All Documents ({documents.length})</span>
        ) : selectedCount === 0 ? (
          <span className="text-muted-foreground">No Documents Selected</span>
        ) : (
          <span>{selectedCount} of {documents.length} Documents</span>
        )}
        <ChevronDown className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filter Documents</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select which documents to include in the analysis
            </p>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectNone}
              >
                Select None
              </Button>
            </div>

            {/* Document List */}
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              {documents.map((doc) => (
                <label
                  key={doc.id}
                  className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer border-b last:border-b-0"
                >
                  <Checkbox
                    checked={localSelection.has(doc.id)}
                    onCheckedChange={() => handleToggleDocument(doc.id)}
                  />
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{doc.filename}</div>
                    {(doc.company_name || doc.report_year) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {doc.company_name}
                        {doc.company_name && doc.report_year && ' - '}
                        {doc.report_year}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="text-sm text-muted-foreground">
              {localSelection.size} of {documents.length} documents selected
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              Apply Filter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
