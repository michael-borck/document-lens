import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computeCoverage, type CoverageMatrix } from '@/services/coverage'
import { getKeywordListLenses } from '@/services/keyword-lists'
import { CoverageHeatmap } from '@/components/coverage/CoverageHeatmap'
import { EmptyState } from '@/components/EmptyState'
import { useAnalysis } from '@/hooks/useAnalysis'
import { PolaritySelector, type Polarity } from '@/components/workflow/PolaritySelector'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'

interface CoverageResult {
  positive: CoverageMatrix | null
  counter: CoverageMatrix | null
}

export function Coverage() {
  const vm = useOutletContext<ProjectViewModel>()
  const [polarity, setPolarity] = useState<Polarity>('both')
  // Lens id to roll up by, or '' meaning "keyword level (no roll-up)".
  const [lensId, setLensId] = useState<string>('')
  const [eligibleLensIds, setEligibleLensIds] = useState<string[]>([])

  // The run lifecycle (running / clear-before-run / cancel-safety) lives in the
  // hook; Coverage's dual-polarity Promise.all just lives inside the fn.
  const { run, running, result } = useAnalysis<CoverageResult>(async () => {
    const lensIdOrNull = lensId || null
    if (polarity === 'both') {
      const [pos, cnt] = await Promise.all([
        computeCoverage({ projectId: vm.project.id, keywordListId: vm.keywordList!.id, polarity: 'positive', lensId: lensIdOrNull }),
        computeCoverage({ projectId: vm.project.id, keywordListId: vm.keywordList!.id, polarity: 'counter', lensId: lensIdOrNull }),
      ])
      return { positive: pos, counter: cnt }
    }
    const m = await computeCoverage({
      projectId: vm.project.id,
      keywordListId: vm.keywordList!.id,
      polarity,
      lensId: lensIdOrNull,
    })
    return polarity === 'positive' ? { positive: m, counter: null } : { positive: null, counter: m }
  })
  const positive = result?.positive ?? null
  const counter = result?.counter ?? null

  // Resolve which of the project's active lenses are usable for Coverage
  // (keyword-attached only, AND declared by the active keyword list).
  useEffect(() => {
    if (!vm.keywordList) {
      setEligibleLensIds([])
      return
    }
    getKeywordListLenses(vm.keywordList.id).then((declared) => {
      const projectLensIds = new Set(vm.lenses.map((l) => l.id))
      setEligibleLensIds(declared.filter((id) => projectLensIds.has(id)))
    })
  }, [vm.keywordList, vm.lenses])

  const eligibleLenses = vm.lenses.filter(
    (l) => l.type === 'keyword-attached' && eligibleLensIds.includes(l.id)
  )

  if (!vm.keywordList) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No keyword list"
          description="Pick a keyword list on the Setup tab to enable Coverage."
        />
      </div>
    )
  }

  const docCount = vm.documentCount
  if (docCount === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library in Setup, then run Coverage to see which keywords appear where."
        />
      </div>
    )
  }

  const hasResults = positive !== null || counter !== null
  const byLens = Boolean(lensId)

  return (
    <div className="px-8 py-8 max-w-7xl">
      <Header />

      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">Polarity</label>
          <PolaritySelector value={polarity} onChange={setPolarity} />
        </div>
        <LensField
          value={lensId}
          onChange={setLensId}
          options={eligibleLenses.map((l) => ({ id: l.id, label: l.name }))}
        />
        <div className="flex-1" />
        <Button onClick={run} disabled={running} className="gap-2">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              {hasResults ? 'Re-run' : 'Run coverage'}
            </>
          )}
        </Button>
      </div>

      {!hasResults && !running && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          {docCount} document{docCount === 1 ? '' : 's'} attached · using
          {' '}<strong>{vm.keywordList.name}</strong> keywords
          {byLens && ` · grouped by ${eligibleLenses.find((l) => l.id === lensId)?.name}`}
          . Click <strong>Run coverage</strong> to compute.
        </div>
      )}

      {polarity === 'both' && positive && counter ? (
        <div className="space-y-8">
          <PolarityPanel title="Positive matches" matrix={positive} polarityHint="positive" byLens={byLens} />
          <PolarityPanel title="Counter matches" matrix={counter} polarityHint="counter" byLens={byLens} />
        </div>
      ) : polarity === 'positive' && positive ? (
        <PolarityPanel title="Positive matches" matrix={positive} polarityHint="positive" byLens={byLens} />
      ) : polarity === 'counter' && counter ? (
        <PolarityPanel title="Counter matches" matrix={counter} polarityHint="counter" byLens={byLens} />
      ) : null}
    </div>
  )
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight">Coverage</h1>
      <p className="text-muted-foreground italic mt-1">
        Which of your documents discuss this framework?
      </p>
    </header>
  )
}

function LensField({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ id: string; label: string }>
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">Group by</label>
      <Select value={value || 'keyword'} onValueChange={(v) => onChange(v === 'keyword' ? '' : v)}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="keyword">Keyword (no roll-up)</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function PolarityPanel({
  title,
  matrix,
  polarityHint,
  byLens,
}: {
  title: string
  matrix: CoverageMatrix
  polarityHint: 'positive' | 'counter'
  byLens: boolean
}) {
  return (
    <div>
      <div className="mb-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-xs text-muted-foreground">{matrix.summary}</p>
      </div>
      <CoverageHeatmap matrix={matrix} polarityHint={polarityHint} byLens={byLens} />
    </div>
  )
}
