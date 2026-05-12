import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Loader2, Play, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { computeNgrams, type ComputeNgramsResult, type NgramSize } from '@/services/ngrams'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'

type SizeFilter = '2' | '3' | 'both'

export function Discover() {
  const vm = useOutletContext<ProjectViewModel>()
  const [activeTab, setActiveTab] = useState<'phrases' | 'synonyms'>('phrases')

  if (vm.documentCount === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to discover phrases and synonyms."
        />
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <Header />

      <div className="border-b border-border mb-6 flex">
        <TabButton
          label="Phrases"
          subtitle="Frequent 2-3 word phrases in your corpus"
          active={activeTab === 'phrases'}
          onClick={() => setActiveTab('phrases')}
        />
        <TabButton
          label="Synonyms"
          subtitle="Corpus terms close to your keywords"
          active={activeTab === 'synonyms'}
          onClick={() => setActiveTab('synonyms')}
        />
      </div>

      {activeTab === 'phrases' ? (
        <PhrasesTab projectId={vm.project.id} />
      ) : (
        <SynonymsPlaceholder />
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight">Discover</h1>
      <p className="text-muted-foreground italic mt-1">
        What words is your corpus using that you should know about?
      </p>
    </header>
  )
}

function TabButton({
  label,
  subtitle,
  active,
  onClick,
}: {
  label: string
  subtitle: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px text-left ${
        active
          ? 'border-foreground text-foreground font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      <div>{label}</div>
      <div className="text-[10px] text-muted-foreground font-normal mt-0.5">{subtitle}</div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Phrases sub-tab
// ---------------------------------------------------------------------------

function PhrasesTab({ projectId }: { projectId: string }) {
  const [size, setSize] = useState<SizeFilter>('both')
  const [minCount, setMinCount] = useState<number>(3)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ComputeNgramsResult | null>(null)

  const handleRun = async () => {
    setRunning(true)
    try {
      const sizes: NgramSize[] = size === '2' ? [2] : size === '3' ? [3] : [2, 3]
      const r = await computeNgrams({ projectId, sizes, minCount, topN: 200 })
      setResult(r)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="flex items-end gap-4 mb-6 flex-wrap">
        <Field label="Size">
          <Select value={size} onValueChange={(v) => setSize(v as SizeFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Bigrams + Trigrams</SelectItem>
              <SelectItem value="2">Bigrams (2 words)</SelectItem>
              <SelectItem value="3">Trigrams (3 words)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Min frequency">
          <Select value={String(minCount)} onValueChange={(v) => setMinCount(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">≥ 2</SelectItem>
              <SelectItem value="3">≥ 3</SelectItem>
              <SelectItem value="5">≥ 5</SelectItem>
              <SelectItem value="10">≥ 10</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex-1" />
        <Button onClick={handleRun} disabled={running} className="gap-2">
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              {result ? 'Re-run' : 'Run discovery'}
            </>
          )}
        </Button>
      </div>

      {!result ? (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          Click <strong>Run discovery</strong> to extract frequent 2- and 3-word phrases from this project's documents.
        </div>
      ) : result.results.length === 0 ? (
        <EmptyState
          title="No phrases above the minimum frequency"
          description="Lower the minimum frequency or add more documents to surface more phrases."
        />
      ) : (
        <PhrasesTable result={result} />
      )}
    </div>
  )
}

function PhrasesTable({ result }: { result: ComputeNgramsResult }) {
  const max = result.results[0]?.count ?? 1

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        {result.results.length} phrase{result.results.length === 1 ? '' : 's'} from{' '}
        {result.documentCount} document{result.documentCount === 1 ? '' : 's'} ·{' '}
        {result.totalTokens.toLocaleString()} total tokens analysed
      </p>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-16">Size</th>
              <th className="text-left font-medium px-4 py-2">Phrase</th>
              <th className="text-right font-medium px-4 py-2 w-24">Count</th>
              <th className="text-right font-medium px-4 py-2 w-24">In docs</th>
              <th className="text-left font-medium px-4 py-2 w-48">Frequency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.results.map((r) => {
              const pct = (r.count / max) * 100
              return (
                <tr key={`${r.size}:${r.phrase}`} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-1.5 text-xs text-muted-foreground tabular-nums">
                    {r.size}-gram
                  </td>
                  <td className="px-4 py-1.5 font-medium">{r.phrase}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{r.count.toLocaleString()}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.documentCount}
                  </td>
                  <td className="px-4 py-1.5">
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-foreground/60"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Synonyms sub-tab — placeholder until Phase 5
// ---------------------------------------------------------------------------

function SynonymsPlaceholder() {
  return (
    <EmptyState
      icon={<Sparkles className="h-12 w-12" />}
      title="Synonym discovery — coming in Phase 5"
      description="Embedding-based synonym suggestions per keyword (positive and counter), with explicit Accept / Reject controls. The accepted synonyms attach to the parent keyword and start counting in Coverage automatically."
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
