/**
 * Import bundle dialog (Phase 6 #19).
 *
 * Two-stage flow: read manifest + preview, show plan + warnings, then
 * apply on user confirm. Driven from the Projects page.
 */

import { useState } from 'react'
import { Loader2, Package, AlertTriangle, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  readBundlePreview,
  applyBundle,
  type BundlePreview,
  type ImportProgress,
} from '@/services/bundle-project-import'
import { toast } from '@/stores/toastStore'
import type { Project } from '@/types/data'

interface ImportBundleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (project: Project) => void
  /** Path to the .lens file the user picked. The picker fires from the
   *  Projects page; the dialog opens once a path is in hand. */
  bundlePath: string | null
}

export function ImportBundleDialog({
  open,
  onOpenChange,
  onImported,
  bundlePath,
}: ImportBundleDialogProps) {
  const [stage, setStage] = useState<'loading' | 'preview' | 'applying' | 'error'>('loading')
  const [preview, setPreview] = useState<BundlePreview | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load preview when the dialog opens with a path.
  // (Not using useEffect-with-cleanup because the dialog tears down
  // on close; stale preview would just be discarded.)
  if (open && bundlePath && stage === 'loading' && !preview && !error) {
    readBundlePreview(bundlePath)
      .then((p) => {
        setPreview(p)
        setStage('preview')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setStage('error')
      })
  }

  const reset = () => {
    setStage('loading')
    setPreview(null)
    setProgress(null)
    setError(null)
  }

  const handleClose = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleApply = async () => {
    if (!bundlePath) return
    setStage('applying')
    setProgress(null)
    try {
      const result = await applyBundle(bundlePath, setProgress)
      const parts: string[] = []
      if (result.newDocumentCount > 0) parts.push(`${result.newDocumentCount} doc${result.newDocumentCount === 1 ? '' : 's'} imported`)
      if (result.reusedDocumentCount > 0) parts.push(`${result.reusedDocumentCount} reused`)
      toast.success(`Imported "${result.project.name}"${parts.length ? ` (${parts.join(' · ')})` : ''}`)
      onImported(result.project)
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStage('error')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Import project bundle
          </DialogTitle>
          <DialogDescription>
            {stage === 'loading' && 'Reading bundle manifest…'}
            {stage === 'preview' && preview && (
              <>From <code className="bg-muted px-1 rounded text-xs">{bundlePath}</code></>
            )}
            {stage === 'applying' && 'Importing…'}
            {stage === 'error' && 'Could not import bundle'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px] py-2">
          {stage === 'loading' && <Loading />}
          {stage === 'preview' && preview && <PreviewView preview={preview} />}
          {stage === 'applying' && <ApplyingView progress={progress} />}
          {stage === 'error' && <ErrorView message={error ?? 'Unknown error'} />}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={stage === 'applying'}
          >
            {stage === 'preview' ? 'Cancel' : 'Close'}
          </Button>
          {stage === 'preview' && (
            <Button type="button" onClick={handleApply} className="gap-1.5">
              <Check className="h-4 w-4" />
              Import as new project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground gap-2 py-12">
      <Loader2 className="h-4 w-4 animate-spin" />
      Reading bundle…
    </div>
  )
}

function PreviewView({ preview }: { preview: BundlePreview }) {
  const { manifest, project, plan, warnings } = preview
  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Project</div>
        <div className="font-medium">{project.name}</div>
        {project.description && (
          <div className="text-xs text-muted-foreground">{project.description}</div>
        )}
        <div className="text-[11px] text-muted-foreground tabular-nums">
          Exported {new Date(manifest.exportedAt).toLocaleString()} from app v{manifest.exporterAppVersion}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <PlanRow label="Documents" newCount={plan.newDocuments} reusedCount={plan.reusedDocuments} />
        <PlanRow label="Keyword lists" newCount={plan.newKeywordLists} reusedCount={plan.reusedKeywordLists} />
        <PlanRow label="Axes" newCount={plan.newAxes} reusedCount={plan.reusedAxes} />
        <PlanRow label="Scoring rules" newCount={plan.newScoringRules} reusedCount={plan.reusedScoringRules} />
      </div>

      <div className="text-[11px] text-muted-foreground">
        Documents are matched by file hash — duplicates of files already in your Library are reused, not re-imported.
        Built-in axes (SDG / Pillar / Function) and the seeded SDG keyword list are matched by name and reused.
      </div>

      {warnings.length > 0 && (
        <div className="border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 space-y-1.5">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-700 dark:text-yellow-400 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        A new project will be created.{' '}
        {manifest.filesIncluded
          ? `Source files (${formatBytes(manifest.filesBytes)}) will be saved to your app data folder.`
          : 'No source files in this bundle — text-only analysis.'}
      </div>
    </div>
  )
}

function PlanRow({ label, newCount, reusedCount }: { label: string; newCount: number; reusedCount: number }) {
  return (
    <div className="border border-border rounded-md p-2 flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">
        {newCount > 0 && <span className="font-medium">{newCount} new</span>}
        {newCount > 0 && reusedCount > 0 && <span className="text-muted-foreground"> · </span>}
        {reusedCount > 0 && <span className="text-muted-foreground">{reusedCount} reused</span>}
        {newCount === 0 && reusedCount === 0 && <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  )
}

function ApplyingView({ progress }: { progress: ImportProgress | null }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <div className="text-sm text-center">
        {progress ? (
          <>
            <div>{progress.phase}</div>
            <div className="text-xs text-muted-foreground mt-1 tabular-nums">
              {progress.current} / {progress.total} · {progress.message}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">Importing…</span>
        )}
      </div>
    </div>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 border border-destructive/30 rounded-md text-sm text-destructive">
      <X className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
