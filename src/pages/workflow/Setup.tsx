import { useEffect, useState } from 'react'
import { useLocation, useOutletContext } from 'react-router-dom'
import { FileText, Tag, Layers, Award, Plus, X, Sparkles, RefreshCw, Package, FileWarning, Link as LinkIcon, AlertTriangle, Lock, Download } from 'lucide-react'
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
  setProjectAxes,
  updateProject,
  removeDocumentFromProject,
} from '@/services/projects'
import { listKeywordLists } from '@/services/keyword-lists'
import { listAxes } from '@/services/axes'
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
import { generateProjectReport } from '@/services/report-export'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { KeywordList, Axis, ScoringRule, Document } from '@/types/data'

export function Setup() {
  const vm = useOutletContext<ProjectViewModel>()

  const [allLists, setAllLists] = useState<KeywordList[]>([])
  const [allAxes, setAllAxes] = useState<Axis[]>([])
  const [allRules, setAllRules] = useState<ScoringRule[]>([])

  useEffect(() => {
    Promise.all([
      listKeywordLists(),
      listAxes(),
      listScoringRules(),
    ]).then(([lists, axes, rules]) => {
      setAllLists(lists)
      setAllAxes(axes)
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

  const handleToggleAxis = async (axisId: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...vm.project.axisIds, axisId]))
      : vm.project.axisIds.filter((id) => id !== axisId)
    try {
      await setProjectAxes(vm.project.id, next)
      await vm.refresh()
    } catch (err) {
      toast.error(`Could not update axes: ${err instanceof Error ? err.message : String(err)}`)
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

  const handleExportReport = async () => {
    if (!vm.keywordList) {
      toast.error('Pick a keyword list before exporting a report.')
      return
    }
    const save = await window.electron.saveFileDialog({
      title: 'Save project report',
      defaultPath: `${vm.project.name} report.docx`,
      filters: [{ name: 'Word document', extensions: ['docx'] }],
    })
    if (save.canceled || !save.filePath) return
    try {
      const blob = await generateProjectReport({
        projectId: vm.project.id,
        projectName: vm.project.name,
        keywordListId: vm.keywordList.id,
        keywordListName: vm.keywordList.name,
        scoringRule: vm.scoringRule,
        generatedAt: new Date().toLocaleString(),
      })
      await window.electron.writeFile(save.filePath, await blob.arrayBuffer())
      toast.success(`Report saved to ${save.filePath}`)
    } catch (err) {
      toast.error(`Report export failed: ${err instanceof Error ? err.message : String(err)}`)
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
            Assemble this project: documents, keywords, axes, scoring rule.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportReport}
            className="gap-1.5"
            title="Export a Word (.docx) report — inventory, scores, and substance signals"
          >
            <FileText className="h-4 w-4" />
            Export report
          </Button>
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

      <div className="space-y-8">
        <DocumentsSection vm={vm} />
        <KeywordsSection
          allLists={allLists}
          activeListId={vm.keywordList?.id ?? null}
          onSelect={handleSelectKeywordList}
        />
        <AxesSection
          allAxes={allAxes}
          activeAxisIds={new Set(vm.project.axisIds)}
          onToggle={handleToggleAxis}
        />
        <ScoringRuleSection
          allRules={allRules}
          activeRuleId={vm.scoringRule?.id ?? null}
          onSelect={handleSelectScoringRule}
          locked={vm.project.lens === 'sustainability'}
        />
      </div>
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

  // Classification lives HERE, beside "Add documents" — the single entry
  // point (the old dedicated section + top-of-page banner duplicated it).
  // Gated on a document-context (Function/Pillar) axis AND on the analysis
  // engine being ready: it takes ~2 min after launch to load its model, and
  // firing into that window used to yield a bare "failed".
  const contextAxes = vm.axes.filter((a) => a.type === 'document-context')
  const hasContextAxis = contextAxes.length > 0
  const [classifying, setClassifying] = useState(false)
  const [classifyStatus, setClassifyStatus] = useState<ClassificationStatus | null>(null)
  const [classifyProgress, setClassifyProgress] = useState<ClassifyDocumentProgress | null>(null)

  const [enginePhase, setEnginePhase] = useState<string>('checking')
  useEffect(() => {
    // No desktop shell (plain-browser dev / tests) → no supervisor to ask;
    // assume ready rather than dead-locking the button.
    if (!window.electron?.getBackendStatus) {
      setEnginePhase('ready')
      return
    }
    let mounted = true
    window.electron.getBackendStatus()
      .then((s) => { if (mounted) setEnginePhase(s.phase) })
      .catch(() => { if (mounted) setEnginePhase('unreachable') })
    const unsub = window.electron.onBackendStatusChanged?.((s) => setEnginePhase(s.phase))
    return () => { mounted = false; unsub?.() }
  }, [])
  const engineReady = enginePhase === 'ready'

  useEffect(() => {
    if (!hasContextAxis || vm.documentCount === 0) { setClassifyStatus(null); return }
    getClassificationStatus(vm.project.id, contextAxes[0].id).then(setClassifyStatus)
  }, [vm.project.id, vm.documentCount, hasContextAxis, contextAxes[0]?.id])

  const unclassifiedCount = classifyStatus
    ? classifyStatus.totalDocuments - classifyStatus.classifiedDocuments
    : 0

  const handleClassify = async () => {
    if (!hasContextAxis) return
    setClassifying(true)
    setClassifyProgress(null)
    try {
      const result = await classifyProjectFunctions(vm.project.id, contextAxes[0].id, setClassifyProgress)
      setClassifyStatus(await getClassificationStatus(vm.project.id, contextAxes[0].id))
      const summary = `Classified ${result.documentsProcessed} document${result.documentsProcessed === 1 ? '' : 's'} (${result.totalSectionsTagged} sections tagged)`
      if (result.documentsFailed > 0) {
        toast.error(
          `${summary}. ${result.documentsFailed} document${result.documentsFailed === 1 ? '' : 's'} failed`,
          'Check the analysis engine status and re-run to retry.'
        )
      } else {
        toast.success(summary)
      }
    } catch (err) {
      toast.error(`Classification failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setClassifying(false)
      setClassifyProgress(null)
    }
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
        {/* id="classification": deep-link target for Map/Score's "run
            classification on Setup" links (the dedicated section this
            replaced carried the anchor before). */}
        <div id="classification" className="border-t border-border p-3 space-y-2 scroll-mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPickerOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add documents from Library
            </Button>
            <Button
              variant="outline"
              onClick={handleClassify}
              disabled={!hasContextAxis || vm.documentCount === 0 || classifying || !engineReady}
              className="gap-2"
              title={
                !hasContextAxis
                  ? 'Add a Function/Pillar (document-context) axis to enable classification'
                  : !engineReady
                    ? 'The analysis engine is still starting — this enables when the status chip says Ready'
                    : `Classify document sections on the ${contextAxes[0]?.name ?? 'document-context'} axis`
              }
            >
              {classifying ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Classifying…</>
              ) : (
                <><Sparkles className="h-4 w-4" /> {classifyStatus && classifyStatus.classifiedDocuments > 0 ? 'Re-classify documents' : 'Classify documents'}</>
              )}
            </Button>
          </div>
          {classifyProgress && <ClassificationProgressBar progress={classifyProgress} />}
          {/* Status line: when classification isn't complete it always states
              the REASON (no axis / engine warming / docs without text / not
              run yet) — a count and a colour alone send people hunting. */}
          {vm.documentCount > 0 && !classifying && (() => {
            const unavailable = classifyStatus?.unavailableDocuments ?? 0
            const total = classifyStatus?.totalDocuments ?? 0
            const allDone = classifyStatus !== null && total > 0 && unclassifiedCount === 0 && unavailable === 0
            if (allDone) {
              return (
                <p className="text-xs text-green-700 dark:text-green-500">
                  All {total} document{total === 1 ? '' : 's'} classified.
                </p>
              )
            }
            return (
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  {!hasContextAxis ? (
                    <>No <strong>Function/Pillar</strong> axis is active — add a document-context axis (Axes section below) to enable classification for the Map matrix and Wedding Cake score.</>
                  ) : !engineReady ? (
                    <>The analysis engine is starting (a minute or two after launch) — <strong>Classify</strong> enables when the status chip at the top says Ready.</>
                  ) : (
                    <>
                      <strong>{classifyStatus?.classifiedDocuments ?? 0}</strong> of{' '}
                      <strong>{total}</strong> document{total === 1 ? '' : 's'} classified
                      {unavailable > 0 && (
                        <> · <strong>{unavailable}</strong> {unavailable === 1 ? 'has' : 'have'} no extracted text — re-import from the Library</>
                      )}
                      {unclassifiedCount > 0 && <> — classify to enable the Map matrix and full Wedding Cake score.</>}
                    </>
                  )}
                </span>
              </p>
            )
          })()}
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

function AxesSection({
  allAxes,
  activeAxisIds,
  onToggle,
}: {
  allAxes: Axis[]
  activeAxisIds: Set<string>
  onToggle: (id: string, enabled: boolean) => void
}) {
  return (
    <section>
      <SectionHeader
        icon={<Layers className="h-5 w-5" />}
        title="Axes"
        count={`${activeAxisIds.size} active`}
      />
      <div className="border border-border rounded-md divide-y divide-border">
        {allAxes.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No axes available.
          </div>
        ) : (
          allAxes.map((axis) => (
            <label
              key={axis.id}
              className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <Checkbox
                checked={activeAxisIds.has(axis.id)}
                onCheckedChange={(checked) => onToggle(axis.id, Boolean(checked))}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium flex items-center gap-2">
                  {axis.name}
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
                    {axis.type === 'keyword-attached' ? 'keyword tag' : 'document context'}
                  </span>
                  {axis.isBuiltin && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
                      built-in
                    </span>
                  )}
                </div>
                {axis.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {axis.description}
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
