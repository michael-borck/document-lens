/**
 * First-run wizard (US-X-13 / Phase 6 #18).
 *
 * Three steps for the user's first project:
 *   1. Name + research focus (Sustainability default; Cybersecurity
 *      placeholder; Other = no defaults).
 *   2. Add documents — import new files or pick from the existing
 *      Library; can be skipped and done later from Setup.
 *   3. Confirm pre-loaded defaults (Sustainability only). One click
 *      attaches the seeded SDG keyword list, the three built-in lenses
 *      (SDG / Pillar / Function), and the Wedding Cake Score
 *      to the new project.
 *
 * Wizard is the primary "New project" path — used both on first launch
 * and for all subsequent projects from the Projects page header.
 */

import { useEffect, useState } from 'react'
import { Leaf, Shield, FileText, Upload, Library as LibraryIcon, ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  createProject,
  addDocumentsToProject,
  setProjectKeywordList,
  setProjectAxes,
  updateProject,
} from '@/services/projects'
import { listKeywordLists } from '@/services/keyword-lists'
import { listAxes } from '@/services/axes'
import { listScoringRules } from '@/services/scoring-rules'
import { listDocuments } from '@/services/documents'
import { importDocuments, type ImportProgress } from '@/services/import'
import { useBackendStatus } from '@/hooks/useBackendStatus'
import { toast } from '@/stores/toastStore'
import type { Project, Document } from '@/types/data'

type LensId = 'sustainability' | 'cybersecurity' | 'other'

interface LensOption {
  id: LensId
  name: string
  description: string
  icon: typeof Leaf
  disabled?: boolean
  badge?: string
}

const LENS_OPTIONS: LensOption[] = [
  {
    id: 'sustainability',
    name: 'Sustainability',
    description: 'ESG, SDGs, climate disclosure. Ships with the SDG keyword list, three axes (SDG, Pillar, Function), and the Wedding Cake Score pre-configured.',
    icon: Leaf,
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    description: 'NIST CSF, ISO 27001, threat frameworks. Defaults not yet bundled — coming in a later release.',
    icon: Shield,
    disabled: true,
    badge: 'Coming soon',
  },
  {
    id: 'other',
    name: 'General',
    description: 'No domain-specific defaults. Build your own axes, keyword lists, and scoring rule from scratch — or import a CSV.',
    icon: FileText,
  },
]

interface FirstRunWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (project: Project) => void
}

