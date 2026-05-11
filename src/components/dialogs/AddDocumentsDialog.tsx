import { useEffect, useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, filename, or company"
              className="pl-9"
            />
          </div>

          <div className="border border-border rounded-md max-h-80 overflow-auto">
            {loading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : availableDocs.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                {allDocs.length === 0
                  ? 'Your Library is empty. Import documents on the Library page first.'
                  : 'All Library documents are already in this project.'}
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
