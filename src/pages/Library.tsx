import { useEffect, useState } from 'react'
import { Upload, Library as LibraryIcon, FileText, AlertCircle, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { listDocuments, updateDocumentAttributes, deleteDocument } from '@/services/documents'
import { importDocuments, type ImportProgress } from '@/services/import'
import { listIndustries } from '@/services/reference'
import { toast } from '@/stores/toastStore'
import type { Document } from '@/types/data'
import { cn } from '@/lib/utils'
import { InlineEditableCell } from '@/components/InlineEditableCell'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { BulkAttributesDialog } from '@/components/dialogs/BulkAttributesDialog'
import { selectOne } from '@/services/db'

export function Library() {
  const [docs, setDocs] = useState<Document[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [sectorSuggestions, setSectorSuggestions] = useState<string[]>([])
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)

  useEffect(() => {
    refresh()
    listIndustries().then((rows) => setSectorSuggestions(rows.map((r) => r.name)))
  }, [])

  const refresh = async () => {
    const fresh = await listDocuments()
    setDocs(fresh)
    // Build company suggestions from the existing corpus so the user
    // gets consistency without a maintained reference list (companies
    // come from filenames + content inference; the right values are
    // whatever's already been imported).
    const companies = Array.from(
      new Set(fresh.map((d) => d.company).filter((c): c is string => Boolean(c)))
    ).sort((a, b) => a.localeCompare(b))
    setCompanySuggestions(companies)
  }

  const handleImport = async () => {
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
    setProgress(null)
    try {
      const result = await importDocuments(dialog.filePaths, setProgress)
      await refresh()
      const parts: string[] = []
      if (result.completed > 0) parts.push(`${result.completed} imported`)
      if (result.duplicates > 0) parts.push(`${result.duplicates} duplicate`)
      if (result.failed > 0) parts.push(`${result.failed} failed`)
      toast.success(`Import finished: ${parts.join(' · ') || 'nothing to import'}`)
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  if (docs === null) {
    return <div className="px-8 py-10 text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <div className="px-8 py-10 max-w-6xl">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">Library</h1>
          <p className="text-muted-foreground italic mt-1">What documents do you have?</p>
        </div>
        {docs.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkOpen(true)}
              className="gap-2"
              title="Update year / company / sector on many docs at once from a CSV"
            >
              <Upload className="h-4 w-4" />
              Bulk attributes
            </Button>
            <Button onClick={handleImport} disabled={importing} className="gap-2">
              <Upload className="h-4 w-4" />
              {importing ? 'Importing…' : 'Import documents'}
            </Button>
          </div>
        )}
      </header>

      {progress && <ImportProgressBar progress={progress} />}

      {docs.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon className="h-12 w-12" />}
          title="Your Library is empty"
          description="Import PDFs, Word docs, PowerPoints, plain text, or Markdown files. Documents live globally — once imported, you can use them in any project."
          action={
            <Button onClick={handleImport} disabled={importing} className="gap-2">
              <Upload className="h-4 w-4" />
              {importing ? 'Importing…' : 'Import documents'}
            </Button>
          }
        />
      ) : (
        <DocumentTable
          documents={docs}
          onChange={() => { void refresh() }}
          sectorSuggestions={sectorSuggestions}
          companySuggestions={companySuggestions}
        />
      )}

      <BulkAttributesDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onApplied={() => void refresh()}
      />
    </div>
  )
}

