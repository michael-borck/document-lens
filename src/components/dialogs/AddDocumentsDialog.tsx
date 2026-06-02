import { useEffect, useState, useMemo } from 'react'
import { Search, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loading } from '@/components/Loading'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { listDocuments } from '@/services/documents'
import { addDocumentsToProject } from '@/services/projects'
import { importDocuments, type ImportProgress } from '@/services/import'
import { toast } from '@/stores/toastStore'
import type { Document } from '@/types/data'

interface AddDocumentsDialogProps {
  projectId: string
  alreadyAddedIds: Set<string>
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

export function AddDocumentsDialog({
  projectId,
  alreadyAddedIds,
  open,
  onOpenChange,
  onAdded,
}: AddDocumentsDialogProps) {
  const [allDocs, setAllDocs] = useState<Document[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(new Set())
    setSearch('')
    listDocuments().then((docs) => {
      setAllDocs(docs)
      setLoading(false)
    })
  }, [open])

  // Import fresh documents directly from the picker so the user doesn't
  // have to context-switch to Library when this project's slate is empty.
  // Newly imported docs are auto-selected so the user can confirm-add
  // with one more click.
  const handleImportNew = async () => {
    const electron = window.electron
    if (!electron) return

    const dialog = await electron.openFileDialog({
      title: 'Import documents',
      buttonLabel: 'Import',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'pptx', 'txt', 'md'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })
    if (dialog.canceled || dialog.filePaths.length === 0) return

    setImporting(true)
    setImportProgress(null)
    try {
      const result = await importDocuments(dialog.filePaths, setImportProgress)
      const fresh = await listDocuments()
      setAllDocs(fresh)

      // Auto-select successfully imported (and duplicate) docs so the
      // user just clicks "Add N" to confirm. Filter to ones not already
      // attached to this project — duplicates may have been added before.
      const newIds = result.items
        .filter((it) => it.document && (it.phase === 'completed' || it.phase === 'duplicate'))
        .map((it) => it.document!.id)
        .filter((id) => !alreadyAddedIds.has(id))
      if (newIds.length > 0) {
        const next = new Set(selected)
        for (const id of newIds) next.add(id)
        setSelected(next)
      }

      const parts: string[] = []
      if (result.completed > 0) parts.push(`${result.completed} imported`)
      if (result.duplicates > 0) parts.push(`${result.duplicates} duplicate`)
      if (result.failed > 0) parts.push(`${result.failed} failed`)
      toast.success(`Import finished: ${parts.join(' · ') || 'nothing to import'}`)
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const availableDocs = useMemo(
    () => allDocs.filter((d) => !alreadyAddedIds.has(d.id)),
    [allDocs, alreadyAddedIds]
  )

  const filteredDocs = useMemo(() => {
    if (!search.trim()) return availableDocs
    const q = search.toLowerCase()
    return availableDocs.filter(
      (d) =>
        d.filename.toLowerCase().includes(q) ||
        d.title?.toLowerCase().includes(q) ||
        d.company?.toLowerCase().includes(q)
    )
  }, [availableDocs, search])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleAdd = async () => {
    if (selected.size === 0) return
    setAdding(true)
    try {
      await addDocumentsToProject(projectId, Array.from(selected))
      onAdded()
      onOpenChange(false)
    } catch (err) {
      toast.error(`Could not add documents: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add documents from Library</DialogTitle>
          <DialogDescription>
            Pick documents to add to this project. They stay in the Library
            and can be used in other projects too.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, filename, or company"
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleImportNew}
              disabled={importing || adding}
              className="gap-2 shrink-0"
              title="Import new files into the Library and add them to this project"
            >
              <Upload className="h-4 w-4" />
              {importing ? 'Importing…' : 'Import new…'}
            </Button>
          </div>

          {importProgress && (
            <div className="mb-3 text-xs text-muted-foreground border border-border rounded-md px-3 py-2">
              {importProgress.phase} · {importProgress.current}/{importProgress.total} ·{' '}
              <span className="font-mono truncate">{importProgress.currentFile}</span>
            </div>
          )}

          <div className="border border-border rounded-md max-h-80 overflow-auto">
            {loading ? (
              <Loading label="Loading documents…" className="py-6" />
            ) : availableDocs.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                {allDocs.length === 0
                  ? 'Your Library is empty. Use “Import new…” above to add files.'
                  : 'All Library documents are already in this project. Use “Import new…” to add more.'}
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No matches.</div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredDocs.map((doc) => (
                  <li key={doc.id}>
                    <label className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                      <Checkbox
                        checked={selected.has(doc.id)}
                        onCheckedChange={() => toggle(doc.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {doc.title || doc.filename}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[doc.year, doc.company, doc.sector]
                            .filter(Boolean)
                            .join(' · ') || doc.filename}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            {selected.size} selected
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adding}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={selected.size === 0 || adding}
          >
            {adding ? 'Adding…' : `Add ${selected.size || ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
