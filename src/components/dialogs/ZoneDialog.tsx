/**
 * Leadership-zone editor (ADR-0032 manual override + ADR-0040 detection
 * quality surface).
 *
 * Shows the document's current zone state (overridden / detected / not
 * detected), lists the layout pass's detected headings, and lets the
 * researcher: mark a heading as the foreword opener (override zone runs
 * to the next heading), declare "no leadership zone" (an empty-range
 * override that beats a wrong detection), or clear the override and fall
 * back to detection. The override always wins over derivation.
 */

import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { listDocumentHeadings, type DocumentHeading } from '@/services/document-headings'
import { setZoneOverride } from '@/services/documents'
import { detectLeadershipZone } from '@/services/prominence'
import { toast } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import type { Document } from '@/types/data'

interface ZoneDialogProps {
  doc: Document
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after any successful change so the parent can refresh. */
  onSaved: () => void
}

export function ZoneDialog({ doc, open, onOpenChange, onSaved }: ZoneDialogProps) {
  const [headings, setHeadings] = useState<DocumentHeading[] | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const textLength = doc.extractedText?.length ?? 0

  useEffect(() => {
    if (!open) return
    setPicked(null)
    setBusy(false)
    listDocumentHeadings(doc.id).then(setHeadings)
  }, [open, doc.id])

  const detected = detectLeadershipZone(headings ?? [], textLength)
  const detectedHeading = detected && headings
    ? headings.find((h) => h.startOffset === detected.startOffset)
    : undefined

  const stateLabel = doc.zoneOverride
    ? 'Manual override active'
    : detected
      ? `Detected: ${detectedHeading?.text ?? detected.headingText}`
      : 'Not detected'

  const zoneEndFor = (index: number): number =>
    index + 1 < (headings?.length ?? 0) ? headings![index + 1].startOffset : textLength

  const apply = async (override: { startOffset: number; endOffset: number } | null, message: string) => {
    setBusy(true)
    try {
      await setZoneOverride(doc.id, override)
      toast.success(message)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(`Failed to set zone override: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Leadership voice zone
          </DialogTitle>
          <DialogDescription>
            {doc.title ?? doc.filename}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={cn(
              'text-sm rounded-md border px-3 py-2',
              doc.zoneOverride
                ? 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-200'
                : detected
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200'
                  : 'bg-muted/40 border-border text-muted-foreground'
            )}
          >
            <span className="font-medium">{stateLabel}</span>
            {detected && !doc.zoneOverride && (
              <span className="block text-xs mt-0.5">
                Zone: offsets {detected.startOffset}–{detected.endOffset}
              </span>
            )}
            {doc.zoneOverride && (
              <span className="block text-xs mt-0.5">
                Zone: offsets {doc.zoneOverride.startOffset}–{doc.zoneOverride.endOffset} — beats detection until cleared
              </span>
            )}
          </div>

          {headings === null ? (
            <div className="text-sm text-muted-foreground">Loading detected headings…</div>
          ) : headings.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              The layout pass found no headings for this document. You can still
              declare that there is no leadership zone (all mentions count as Body),
              or re-run extraction once the document has detectable headings.
            </div>
          ) : (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                Detected headings — pick the foreword opener
              </div>
              <ul className="border border-border rounded-md divide-y divide-border max-h-56 overflow-y-auto">
                {headings.map((h, i) => (
                  <li key={`${h.startOffset}`}>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/40">
                      <input
                        type="radio"
                        name={`zone-heading-${doc.id}`}
                        checked={picked === i}
                        onChange={() => setPicked(i)}
                      />
                      <span className="flex-1 truncate" title={h.text}>{h.text}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        p.{h.pageNumber} · zone {h.startOffset}–{zoneEndFor(i)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {picked !== null && headings[picked] && (
                <div className="text-xs text-muted-foreground mt-1.5">
                  Override zone: {headings[picked].text} → offsets{' '}
                  {headings[picked].startOffset}–{zoneEndFor(picked)}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || picked === null}
                onClick={() =>
                  picked !== null &&
                  apply(
                    { startOffset: headings![picked].startOffset, endOffset: zoneEndFor(picked) },
                    `Leadership zone set from "${headings![picked].text}"`,
                  )
                }
              >
                Apply picked heading
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                title="All mentions count as Body — beats a wrong detection"
                onClick={() => apply({ startOffset: 0, endOffset: 0 }, 'Marked: no leadership zone')}
              >
                No leadership zone
              </Button>
            </div>
            {doc.zoneOverride && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => apply(null, 'Override cleared — falling back to detection')}
              >
                Use detection instead
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
