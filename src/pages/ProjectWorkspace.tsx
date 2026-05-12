import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { ProjectBar } from '@/components/project/ProjectBar'
import { ProjectContextStrip } from '@/components/project/ProjectContextStrip'
import { WorkflowTabs } from '@/components/project/WorkflowTabs'
import { getProjectWithSetup, updateProject } from '@/services/projects'
import { listKeywordLists } from '@/services/keyword-lists'
import { listLenses } from '@/services/lenses'
import { listScoringRules } from '@/services/scoring-rules'
import { countDocumentsInProject } from '@/services/documents'
import type { ProjectWithSetup, KeywordList, Lens, ScoringRule } from '@/types/data'

/**
 * Aggregated read of everything the ProjectWorkspace shell + nested
 * workflow pages need: the project itself, joined relationships, and
 * the lookup tables for resolving id-to-name.
 *
 * Workflow pages can re-read this from the URL params; for now the
 * shell does it once and provides via the Outlet context.
 */
export interface ProjectViewModel {
  project: ProjectWithSetup
  documentCount: number
  keywordList: KeywordList | null
  lenses: Lens[]
  scoringRule: ScoringRule | null
  /** Setup is "complete enough" to enable workflow tabs. */
  setupComplete: boolean
  /** Re-fetches everything; call after a Setup mutation. */
  refresh: () => Promise<void>
}

export function ProjectWorkspace() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [vm, setVm] = useState<ProjectViewModel | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<ProjectViewModel | null> => {
    if (!projectId) return null
    const project = await getProjectWithSetup(projectId)
    if (!project) return null

    const [allLists, allLenses, allRules, documentCount] = await Promise.all([
      listKeywordLists(),
      listLenses(),
      listScoringRules(),
      countDocumentsInProject(projectId),
    ])

    const keywordList = project.keywordListIds[0]
      ? allLists.find((l) => l.id === project.keywordListIds[0]) ?? null
      : null
    const lenses = project.lensIds
      .map((id) => allLenses.find((l) => l.id === id))
      .filter((l): l is Lens => Boolean(l))
    const scoringRule = project.scoringRuleId
      ? allRules.find((r) => r.id === project.scoringRuleId) ?? null
      : null

    // Setup-complete rule: a keyword list and a scoring rule are
    // selected. Documents will become a requirement when the Library
    // import lands; for now they're optional so the user can try the
    // workflow tabs without first importing PDFs.
    const setupComplete = Boolean(keywordList && scoringRule)

    return {
      project,
      documentCount,
      keywordList,
      lenses,
      scoringRule,
      setupComplete,
      refresh: async () => {
        const next = await load()
        if (next) setVm(next)
      },
    }
  }, [projectId])

  useEffect(() => {
    setLoading(true)
    load().then((next) => {
      if (next) {
        setVm(next)
      } else if (projectId) {
        navigate('/', { replace: true })
      }
      setLoading(false)
    })
  }, [load, projectId, navigate])

  if (loading || !vm) {
    return (
      <div className="px-8 py-10 text-sm text-muted-foreground">
        Loading project…
      </div>
    )
  }

  const segments = buildContextSegments(vm)

  const handleRename = async (next: string) => {
    await updateProject(vm.project.id, { name: next })
    await vm.refresh()
  }

  return (
    <div className="flex flex-col h-full">
      <ProjectBar projectName={vm.project.name} onRename={handleRename} />
      <ProjectContextStrip segments={segments} />
      <WorkflowTabs setupComplete={vm.setupComplete} />
      <div className="flex-1 overflow-auto">
        <Outlet context={vm} />
      </div>
    </div>
  )
}

function buildContextSegments(vm: ProjectViewModel) {
  const segments: Array<{ label: string }> = []
  segments.push({ label: `${vm.documentCount} document${vm.documentCount === 1 ? '' : 's'}` })
  segments.push({
    label: vm.keywordList ? `${vm.keywordList.name} keywords` : 'No keyword list',
  })
  segments.push({
    label: vm.lenses.length > 0
      ? `${vm.lenses.length} lens${vm.lenses.length === 1 ? '' : 'es'}`
      : 'No lenses',
  })
  segments.push({
    label: vm.scoringRule ? vm.scoringRule.name : 'No scoring rule',
  })
  return segments
}
