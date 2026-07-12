import { useEffect, useMemo, useState } from 'react'
import { Upload, FolderOpen, Library as LibraryIcon, FileText, AlertCircle, RefreshCw, Trash2, RotateCcw, Search, ArrowUp, ArrowDown, X, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { Loading } from '@/components/Loading'
import { listDocuments, updateDocumentAttributes, deleteDocument, type UpdateDocumentAttributesInput } from '@/services/documents'
import { countImagesByDocuments } from '@/services/document-images'
import { ImageGalleryModal } from '@/components/images/ImageGalleryModal'
import { importDocuments, retryExtraction, type ImportProgress } from '@/services/import'
import { listIndustries } from '@/services/reference'
import { toast } from '@/stores/toastStore'
import type { Document } from '@/types/data'
import { filterAndSortDocuments, type SortKey, type SortDir } from '@/services/library-sort'
import { cn } from '@/lib/utils'
import { InlineEditableCell } from '@/components/InlineEditableCell'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { BulkAttributesDialog } from '@/components/dialogs/BulkAttributesDialog'
import { selectOne } from '@/services/db'

// The document types the backend's content inference can assign. Seeded as
// suggestions so a fresh library offers sensible options; the field is
// free-text, so users can add their own (e.g. "Strategic Report").
const KNOWN_DOCUMENT_TYPES = [
  'Annual Report',
  'Sustainability Report',
  'Integrated Report',
  'CSR Report',
  'Climate Report',
]

// Coarse company-size buckets — a manual faceting dimension. Fixed set so the
// values stay consistent enough to group/compare on.
const COMPANY_SIZES = ['Small', 'Medium', 'Large']

// The bulk editor can set these document fields. Sort keys + the comparator
// live in `@/services/library-sort` so they can be unit-tested (US-X-16).
type BulkField = 'type' | 'sector' | 'company' | 'companySize' | 'year'

/** A clickable, sort-aware table header cell. */
function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: SortDir } | null
  onSort: (key: SortKey) => void
  className?: string
  align?: 'left' | 'right'
}) {
  const active = sort?.key === sortKey
  return (
    <th
      className={cn(
        'font-medium px-4 py-2 select-none cursor-pointer hover:text-foreground',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        {active && (sort!.dir === 'asc'
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}

export function Library() {
  const [docs, setDocs] = useState<Document[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [sectorSuggestions, setSectorSuggestions] = useState<string[]>([])
  const [companySuggestions, setCompanySuggestions] = useState<string[]>([])
  const [typeSuggestions, setTypeSuggestions] = useState<string[]>([])
  const [imageCounts, setImageCounts] = useState<Map<string, number>>(new Map())
  const [bulkOpen, setBulkOpen] = useState(false)

  useEffect(() => {
    refresh()
    listIndustries().then((rows) => setSectorSuggestions(rows.map((r) => r.name)))
  }, [])

  const refresh = async () => {
    const fresh = await listDocuments()
    setDocs(fresh)
    setImageCounts(await countImagesByDocuments(fresh.map((d) => d.id)))
    // Build company suggestions from the existing corpus so the user
    // gets consistency without a maintained reference list (companies
    // come from filenames + content inference; the right values are
    // whatever's already been imported).
    const companies = Array.from(
      new Set(fresh.map((d) => d.company).filter((c): c is string => Boolean(c)))
    ).sort((a, b) => a.localeCompare(b))
    setCompanySuggestions(companies)
    // Type suggestions: the backend's inferred vocabulary seeded up front (so a
    // fresh library still offers sensible options) plus whatever's already in
    // the corpus — free-text, but consistent enough to group/filter on.
    const types = Array.from(
      new Set([...KNOWN_DOCUMENT_TYPES, ...fresh.map((d) => d.type).filter((t): t is string => Boolean(t))])
    ).sort((a, b) => a.localeCompare(b))
    setTypeSuggestions(types)
  }

  // Shared import runner for both the file picker and the folder picker.
  const runImport = async (filePaths: string[]) => {
    setImporting(true)
    setProgress(null)
    try {
      const result = await importDocuments(filePaths, setProgress)
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
    await runImport(dialog.filePaths)
  }

  // Recursively import every supported document under one or more folders.
  const handleImportFolder = async () => {
    const electron = window.electron
    if (!electron) return

    const result = await electron.openFolderDialog({
      title: 'Import a folder of documents',
      buttonLabel: 'Import folder',
    })

    if (result.canceled) return
    if (result.filePaths.length === 0) {
      toast.error('No importable documents found in that folder (looked for PDF, DOCX, PPTX, TXT, MD).')
      return
    }
    if (result.truncated) {
      toast.info(`Found a lot of files — importing the first ${result.filePaths.length}. Re-run on subfolders to get the rest.`)
    }
    await runImport(result.filePaths)
  }

  if (docs === null) {
    return <Loading />
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
            <Button
              variant="outline"
              onClick={handleImportFolder}
              disabled={importing}
              className="gap-2"
              title="Recursively import every supported document in a folder"
            >
              <FolderOpen className="h-4 w-4" />
              Import folder
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
            <div className="flex items-center gap-2">
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                <Upload className="h-4 w-4" />
                {importing ? 'Importing…' : 'Import documents'}
              </Button>
              <Button
                variant="outline"
                onClick={handleImportFolder}
                disabled={importing}
                className="gap-2"
                title="Recursively import every supported document in a folder"
              >
                <FolderOpen className="h-4 w-4" />
                Import folder
              </Button>
            </div>
          }
        />
      ) : (
        <DocumentTable
          documents={docs}
          onChange={() => { void refresh() }}
          sectorSuggestions={sectorSuggestions}
          companySuggestions={companySuggestions}
          typeSuggestions={typeSuggestions}
          imageCounts={imageCounts}
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
  typeSuggestions,
  imageCounts,
}: {
  documents: Document[]
  onChange: () => void
  sectorSuggestions: string[]
  companySuggestions: string[]
  typeSuggestions: string[]
  imageCounts: Map<string, number>
}) {
  const [galleryDoc, setGalleryDoc] = useState<Document | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    doc: Document
    projectCount: number
  } | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkField, setBulkField] = useState<BulkField>('type')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Search filters, then sort orders. Default (sort === null) keeps the
  // incoming order (imported_at DESC) so the newest imports stay on top.
  const visible = useMemo(
    () => filterAndSortDocuments(documents, search, sort),
    [documents, search, sort]
  )

  // Keep the selection from referencing rows that are no longer visible or
  // no longer exist (after a filter change, delete, or refresh).
  const visibleIds = useMemo(() => new Set(visible.map((d) => d.id)), [visible])
  const selectedVisible = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds]
  )
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length

  const toggleSort = (key: SortKey) => {
    setSort((cur) =>
      cur?.key === key
        ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    )
  }

  const toggleOne = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (allVisibleSelected) visible.forEach((d) => next.delete(d.id))
      else visible.forEach((d) => next.add(d.id))
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const applyBulk = async () => {
    const ids = selectedVisible
    if (ids.length === 0) return
    const raw = bulkValue.trim()
    let patch: UpdateDocumentAttributesInput
    if (bulkField === 'year') {
      if (raw !== '' && !/^\d{4}$/.test(raw)) {
        toast.error('Year must be a 4-digit number (or blank to clear).')
        return
      }
      patch = { year: raw === '' ? null : Number(raw) }
    } else {
      patch = { [bulkField]: raw === '' ? null : raw }
    }
    setBulkBusy(true)
    try {
      for (const id of ids) await updateDocumentAttributes(id, patch)
      toast.success(`Updated ${bulkField} on ${ids.length} document${ids.length === 1 ? '' : 's'}`)
      setBulkValue('')
      clearSelection()
      onChange()
    } catch (err) {
      toast.error(`Bulk update failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleBulkDelete = async () => {
    const ids = selectedVisible
    setBulkDeleteOpen(false)
    if (ids.length === 0) return
    setBulkBusy(true)
    try {
      for (const id of ids) await deleteDocument(id)
      toast.success(`Deleted ${ids.length} document${ids.length === 1 ? '' : 's'}`)
      clearSelection()
      onChange()
    } catch (err) {
      toast.error(`Bulk delete failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkSuggestions =
    bulkField === 'type' ? typeSuggestions
    : bulkField === 'sector' ? sectorSuggestions
    : bulkField === 'company' ? companySuggestions
    : bulkField === 'companySize' ? COMPANY_SIZES
    : []

  const handleRetry = async (doc: Document) => {
    setRetryingId(doc.id)
    try {
      await retryExtraction(doc)
      toast.success(`Re-extracted "${doc.title ?? doc.filename}"`)
      onChange()
    } catch (err) {
      toast.error(`Re-extraction failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRetryingId(null)
    }
  }

  const handleEdit = async (
    id: string,
    field: 'title' | 'year' | 'company' | 'sector' | 'type' | 'companySize',
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
    //
    // NB: selectOne expects a *registered query key* (resolved server-side from
    // electron/queries.ts), not raw SQL. Passing raw SQL here threw silently and
    // prevented setPendingDelete from running — making the trash icon look broken.
    const row = await selectOne<{ n: number }>(
      'documents.countProjectsContaining',
      [doc.id]
    )
    setPendingDelete({ doc, projectCount: row?.n ?? 0 })
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deleteDocument(pendingDelete.doc.id)
    } catch (err) {
      toast.error(`Could not delete document: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    toast.success(`Deleted "${pendingDelete.doc.title ?? pendingDelete.doc.filename}"`)
    setPendingDelete(null)
    onChange()
  }

  return (
    <div>
      {/* Toolbar: search + result count */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, filename, company, sector, type…"
            className="w-full rounded-sm border border-border bg-background pl-8 pr-8 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {visible.length === documents.length
            ? `${documents.length} document${documents.length === 1 ? '' : 's'}`
            : `${visible.length} of ${documents.length}`}
        </span>
      </div>

      {/* Bulk-edit bar — shown while a selection exists */}
      {selectedVisible.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-md border border-border bg-muted/40 text-sm">
          <span className="font-medium">{selectedVisible.length} selected</span>
          <span className="text-muted-foreground">· set</span>
          <select
            value={bulkField}
            onChange={(e) => setBulkField(e.target.value as BulkField)}
            className="rounded-sm border border-border bg-background px-2 py-1 text-sm"
          >
            <option value="type">Type</option>
            <option value="sector">Sector</option>
            <option value="company">Company</option>
            <option value="companySize">Company size</option>
            <option value="year">Year</option>
          </select>
          <input
            list="bulk-suggestions"
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void applyBulk() }}
            placeholder={bulkField === 'year' ? 'e.g. 2024 — blank clears' : 'value — blank clears'}
            className="rounded-sm border border-border bg-background px-2 py-1 text-sm w-48"
          />
          <datalist id="bulk-suggestions">
            {bulkSuggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
          <Button size="sm" onClick={applyBulk} disabled={bulkBusy}>Apply</Button>
          <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)} disabled={bulkBusy}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} disabled={bulkBusy}>Clear</Button>
        </div>
      )}

      <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 w-8">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                className="align-middle"
              />
            </th>
            <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
            <SortableTh label="Year" sortKey="year" sort={sort} onSort={toggleSort} className="w-24" />
            <SortableTh label="Company" sortKey="company" sort={sort} onSort={toggleSort} className="w-44" />
            <SortableTh label="Sector" sortKey="sector" sort={sort} onSort={toggleSort} className="w-36" />
            <SortableTh label="Type" sortKey="type" sort={sort} onSort={toggleSort} className="w-40" />
            <SortableTh label="Size" sortKey="companySize" sort={sort} onSort={toggleSort} className="w-28" />
            <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="w-32" />
            <SortableTh label="Pages" sortKey="pageCount" sort={sort} onSort={toggleSort} className="w-20" align="right" />
            <SortableTh label="Words" sortKey="wordCount" sort={sort} onSort={toggleSort} className="w-24" align="right" />
            <th className="font-medium px-2 py-2 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {visible.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                No documents match “{search}”.
              </td>
            </tr>
          ) : visible.map((doc) => (
            <tr
              key={doc.id}
              className={cn('hover:bg-muted/30 transition-colors', selected.has(doc.id) && 'bg-muted/40')}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${doc.title ?? doc.filename}`}
                  checked={selected.has(doc.id)}
                  onChange={() => toggleOne(doc.id)}
                  className="align-middle"
                />
              </td>
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
              <td className="px-4 py-2 text-muted-foreground">
                <InlineEditableCell
                  value={doc.type}
                  onCommit={(next) => handleEdit(doc.id, 'type', next)}
                  width={150}
                  placeholder="Unknown"
                  suggestions={typeSuggestions}
                />
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                <InlineEditableCell
                  value={doc.companySize}
                  onCommit={(next) => handleEdit(doc.id, 'companySize', next)}
                  width={100}
                  placeholder="—"
                  suggestions={COMPANY_SIZES}
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
                <div className="flex items-center justify-end gap-0.5">
                  {(imageCounts.get(doc.id) ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setGalleryDoc(doc)}
                      className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                      title={`View ${imageCounts.get(doc.id)} image${imageCounts.get(doc.id) === 1 ? '' : 's'}`}
                      aria-label={`View images in ${doc.title ?? doc.filename}`}
                    >
                      <Images className="h-4 w-4" />
                    </button>
                  )}
                  {doc.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => handleRetry(doc)}
                      disabled={retryingId === doc.id}
                      className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors disabled:opacity-50"
                      title={`Retry extraction${doc.statusError ? ` (${doc.statusError})` : ''}`}
                      aria-label={`Retry extraction for ${doc.title ?? doc.filename}`}
                    >
                      <RotateCcw className={`h-4 w-4 ${retryingId === doc.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAskDelete(doc)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                    title="Delete from Library"
                    aria-label={`Delete ${doc.title ?? doc.filename}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

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

      {galleryDoc && (
        <ImageGalleryModal
          open={galleryDoc !== null}
          onOpenChange={(open) => { if (!open) setGalleryDoc(null) }}
          document={galleryDoc}
        />
      )}

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Delete ${selectedVisible.length} document${selectedVisible.length === 1 ? '' : 's'}?`}
        description={
          <>
            Removes the selected documents from your Library, including their
            extracted text and metadata. The original files on disk are{' '}
            <strong>not</strong> deleted. They'll also be removed from any
            projects that contain them.
          </>
        }
        confirmLabel="Delete selected"
        destructive
        onConfirm={handleBulkDelete}
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
