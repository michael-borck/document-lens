import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { computeGap, type GapDataset, type GapLevel } from '@/services/gap'
import type { GapReference } from '@/services/_shared/gap-math'
import { GapScatter } from '@/components/gap/GapScatter'
import { GapOverTime } from '@/components/gap/GapOverTime'
import { EmptyState } from '@/components/EmptyState'
import { useAnalysis } from '@/hooks/useAnalysis'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'

const RESIDUAL_MIN_POINTS = 8

export function Gap() {
  const vm = useOutletContext<ProjectViewModel>()
  const [level, setLevel] = useState<GapLevel>('document')
  const [reference, setReference] = useState<GapReference>('diagonal')

  // Auto-runs on project / keyword-list / reference change. The hook's run-id
  // guard supersedes stale runs — the cancel-safety this page used to hand-roll.
  const { result: data, running: loading, error } = useAnalysis<GapDataset | null>(
    async () => {
      if (!vm.keywordList) return null
      return computeGap({ projectId: vm.project.id, keywordListId: vm.keywordList.id, reference })
    },
    [vm.project.id, vm.keywordList?.id, reference]
  )

  useEffect(() => { if (data?.singleDocument && level === 'document') setLevel('section') }, [data, level])

  const residualReady = useMemo(
    () => data ? data.byLevel[level].length >= RESIDUAL_MIN_POINTS : false,
    [data, level]
  )

  if (!vm.keywordList) {
    return <div className="px-8 py-10"><EmptyState title="No keyword list"
      description="Pick a keyword list on the Setup tab — the gap needs keywords to measure substance." /></div>
  }
  if (error) {
    return <div className="px-8 py-10"><EmptyState title="Analysis engine required"
      description="The Gap view needs the bundled analysis engine for sentiment. Check the status indicator in the top bar (Settings → Backend to restart), then reopen this tab." /></div>
  }

  return (
    <div className="px-8 py-10 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-medium tracking-tight">Gap</h1>
        <p className="text-muted-foreground italic mt-1">Where does the tone run ahead of the substance?</p>
      </header>

      <div className="rounded-md bg-muted/40 border border-border p-3 text-xs text-muted-foreground mb-6">
        Sentiment is a coarse signal — treat the gap as a way to find passages worth reading, not a verdict.
      </div>

      <div role="group" aria-label="Reference line" className="flex items-center gap-2 mb-4">
        <span className="text-sm text-muted-foreground">Reference line:</span>
        <button type="button" aria-pressed={reference === 'diagonal'} onClick={() => setReference('diagonal')}
          className={`text-sm px-3 py-1 rounded-full border ${reference === 'diagonal' ? 'border-foreground' : 'border-border text-muted-foreground'}`}>Absolute (diagonal)</button>
        <button type="button" aria-pressed={reference === 'residual'} disabled={!residualReady} onClick={() => setReference('residual')}
          title={residualReady ? '' : `Needs ≥ ${RESIDUAL_MIN_POINTS} points`}
          className={`text-sm px-3 py-1 rounded-full border disabled:opacity-40 ${reference === 'residual' ? 'border-foreground' : 'border-border text-muted-foreground'}`}>Relative to corpus</button>
      </div>

      {loading || !data ? (
        <div className="text-sm text-muted-foreground py-8">Analysing…</div>
      ) : data.byLevel.document.length === 0 && data.byLevel.section.length === 0 && data.byLevel.keyword.length === 0 ? (
        <EmptyState
          title="Nothing to plot yet"
          description="The gap needs documents with extracted text and keyword matches. Import and analyse documents on the Library tab, and make sure your keyword list has terms that appear in them."
        />
      ) : (
        <>
          <GapScatter data={data} level={level} onLevelChange={setLevel} />
          <section className="mt-10">
            <h2 className="font-display text-lg font-medium mb-3">Gap over time</h2>
            <GapOverTime data={data} />
          </section>
        </>
      )}
    </div>
  )
}