function ImportProgressBar({ progress }: { progress: ImportProgress }) {
  const pct = Math.round((progress.current / progress.total) * 100)
  return (
    <div className="mb-6 border border-border rounded-md p-4 bg-muted/30">
      <div className="flex items-center justify-between text-sm mb-2">
        <span>
          <RefreshCw className="inline h-3.5 w-3.5 mr-2 animate-spin" />
          {progress.phase === 'hashing' && 'Hashing'}
          {progress.phase === 'extracting' && 'Extracting'}
          {progress.phase === 'completed' && 'Completed'}
          {progress.phase === 'duplicate' && 'Duplicate skipped'}
          {progress.phase === 'failed' && 'Failed'} · {progress.currentFile}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {progress.current} / {progress.total}
        </span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function DocumentTable({
  documents,
  onChange,
  sectorSuggestions,
  companySuggestions,
}: {
  documents: Document[]
  onChange: () => void
  sectorSuggestions: string[]
  companySuggestions: string[]
}) {
  const [pendingDelete, setPendingDelete] = useState<{
    doc: Document
    projectCount: number
  } | null>(null)

  const handleEdit = async (
    id: string,
    field: 'title' | 'year' | 'company' | 'sector',
    raw: string | null
  ) => {
    let patch: Record<string, string | number | null> = {}
    if (field === 'year') {
      patch = { year: raw === null ? null : Number(raw) }
    } else {
      patch = { [field]: raw }
    }
    await updateDocumentAttributes(id, patch)
    onChange()
  }

  const handleAskDelete = async (doc: Document) => {
    // Surface how many projects this document is in so the user knows
    // the blast radius before confirming. project_documents has ON DELETE
    // CASCADE so the rows go away with the document.
    const row = await selectOne<{ n: number }>(
      'SELECT COUNT(*) AS n FROM project_documents WHERE document_id = ?',
      [doc.id]
    )
    setPendingDelete({ doc, projectCount: row?.n ?? 0 })
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    await deleteDocument(pendingDelete.doc.id)
    toast.success(`Deleted "${pendingDelete.doc.title ?? pendingDelete.doc.filename}"`)
    setPendingDelete(null)
    onChange()
  }

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2">Title</th>
            <th className="text-left font-medium px-4 py-2 w-24">Year</th>
            <th className="text-left font-medium px-4 py-2 w-44">Company</th>
            <th className="text-left font-medium px-4 py-2 w-36">Sector</th>
            <th className="text-left font-medium px-4 py-2 w-32">Status</th>
            <th className="text-right font-medium px-4 py-2 w-20">Pages</th>
            <th className="text-right font-medium px-4 py-2 w-24">Words</th>
            <th className="font-medium px-2 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <InlineEditableCell
                      value={doc.title}
                      onCommit={(next) => handleEdit(doc.id, 'title', next)}
                      width={260}
                      formatDisplay={(v) => (
                        <span className="truncate block" title={doc.filePath}>
                          {v ?? doc.filename}
                        </span>
                      )}
                    />
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                <InlineEditableCell
                  value={doc.year}
                  numeric
                  onCommit={(next) => handleEdit(doc.id, 'year', next)}
                  width={70}
                  className="tabular-nums"
                  placeholder="—"
                />
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                <InlineEditableCell
                  value={doc.company}
                  onCommit={(next) => handleEdit(doc.id, 'company', next)}
                  width={160}
                  placeholder="Add company"
                  suggestions={companySuggestions}
                />
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                <InlineEditableCell
                  value={doc.sector}
                  onCommit={(next) => handleEdit(doc.id, 'sector', next)}
                  width={120}
                  placeholder="Add sector"
                  suggestions={sectorSuggestions}
                />
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge doc={doc} />
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                {doc.pageCount ?? '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">
                {doc.wordCount ? doc.wordCount.toLocaleString() : '—'}
              </td>
              <td className="px-2 py-2.5">
                <button
                  type="button"
                  onClick={() => handleAskDelete(doc)}
                  className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                  title="Delete from Library"
                  aria-label={`Delete ${doc.title ?? doc.filename}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Delete "${pendingDelete?.doc.title ?? pendingDelete?.doc.filename ?? ''}"?`}
        description={
          <>
            Removes the document from your Library, including its extracted
            text and metadata. The original file on disk is{' '}
            <strong>not</strong> deleted.
            {pendingDelete && pendingDelete.projectCount > 0 && (
              <>
                {' '}This document is currently in{' '}
                <strong>{pendingDelete.projectCount} project{pendingDelete.projectCount === 1 ? '' : 's'}</strong>;
                it will be removed from those too.
              </>
            )}
          </>
        }
        confirmLabel="Delete document"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

function StatusBadge({ doc }: { doc: Document }) {
  const cls = 'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full'
  switch (doc.status) {
    case 'pending':
      return <span className={cn(cls, 'bg-muted text-muted-foreground')}>Pending</span>
    case 'extracting':
      return (
        <span className={cn(cls, 'bg-yellow-50 text-yellow-700')}>
          <RefreshCw className="h-3 w-3 animate-spin" />
          Extracting
        </span>
      )
    case 'extracted':
      return <span className={cn(cls, 'bg-green-50 text-green-700')}>Ready</span>
    case 'failed':
      return (
        <span
          className={cn(cls, 'bg-red-50 text-red-700')}
          title={doc.statusError ?? undefined}
        >
          <AlertCircle className="h-3 w-3" />
          Failed
        </span>
      )
  }
}
