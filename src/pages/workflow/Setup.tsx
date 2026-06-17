import { useEffect, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { FileText, Tag, Layers, Award, Plus, X, Sparkles, RefreshCw, Package, FileWarning, Link as LinkIcon, AlertTriangle, ArrowDown, Lock, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  setProjectKeywordList,
  setProjectLenses,
  updateProject,
  removeDocumentFromProject,
} from '@/services/projects'
import { listKeywordLists } from '@/services/keyword-lists'
import { listLenses } from '@/services/lenses'
import { listScoringRules } from '@/services/scoring-rules'
import { getDocument, isSourceMissing, relinkDocumentSource } from '@/services/documents'
import {
  classifyProjectFunctions,
  getClassificationStatus,
  type ClassifyDocumentProgress,
  type ClassificationStatus,
} from '@/services/classification'
import { toast } from '@/stores/toastStore'
import { AddDocumentsDialog } from '@/components/dialogs/AddDocumentsDialog'
import { exportProjectBundle } from '@/services/bundle-project-export'
import { exportAllData } from '@/services/export-all'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { KeywordList, Lens, ScoringRule, Document } from '@/types/data'

export function Setup() {
  const vm = useOutletContext<ProjectViewModel>()

  const [allLists, setAllLists] = useState<KeywordList[]>([])
  const [allLenses, setAllLenses] = useState<Lens[]>([])
  const [allRules, setAllRules] = useState<ScoringRule[]>([])

  useEffect(() => {
    Promise.all([
      listKeywordLists(),
      listLenses(),
      listScoringRules(),
    ]).then(([lists, lenses, rules]) => {
      setAllLists(lists)
      setAllLenses(lenses)
      setAllRules(rules)
    })
  }, [])

  const handleSelectKeywordList = async (listId: string) => {
    try {
      await setProjectKeywordList(vm.project.id, listId)
      await vm.refresh()
    } catch (err) {
      toast.error(`Could not set keyword list: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleToggleLens = async (lensId: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...vm.project.lensIds, lensId]))
      : vm.project.lensIds.filter((id) => id !== lensId)
    try {
      await setProjectLenses(vm.project.id, next)
      await vm.refresh()
    } catch (err) {
      toast.error(`Could not update lenses: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleSelectScoringRule = async (ruleId: string) => {
    try {
      await updateProject(vm.project.id, { scoringRuleId: ruleId })
      await vm.refresh()
    } catch (err) {
      toast.error(`Could not set scoring rule: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExportBundle = async () => {
    try {
      const result = await exportProjectBundle(vm.project)
      if ('cancelled' in result) return
      toast.success(`Exported bundle to ${result.filePath}`)
    } catch (err) {
      toast.error(`Bundle export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleExportData = async () => {
    if (!vm.keywordList) {
      toast.error('Pick a keyword list before exporting data.')
      return
    }
    const dirResult = await window.electron.openDirectoryDialog({
      title: 'Choose folder for CSV exports',
      buttonLabel: 'Export here',
    })
    if (dirResult.canceled || dirResult.filePaths.length === 0) return
    const dir = dirResult.filePaths[0]
    try {
      const files = await exportAllData({
        projectId: vm.project.id,
        keywordListId: vm.keywordList.id,
        scoringRule: vm.scoringRule,
      })
      const sep = dir.includes('\\') ? '\\' : '/'
      for (const file of files) {
        await window.electron.writeFile(`${dir}${sep}${file.filename}`, file.content)
      }
      toast.success(`Exported ${files.length} CSV files to ${dir}`)
    } catch (err) {
      toast.error(`Data export failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Scroll-to-section when arriving via a #classification hash (from Map/Score's
  // "Jump to Classification" buttons). Done in a small useEffect so the smooth
  // scroll fires after the sections have rendered.
  const location = useLocation()
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1)
      // Defer one tick so the target element is in the DOM.
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [location.hash])

  return (
    <div className="px-8 py-8 max-w-4xl">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">Setup</h1>
          <p className="text-muted-foreground italic mt-1">
            Assemble this project: documents, keywords, lenses, scoring rule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportData}
            className="gap-1.5"
            title="Export all analysis data as CSV files for independent validation"
          >
            <Download className="h-4 w-4" />
            Export data
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportBundle}
            className="gap-1.5"
            title="Export this project as a .lens bundle for sharing or archiving"
          >
            <Package className="h-4 w-4" />
            Export bundle
          </Button>
        </div>
      </header>

      {/* Surfaces incomplete-classification status near the top of the page so
          it's not buried inside section #4 of 5. Renders nothing when the
          project has no document-context lens (classification doesn't apply),
          no documents (nothing to classify), or all docs already classified. */}
      <ClassificationBanner vm={vm} />

      <div className="space-y-8">
        <DocumentsSection vm={vm} />
        <KeywordsSection
          allLists={allLists}
          activeListId={vm.keywordList?.id ?? null}
          onSelect={handleSelectKeywordList}
        />
        <LensesSection
          allLenses={allLenses}
          activeLensIds={new Set(vm.project.lensIds)}
          onToggle={handleToggleLens}
        />
        <ClassificationSection vm={vm} />
        <ScoringRuleSection
          allRules={allRules}
          activeRuleId={vm.scoringRule?.id ?? null}
          onSelect={handleSelectScoringRule}
          locked={vm.project.researchFocus === 'sustainability'}
        />
      </div>
    </div>
  )
}

/**
 * Banner shown above the Setup sections when Function classification is
 * incomplete. Companion to ClassificationSection (which lives in section 4
 * of 5 and is easy to scroll past). Both components independently fetch the
 * classification status — a single SQLite query each, faster than the
 * refactor needed to share state.
 */
function ClassificationBanner({ vm }: { vm: ProjectViewModel }) {
  const contextLenses = vm.lenses.filter((l) => l.type === 'document-context')
  const activeLensId = contextLenses[0]?.id ?? ''
  const [status, setStatus] = useState<ClassificationStatus | null>(null)

  useEffect(() => {
    if (!activeLensId || vm.documentCount === 0) {
      setStatus(null)
      return
    }
    getClassificationStatus(vm.project.id, activeLensId).then(setStatus)
  }, [vm.project.id, vm.documentCount, activeLensId])

  // Don't render when there's nothing actionable: no context lens, no docs,
  // status not loaded yet, or all docs already classified.
  if (!status || contextLenses.length === 0 || vm.documentCount === 0) return null
  if (status.classifiedDocuments === status.totalDocuments) return null

  const remaining = status.totalDocuments - status.classifiedDocuments
  const lensName = contextLenses[0]?.name ?? 'document-context'

  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 rounded-md p-4"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">
          Function classification incomplete
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <strong>{remaining}</strong> of <strong>{status.totalDocuments}</strong> document
          {status.totalDocuments === 1 ? '' : 's'} need classifying on the{' '}
          <strong>{lensName}</strong> lens before the <strong>Map</strong> two-axis matrix and the
          full <strong>Wedding Cake Score</strong> can compute.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        onClick={() => document.getElementById('classification')?.scrollIntoView({
          behavior: 'smooth', block: 'start',
        })}
      >
        <ArrowDown className="h-3.5 w-3.5" />
        Jump to Classification
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count?: string
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="text-muted-foreground">{icon}</div>
      <h2 className="font-display text-lg font-medium">{title}</h2>
      {count && <span className="text-sm text-muted-foreground">· {count}</span>}
    </div>
  )
}

function DocumentsSection({ vm }: { vm: ProjectViewModel }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])

  // Load the document objects for each id in the project. Lightweight per-id
  // lookups so the heavier listDocuments() doesn't run on the Setup tab.
  useEffect(() => {
    Promise.all(vm.project.documentIds.map((id) => getDocument(id))).then((rows) => {
      setDocs(rows.filter((d): d is Document => d !== null))
    })
  }, [vm.project.documentIds])

  const refreshDocs = async () => {
    const rows = await Promise.all(vm.project.documentIds.map((id) => getDocument(id)))
    setDocs(rows.filter((d): d is Document => d !== null))
  }

  const handleRemove = async (documentId: string) => {
    try {
      await removeDocumentFromProject(vm.project.id, documentId)
      await vm.refresh()
    } catch (err) {
      toast.error(`Could not remove document: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleLocate = async (doc: Document) => {
    const electron = window.electron
    if (!electron) return
    const dialog = await electron.openFileDialog({
      title: `Locate ${doc.filename}`,
      buttonLabel: 'Use this file',
      filters: [{ name: doc.filename.split('.').pop() ?? 'File', extensions: ['*'] }],
    })
    if (dialog.canceled || dialog.filePaths.length === 0) return
    const result = await relinkDocumentSource(doc.id, dialog.filePaths[0])
    if (result.ok) {
      toast.success(`Relinked "${doc.title || doc.filename}"`)
      await refreshDocs()
    } else if (result.reason === 'hash-mismatch') {
      toast.error(
        `That file's content doesn't match the original (different hash). ` +
        `Either it's a different file or it has been modified since export.`
      )
    } else {
      toast.error(`Couldn't relink: ${result.reason}`)
    }
  }

  const missingCount = docs.filter(isSourceMissing).length

  return (
    <section>
      <SectionHeader
        icon={<FileText className="h-5 w-5" />}
        title="Documents"
        count={`${vm.documentCount} attached`}
      />
      {missingCount > 0 && (
        <div className="mb-3 text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 flex items-start gap-2">
          <FileWarning className="h-4 w-4 text-yellow-700 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <strong>{missingCount} document{missingCount === 1 ? '' : 's'} missing source file{missingCount === 1 ? '' : 's'}.</strong>{' '}
            Likely arrived via bundle import without files. Analysis (Coverage, Score, Read, Audit) works
            from the cached extracted text, but Preview / Open in viewer is unavailable until you re-link
            the source. Click <em>Locate file…</em> on each row.
          </div>
        </div>
      )}
      <div className="border border-border rounded-md">
        {docs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No documents attached. Pick from the Library to start analysing.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((doc) => {
              const missing = isSourceMissing(doc)
              return (
                <li
                  key={doc.id}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
                >
                  <FileText className={`h-4 w-4 shrink-0 ${missing ? 'text-yellow-700 dark:text-yellow-400' : 'text-muted-foreground'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${missing ? 'text-muted-foreground' : ''}`}>
                      {doc.title || doc.filename}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">
                        {[doc.year, doc.company, doc.sector].filter(Boolean).join(' · ') || doc.filename}
                      </span>
                      {missing && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-yellow-700 dark:text-yellow-400 border border-yellow-500/40 rounded px-1 py-0.5">
                          <FileWarning className="h-2.5 w-2.5" />
                          Source missing
                        </span>
                      )}
                    </div>
                  </div>
                  {missing && (
                    <button
                      type="button"
                      onClick={() => handleLocate(doc)}
                      className="inline-flex items-center gap-1 text-xs text-foreground hover:bg-muted rounded px-2 py-1 transition-colors"
                      title="Pick the source file from disk to re-link it"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      Locate file…
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemove(doc.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    title="Remove from project"
                    aria-label="Remove from project"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="border-t border-border p-3">
          <Button
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add documents from Library
          </Button>
        </div>
      </div>
      <AddDocumentsDialog
        projectId={vm.project.id}
        alreadyAddedIds={new Set(vm.project.documentIds)}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdded={vm.refresh}
      />
    </section>
  )
}

function KeywordsSection({
  allLists,
  activeListId,
  onSelect,
}: {
  allLists: KeywordList[]
  activeListId: string | null
  onSelect: (id: string) => void
}) {
  const active = allLists.find((l) => l.id === activeListId)
  return (
    <section>
      <SectionHeader
        icon={<Tag className="h-5 w-5" />}
        title="Keywords"
        count={active ? active.name : 'None selected'}
      />
      <div className="border border-border rounded-md p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Select value={activeListId ?? ''} onValueChange={onSelect}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Pick a keyword list" />
            </SelectTrigger>
            <SelectContent>
              {allLists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {active && (
          <p className="text-xs text-muted-foreground">
            {active.description ?? 'No description.'}
          </p>
        )}
      </div>
    </section>
  )
}

function LensesSection({
  allLenses,
  activeLensIds,
  onToggle,
}: {
  allLenses: Lens[]
  activeLensIds: Set<string>
  onToggle: (id: string, enabled: boolean) => void
}) {
  return (
    <section>
      <SectionHeader
        icon={<Layers className="h-5 w-5" />}
        title="Lenses"
        count={`${activeLensIds.size} active`}
      />
      <div className="border border-border rounded-md divide-y divide-border">
        {allLenses.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No lenses available.
          </div>
        ) : (
          allLenses.map((lens) => (
            <label
              key={lens.id}
              className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <Checkbox
                checked={activeLensIds.has(lens.id)}
                onCheckedChange={(checked) => onToggle(lens.id, Boolean(checked))}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {lens.name}
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
                    {lens.type === 'keyword-attached' ? 'keyword tag' : 'document context'}
                  </span>
                  {lens.isBuiltin && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
                      built-in
                    </span>
                  )}
                </div>
                {lens.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {lens.description}
                  </div>
                )}
              </div>
            </label>
          ))
        )}
      </div>
    </section>
  )
}

function ClassificationSection({ vm }: { vm: ProjectViewModel }) {
  // Find a document-context lens active on the project. v1 only handles
  // one such lens at a time (typically Function); the dropdown is not
  // shown unless a project has more than one.
  const contextLenses = vm.lenses.filter((l) => l.type === 'document-context')
  const [activeLensId, setActiveLensId] = useState<string>(contextLenses[0]?.id ?? '')
  const [status, setStatus] = useState<ClassificationStatus | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ClassifyDocumentProgress | null>(null)

  useEffect(() => {
    if (contextLenses.length > 0 && !activeLensId) {
      setActiveLensId(contextLenses[0].id)
    }
  }, [contextLenses, activeLensId])

  useEffect(() => {
    if (!activeLensId || vm.documentCount === 0) {
      setStatus(null)
      return
    }
    getClassificationStatus(vm.project.id, activeLensId).then(setStatus)
  }, [vm.project.id, vm.documentCount, activeLensId])

  const lens = contextLenses.find((l) => l.id === activeLensId)

  const handleRun = async () => {
    if (!activeLensId) return
    setRunning(true)
    setProgress(null)
    try {
      const result = await classifyProjectFunctions(vm.project.id, activeLensId, setProgress)
      const fresh = await getClassificationStatus(vm.project.id, activeLensId)
      setStatus(fresh)
      const summary =
        `Classified ${result.documentsProcessed} document${result.documentsProcessed === 1 ? '' : 's'}` +
        ` (${result.totalSectionsTagged} sections tagged)`
      if (result.documentsFailed > 0) {
        // Some documents failed but the run continued (per-document isolation).
        toast.error(
          `${summary}. ${result.documentsFailed} document${result.documentsFailed === 1 ? '' : 's'} failed`,
          'Check the backend status and re-run classification to retry the failed documents.'
        )
      } else {
        toast.success(summary)
      }
    } catch (err) {
      toast.error(`Classification failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  if (contextLenses.length === 0) {
    // No document-context lens active — nothing to classify. Hide the
    // section entirely to keep Setup clean for projects that don't use
    // Function-style classification.
    return null
  }

  return (
    <section id="classification">
      <SectionHeader
        icon={<Sparkles className="h-5 w-5" />}
        title="Function classification"
        count={
          status
            ? `${status.classifiedDocuments} / ${status.totalDocuments} documents`
            : undefined
        }
      />
      <div className="border border-border rounded-md p-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Classifies each section of each document on the{' '}
          <strong>{lens?.name ?? 'document-context'}</strong> lens via embedding similarity.
          Required for the Map two-axis matrix and the full Wedding Cake Score.
          {status && status.unavailableDocuments > 0 && (
            <>
              {' '}<strong>{status.unavailableDocuments}</strong>{' '}
              document{status.unavailableDocuments === 1 ? '' : 's'} can't be classified
              (no extracted text — re-import or check the Library).
            </>
          )}
        </p>

        {progress && <ClassificationProgressBar progress={progress} />}

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRun}
            disabled={running || vm.documentCount === 0}
            className="gap-2"
          >
            {running ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Classifying…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {status && status.classifiedDocuments > 0 ? 'Re-classify' : 'Classify documents'}
              </>
            )}
          </Button>
          {status && status.classifiedDocuments === status.totalDocuments && status.totalDocuments > 0 && (
            <span className="text-xs text-green-700">All documents classified.</span>
          )}
        </div>
      </div>
    </section>
  )
}

function ClassificationProgressBar({ progress }: { progress: ClassifyDocumentProgress }) {
  const docPct = ((progress.documentIndex + (progress.sectionsTotal > 0
    ? progress.sectionsDone / progress.sectionsTotal
    : 0)) / progress.totalDocuments) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate">
          <RefreshCw className="inline h-3 w-3 mr-1.5 animate-spin" />
          {progress.documentLabel}
          {progress.sectionsTotal > 0 && (
            <span className="text-muted-foreground">
              {' '}· {progress.sectionsDone} / {progress.sectionsTotal} sections
            </span>
          )}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {progress.documentIndex + 1} / {progress.totalDocuments}
        </span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground transition-all"
          style={{ width: `${Math.min(100, docPct)}%` }}
        />
      </div>
    </div>
  )
}

function ScoringRuleSection({
  allRules,
  activeRuleId,
  onSelect,
  locked = false,
}: {
  allRules: ScoringRule[]
  activeRuleId: string | null
  onSelect: (id: string) => void
  locked?: boolean
}) {
  const active = allRules.find((r) => r.id === activeRuleId)

  // Auto-select when there's only one rule and nothing is selected yet.
  useEffect(() => {
    if (allRules.length === 1 && !activeRuleId) {
      onSelect(allRules[0].id)
    }
  }, [allRules, activeRuleId, onSelect])

  return (
    <section>
      <SectionHeader
        icon={<Award className="h-5 w-5" />}
        title="Scoring rule"
        count={active ? active.name : 'None selected'}
      />
      <div className="border border-border rounded-md p-4 space-y-3">
        {locked || allRules.length <= 1 ? (
          <div className="flex items-center gap-2">
            <p className="text-sm flex-1">
              {active
                ? active.name
                : <span className="text-muted-foreground italic">No scoring rules defined. Create one in Settings.</span>}
            </p>
            {locked && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                Fixed for this theme
              </span>
            )}
          </div>
        ) : (
          <Select value={activeRuleId ?? ''} onValueChange={onSelect}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Pick a scoring rule" />
            </SelectTrigger>
            <SelectContent>
              {allRules.map((rule) => (
                <SelectItem key={rule.id} value={rule.id}>
                  {rule.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {active && (
          <p className="text-xs text-muted-foreground">
            {active.description ?? 'No description.'}
          </p>
        )}
      </div>
    </section>
  )
}