export function FirstRunWizard({ open, onOpenChange, onCreated }: FirstRunWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [lens, setLens] = useState<LensId>('sustainability')

  // Step 2 state — docs are tracked locally until the project is
  // created in step 3, then attached in one batch.
  const [allLibraryDocs, setAllLibraryDocs] = useState<Document[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load library docs when entering step 2.
  useEffect(() => {
    if (!open) return
    listDocuments().then(setAllLibraryDocs)
  }, [open])

  const reset = () => {
    setStep(1)
    setName('')
    setLens('sustainability')
    setSelectedDocIds(new Set())
    setImporting(false)
    setImportProgress(null)
    setCreating(false)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const toggleDoc = (id: string) => {
    const set = new Set(selectedDocIds)
    if (set.has(id)) set.delete(id); else set.add(id)
    setSelectedDocIds(set)
  }

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
      setAllLibraryDocs(fresh)
      // Auto-select successfully imported (and duplicate) docs.
      const newIds = result.items
        .filter((it) => it.document && (it.phase === 'completed' || it.phase === 'duplicate'))
        .map((it) => it.document!.id)
      const next = new Set(selectedDocIds)
      for (const id of newIds) next.add(id)
      setSelectedDocIds(next)
      const parts: string[] = []
      if (result.completed > 0) parts.push(`${result.completed} imported`)
      if (result.duplicates > 0) parts.push(`${result.duplicates} duplicate`)
      if (result.failed > 0) parts.push(`${result.failed} failed`)
      toast.success(`Import: ${parts.join(' · ') || 'nothing to import'}`)
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const handleFinish = async () => {
    if (!name.trim()) {
      setStep(1)
      return
    }
    setCreating(true)
    setError(null)
    try {
      // 1. Create the bare project row.
      const project = await createProject({
        name: name.trim(),
        lens,
      })

      // 2. Attach documents (if any picked).
      if (selectedDocIds.size > 0) {
        await addDocumentsToProject(project.id, Array.from(selectedDocIds))
      }

      // 3. Sustainability: auto-attach the seeded defaults.
      if (lens === 'sustainability') {
        await applySustainabilityDefaults(project.id)
      }

      onCreated(project)
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCreating(false)
    }
  }

  const canAdvance =
    step === 1 ? name.trim().length > 0 && !LENS_OPTIONS.find((o) => o.id === lens)?.disabled :
    true

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create your first project</DialogTitle>
          <DialogDescription>
            Three quick steps to get to a productive Setup tab. You can change
            anything later.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator current={step} />

        <div className="min-h-[260px] py-2">
          {step === 1 && (
            <Step1
              name={name}
              onNameChange={setName}
              lens={lens}
              onLensChange={setLens}
            />
          )}
          {step === 2 && (
            <Step2
              docs={allLibraryDocs}
              selected={selectedDocIds}
              onToggle={toggleDoc}
              onImportNew={handleImportNew}
              importing={importing}
              importProgress={importProgress}
            />
          )}
          {step === 3 && (
            <Step3
              lens={lens}
              selectedDocCount={selectedDocIds.size}
              projectName={name}
              error={error}
            />
          )}
        </div>

        <DialogFooter className="!justify-between sm:!justify-between">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}
              disabled={creating}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          ) : <div />}

          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={!canAdvance}
              className="gap-1.5"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleFinish}
              disabled={creating}
              className="gap-1.5"
            >
              {creating ? 'Creating…' : (
                <>
                  <Check className="h-4 w-4" />
                  {lens === 'sustainability' ? 'Use defaults + create' : 'Create project'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  const labels = ['Name + lens', 'Documents', 'Defaults']
  return (
    <ol className="flex items-center gap-2 text-xs">
      {labels.map((label, i) => {
        const num = (i + 1) as 1 | 2 | 3
        const isActive = current === num
        const isDone = current > num
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded-full border text-[11px] tabular-nums',
                isActive && 'bg-foreground text-background border-foreground',
                isDone && 'bg-muted border-border text-muted-foreground',
                !isActive && !isDone && 'border-border text-muted-foreground'
              )}
            >
              {isDone ? <Check className="h-3 w-3" /> : num}
            </span>
            <span className={cn(isActive ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
            {i < labels.length - 1 && <span className="text-muted-foreground mx-1">→</span>}
          </li>
        )
      })}
    </ol>
  )
}

function Step1({
  name,
  onNameChange,
  lens,
  onLensChange,
}: {
  name: string
  onNameChange: (v: string) => void
  lens: LensId
  onLensChange: (v: LensId) => void
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="wizard-project-name" className="text-sm font-medium">
          Project name
        </label>
        <Input
          id="wizard-project-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Australian Uni SDG Reports 2020-2025"
          autoFocus
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium mb-1">Research lens</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {LENS_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const selected = lens === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => !opt.disabled && onLensChange(opt.id)}
                disabled={opt.disabled}
                className={cn(
                  'text-left border rounded-md p-3 transition-colors',
                  selected && !opt.disabled && 'border-foreground bg-muted/40 ring-1 ring-foreground/30',
                  !selected && !opt.disabled && 'border-border hover:border-foreground/40 hover:bg-muted/30',
                  opt.disabled && 'border-border opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{opt.name}</span>
                  {opt.badge && (
                    <span className="ml-auto text-[10px] uppercase bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-snug">{opt.description}</p>
              </button>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

function Step2({
  docs,
  selected,
  onToggle,
  onImportNew,
  importing,
  importProgress,
}: {
  docs: Document[]
  selected: Set<string>
  onToggle: (id: string) => void
  onImportNew: () => void
  importing: boolean
  importProgress: ImportProgress | null
}) {
  // Import needs the analysis engine; the button enables itself (push
  // event, no refresh) the moment the engine reports ready.
  const backend = useBackendStatus()
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onImportNew}
          disabled={importing || !backend.ready}
          title={backend.disabledReason}
          className="gap-1.5"
        >
          <Upload className="h-4 w-4" />
          {importing ? 'Importing…' : backend.ready ? 'Import new documents…' : 'Import (engine starting…)'}
        </Button>
        <div className="text-xs text-muted-foreground">
          or pick from your existing Library below
        </div>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground tabular-nums">
          {selected.size} selected
        </div>
      </div>

      {importProgress && (
        <div className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2">
          {importProgress.phase} · {importProgress.current}/{importProgress.total} ·{' '}
          <span className="font-mono truncate">{importProgress.currentFile}</span>
        </div>
      )}

      <div className="border border-border rounded-md max-h-64 overflow-auto">
        {docs.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            <LibraryIcon className="inline h-4 w-4 mr-1.5 -mt-0.5" />
            Your Library is empty. Use “Import new documents…” above, or
            skip this step and add documents later from Setup.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((doc) => (
              <li key={doc.id}>
                <label className="flex items-start gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors">
                  <Checkbox
                    checked={selected.has(doc.id)}
                    onCheckedChange={() => onToggle(doc.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {doc.title || doc.filename}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[doc.year, doc.company, doc.sector].filter(Boolean).join(' · ') || doc.filename}
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Adding documents now is optional — you can add or remove them anytime from the Setup tab.
      </p>
    </div>
  )
}

function Step3({
  lens,
  selectedDocCount,
  projectName,
  error,
}: {
  lens: LensId
  selectedDocCount: number
  projectName: string
  error: string | null
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Project</div>
        <div className="text-sm font-medium">{projectName}</div>
        <div className="text-xs text-muted-foreground">
          {selectedDocCount > 0
            ? `${selectedDocCount} document${selectedDocCount === 1 ? '' : 's'} will be attached`
            : 'No documents attached yet — you can add them from Setup'}
        </div>
      </div>

      {lens === 'sustainability' ? (
        <div className="border border-border rounded-md p-3 bg-muted/30 space-y-3">
          <div className="text-sm font-medium">Sustainability defaults — ready to use</div>
          <DefaultRow
            label="Keyword list"
            value="SDGs (Universities)"
            sub="UN SDGs 1–17, ~430 positive keywords + counter-keywords curated from Australian university annual reports."
          />
          <DefaultRow
            label="Axes (3)"
            value="SDG · Pillar · Function"
            sub="SDG and Pillar tag each keyword. Function tags each document section automatically via embedding classification — required for the full Wedding Cake Score."
          />
          <DefaultRow
            label="Scoring rule"
            value="Wedding Cake Score"
            sub="Of four organisational Functions (Teaching, Research, Engagement, Operations), how many deliver all three Pillars (Biosphere, Society, Economy)?"
          />
          <p className="text-xs text-muted-foreground pt-1 border-t border-border">
            One click below attaches all three. You can swap any of them on the Setup tab afterwards.
          </p>
        </div>
      ) : (
        <div className="border border-dashed border-border rounded-md p-3 text-sm text-muted-foreground">
          You picked <strong>Other</strong>. The project will be created empty — head to Setup to pick or build a
          keyword list, choose axes, and define a scoring rule.
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive border border-destructive/30 rounded-md p-2 flex items-start gap-2">
          <X className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  )
}

function DefaultRow({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 items-start">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-0.5">{label}</div>
      <div>
        <div className="text-sm font-medium">{value}</div>
        <div className="text-xs text-muted-foreground leading-snug">{sub}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default attachment (Sustainability focus only)
// ---------------------------------------------------------------------------

/**
 * Look up the seeded SDG keyword list, the three built-in lenses, and
 * the Wedding Cake scoring rule, and attach them to the project.
 * Seed runs on every app launch and is idempotent, so by the time the
 * wizard finishes these all exist.
 */
async function applySustainabilityDefaults(projectId: string): Promise<void> {
  const [lists, axes, rules] = await Promise.all([
    listKeywordLists(),
    listAxes(),
    listScoringRules(),
  ])

  const sdgList = lists.find((l) => l.source === 'SDGs (Universities)')
  if (sdgList) {
    await setProjectKeywordList(projectId, sdgList.id)
  }

  const builtinAxes = axes.filter((a) => a.isBuiltin)
  if (builtinAxes.length > 0) {
    await setProjectAxes(projectId, builtinAxes.map((a) => a.id))
  }

  const weddingCake = rules.find((r) => r.name === 'Wedding Cake Score' || r.name === '5-level Wedding Cake Score')
  if (weddingCake) {
    await updateProject(projectId, { scoringRuleId: weddingCake.id })
  }
}
