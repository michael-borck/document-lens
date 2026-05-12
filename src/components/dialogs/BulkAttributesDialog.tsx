import { useState } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { listDocuments, updateDocumentAttributes } from '@/services/documents'
import { parseCsv } from '@/services/csv'
import { toast } from '@/stores/toastStore'

/**
 * Bulk attribute correction (US-X-07).
 *
 * The user uploads a CSV with at minimum a `filename` column plus any
 * of `year`, `company`, `sector`. We match rows to Library documents
 * by filename (case-insensitive). Show a preview of matched /
 * unmatched / ambiguous rows before applying.
 */

interface BulkAttributesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplied: () => void
}

interface PreviewRow {
  filename: string
  year: number | null | undefined
  company: string | null | undefined
  sector: string | null | undefined
  documentId: string | null
  documentTitle: string | null
  status: 'matched' | 'unmatched' | 'ambiguous'
}

interface Preview {
  rows: PreviewRow[]
  totalRows: number
  matched: number
  unmatched: number
  ambiguous: number
  unknownColumns: string[]
}

export function BulkAttributesDialog({ open, onOpenChange, onApplied }: BulkAttributesDialogProps) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPreview(null)
    setError(null)
    setApplying(false)
  }

  const handleFile = async (file: File) => {
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length === 0) {
        setError('Empty CSV file.')
        return
      }
      const header = rows[0].map((c) => c.trim().toLowerCase())
      const filenameIdx = header.indexOf('filename')
      if (filenameIdx < 0) {
        setError('CSV must have a "filename" column.')
        return
      }
      const yearIdx = header.indexOf('year')
      const companyIdx = header.indexOf('company')
      const sectorIdx = header.indexOf('sector')

      const knownCols = new Set(['filename', 'year', 'company', 'sector'])
      const unknown = header.filter((h) => h && !knownCols.has(h))

      // Load Library docs once, group by lowercase filename for fast lookup.
      const allDocs = await listDocuments()
      const byFilename = new Map<string, Array<{ id: string; title: string | null; filename: string }>>()
      for (const doc of allDocs) {
        const key = doc.filename.toLowerCase()
        const list = byFilename.get(key) ?? []
        list.push({ id: doc.id, title: doc.title, filename: doc.filename })
        byFilename.set(key, list)
      }

      const previewRows: PreviewRow[] = []
      let matched = 0
      let unmatched = 0
      let ambiguous = 0

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const filename = (row[filenameIdx] ?? '').trim()
        if (!filename) continue   // skip empty rows
        const yearRaw = yearIdx >= 0 ? (row[yearIdx] ?? '').trim() : undefined
        const companyRaw = companyIdx >= 0 ? (row[companyIdx] ?? '').trim() : undefined
        const sectorRaw = sectorIdx >= 0 ? (row[sectorIdx] ?? '').trim() : undefined

        const matches = byFilename.get(filename.toLowerCase()) ?? []

        let status: PreviewRow['status'] = 'unmatched'
        let documentId: string | null = null
        let documentTitle: string | null = null
        if (matches.length === 1) {
          status = 'matched'
          documentId = matches[0].id
          documentTitle = matches[0].title
          matched++
        } else if (matches.length > 1) {
          status = 'ambiguous'
          ambiguous++
        } else {
          unmatched++
        }

        const yearParsed = yearRaw === '' || yearRaw === undefined
          ? undefined
          : Number.isFinite(Number(yearRaw))
            ? Math.trunc(Number(yearRaw))
            : null
        previewRows.push({
          filename,
          year: yearParsed,
          company: companyRaw === '' ? null : companyRaw,
          sector: sectorRaw === '' ? null : sectorRaw,
          documentId,
          documentTitle,
          status,
        })
      }

      setPreview({
        rows: previewRows,
        totalRows: previewRows.length,
        matched,
        unmatched,
        ambiguous,
        unknownColumns: unknown,
      })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleApply = async () => {
    if (!preview) return
    setApplying(true)
    let updated = 0
    let failed = 0
    try {
      for (const row of preview.rows) {
        if (row.status !== 'matched' || !row.documentId) continue
        const patch: { year?: number | null; company?: string | null; sector?: string | null } = {}
        if (row.year !== undefined) patch.year = row.year === null ? null : row.year
        if (row.company !== undefined) patch.company = row.company
        if (row.sector !== undefined) patch.sector = row.sector
        try {
          await updateDocumentAttributes(row.documentId, patch)
          updated++
        } catch {
          failed++
        }
      }
      toast.success(
        `Updated ${updated} document${updated === 1 ? '' : 's'}` +
        (failed > 0 ? ` (${failed} failed)` : '')
      )
      onApplied()
      onOpenChange(false)
      reset()
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk attribute correction</DialogTitle>
          <DialogDescription>
            Upload a CSV with a <code>filename</code> column plus any of{' '}
            <code>year</code> / <code>company</code> / <code>sector</code>. Rows are matched against
            your Library by filename (case-insensitive). Empty cells are ignored; provide only
            the columns you want to update.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {!preview ? (
            <FileDrop onFile={handleFile} />
          ) : (
            <PreviewView preview={preview} />
          )}

          {error && (
            <div className="text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          {preview && (
            <>
              <Button variant="outline" onClick={reset} disabled={applying}>
                Re-upload
              </Button>
              <Button onClick={handleApply} disabled={applying || preview.matched === 0}>
                {applying ? 'Applying…' : `Apply ${preview.matched} update${preview.matched === 1 ? '' : 's'}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FileDrop({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="block border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors">
      <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
      <div className="mt-3 text-sm">
        <strong>Click to pick a CSV file</strong>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        e.g. <code>filename,year,company,sector</code>
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
    </label>
  )
}

function PreviewView({ preview }: { preview: Preview }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1 text-green-700">
          <CheckCircle2 className="h-4 w-4" /> {preview.matched} matched
        </span>
        {preview.unmatched > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <AlertCircle className="h-4 w-4" /> {preview.unmatched} unmatched
          </span>
        )}
        {preview.ambiguous > 0 && (
          <span className="inline-flex items-center gap-1 text-yellow-700">
            <AlertCircle className="h-4 w-4" /> {preview.ambiguous} ambiguous
          </span>
        )}
      </div>

      {preview.unknownColumns.length > 0 && (
        <div className="text-xs text-muted-foreground italic">
          Ignored columns: {preview.unknownColumns.join(', ')}
        </div>
      )}

      <div className="border border-border rounded-md max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium w-6"></th>
              <th className="text-left px-3 py-1.5 font-medium">Filename</th>
              <th className="text-left px-3 py-1.5 font-medium w-16">Year</th>
              <th className="text-left px-3 py-1.5 font-medium">Company</th>
              <th className="text-left px-3 py-1.5 font-medium">Sector</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.rows.map((row, i) => (
              <tr key={i} className={row.status === 'unmatched' ? 'opacity-50' : ''}>
                <td className="px-3 py-1">
                  {row.status === 'matched' && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                  {row.status === 'unmatched' && <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                  {row.status === 'ambiguous' && <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />}
                </td>
                <td className="px-3 py-1 flex items-center gap-1.5">
                  <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{row.filename}</span>
                </td>
                <td className="px-3 py-1 tabular-nums">{row.year ?? ''}</td>
                <td className="px-3 py-1 truncate">{row.company ?? ''}</td>
                <td className="px-3 py-1 truncate">{row.sector ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Only <strong>matched</strong> rows will be applied. Unmatched filenames are skipped;
        ambiguous matches (same filename in multiple Library entries) are also skipped to avoid
        guessing.
      </p>
    </div>
  )
}
