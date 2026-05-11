import { useEffect, useState } from 'react'
import { Upload, Library as LibraryIcon, FileText, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { listDocuments } from '@/services/documents'
import { importDocuments, type ImportProgress } from '@/services/import'
import { toast } from '@/stores/toastStore'
import type { Document } from '@/types/data'
import { cn } from '@/lib/utils'

export function Library() {
  const [docs, setDocs] = useState<Document[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const refresh = async () => {
    setDocs(await listDocuments())
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
          <Button onClick={handleImport} disabled={importing} className="gap-2">
            <Upload className="h-4 w-4" />
            {importing ? 'Importing…' : 'Import documents'}
          </Button>
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
        <DocumentTable documents={docs} onChange={refresh} />
      )}
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
}: {
  documents: Document[]
  onChange: () => void
}) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-4 py-2">Title</th>
            <th className="text-left font-medium px-4 py-2 w-20">Year</th>
            <th className="text-left font-medium px-4 py-2">Company</th>
            <th className="text-left font-medium px-4 py-2 w-32">Status</th>
            <th className="text-right font-medium px-4 py-2 w-24">Pages</th>
            <th className="text-right font-medium px-4 py-2 w-24">Words</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate" title={doc.filePath}>
                    {doc.title || doc.filename}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                {doc.year ?? <span className="italic">—</span>}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground truncate">
                {doc.company ?? <span className="italic">—</span>}
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
            </tr>
          ))}
        </tbody>
      </table>
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
