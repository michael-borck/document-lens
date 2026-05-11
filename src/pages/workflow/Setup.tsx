import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FileText, Tag, Layers, Award, Plus } from 'lucide-react'
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
} from '@/services/projects'
import { listKeywordLists } from '@/services/keyword-lists'
import { listLenses } from '@/services/lenses'
import { listScoringRules } from '@/services/scoring-rules'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { KeywordList, Lens, ScoringRule } from '@/types/data'

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
    await setProjectKeywordList(vm.project.id, listId)
    await vm.refresh()
  }

  const handleToggleLens = async (lensId: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...vm.project.lensIds, lensId]))
      : vm.project.lensIds.filter((id) => id !== lensId)
    await setProjectLenses(vm.project.id, next)
    await vm.refresh()
  }

  const handleSelectScoringRule = async (ruleId: string) => {
    await updateProject(vm.project.id, { scoringRuleId: ruleId })
    await vm.refresh()
  }

  return (
    <div className="px-8 py-8 max-w-4xl">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-medium tracking-tight">Setup</h1>
        <p className="text-muted-foreground italic mt-1">
          Assemble this project: documents, keywords, lenses, scoring rule.
        </p>
      </header>

      <div className="space-y-8">
        <DocumentsSection documentCount={vm.documentCount} />
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
        <ScoringRuleSection
          allRules={allRules}
          activeRuleId={vm.scoringRule?.id ?? null}
          onSelect={handleSelectScoringRule}
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

function DocumentsSection({ documentCount }: { documentCount: number }) {
  return (
    <section>
      <SectionHeader
        icon={<FileText className="h-5 w-5" />}
        title="Documents"
        count={`${documentCount} selected`}
      />
      <div className="border border-dashed border-border rounded-md p-6 text-sm text-muted-foreground">
        {documentCount === 0
          ? 'No documents yet. Document import lands in Phase 2 — for now, the rest of Setup can be configured against the seeded sustainability defaults.'
          : `${documentCount} document${documentCount === 1 ? '' : 's'} attached. Document picker UI coming in Phase 2.`}
        <div className="mt-4">
          <Button variant="outline" disabled className="gap-2">
            <Plus className="h-4 w-4" />
            Add documents from Library
          </Button>
        </div>
      </div>
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

function ScoringRuleSection({
  allRules,
  activeRuleId,
  onSelect,
}: {
  allRules: ScoringRule[]
  activeRuleId: string | null
  onSelect: (id: string) => void
}) {
  const active = allRules.find((r) => r.id === activeRuleId)
  return (
    <section>
      <SectionHeader
        icon={<Award className="h-5 w-5" />}
        title="Scoring rule"
        count={active ? active.name : 'None selected'}
      />
      <div className="border border-border rounded-md p-4 space-y-3">
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
        {active && (
          <p className="text-xs text-muted-foreground">
            {active.description ?? 'No description.'}
          </p>
        )}
      </div>
    </section>
  )
}
