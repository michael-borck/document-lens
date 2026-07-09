import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  computeCompare,
  type CompareResult,
  type CompareMetric,
  type CompareGroup,
} from '@/services/compare'
import { listKeywords } from '@/services/keyword-lists'
import { selectAll } from '@/services/db'
import { EmptyState } from '@/components/EmptyState'
import { useAnalysis } from '@/hooks/useAnalysis'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Keyword, KeywordPolarity } from '@/types/data'

/**
 * Compare workflow.
 *
 * "Track without time" — same per-document measure logic, but ranks all
 * docs by metric value rather than aggregating by year. The headline
 * answer to "which company / report does best on this framework?".
 *
 * Scoring rule output is the default metric since it's the most useful
 * single-number ranking; raw match counts and pos-minus-counter are
 * the auxiliary metrics for sanity-checking the score.
 */
export function Compare() {
  const vm = useOutletContext<ProjectViewModel>()
  const [metric, setMetric] = useState<CompareMetric>('score')
  const [polarity, setPolarity] = useState<KeywordPolarity>('positive')
  const [keywordId, setKeywordId] = useState<string>('')  // '' = all keywords
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [group, setGroup] = useState<CompareGroup>('none')
  const [yearMin, setYearMin] = useState<string>('')
  const [yearMax, setYearMax] = useState<string>('')
  const [companies, setCompanies] = useState<Set<string>>(new Set())
  const [sectors, setSectors] = useState<Set<string>>(new Set())
  const [types, setTypes] = useState<Set<string>>(new Set())

  const [allCompanies, setAllCompanies] = useState<string[]>([])
  const [allSectors, setAllSectors] = useState<string[]>([])
  const [allTypes, setAllTypes] = useState<string[]>([])


  // Load enabled keywords for the per-keyword narrowing dropdown.
  useEffect(() => {
    if (!vm.keywordList) {
      setKeywords([])
      return
    }
    listKeywords(vm.keywordList.id).then((all) => {
      setKeywords(all.filter((k) => k.enabled))
    })
  }, [vm.keywordList])

  // Reset the keyword selection when polarity changes — the previously
  // chosen keyword may not exist in the new polarity.
  useEffect(() => {
    setKeywordId('')
  }, [polarity])

  // Load distinct companies + sectors from the project's docs for the
  // multi-select filters.
  useEffect(() => {
    selectAll<{ value: string }>(
      `SELECT DISTINCT d.company AS value
         FROM documents d
         JOIN project_documents pd ON pd.document_id = d.id
        WHERE pd.project_id = ? AND d.company IS NOT NULL AND TRIM(d.company) != ''
        ORDER BY value`,
      [vm.project.id]
    ).then((rows) => setAllCompanies(rows.map((r) => r.value)))

    selectAll<{ value: string }>(
      `SELECT DISTINCT d.sector AS value
         FROM documents d
         JOIN project_documents pd ON pd.document_id = d.id
        WHERE pd.project_id = ? AND d.sector IS NOT NULL AND TRIM(d.sector) != ''
        ORDER BY value`,
      [vm.project.id]
    ).then((rows) => setAllSectors(rows.map((r) => r.value)))

    selectAll<{ value: string }>(
      `SELECT DISTINCT d.type AS value
         FROM documents d
         JOIN project_documents pd ON pd.document_id = d.id
        WHERE pd.project_id = ? AND d.type IS NOT NULL AND TRIM(d.type) != ''
        ORDER BY value`,
      [vm.project.id]
    ).then((rows) => setAllTypes(rows.map((r) => r.value)))
  }, [vm.project.id])

  // Manual run; the hook owns running/error/result + cancel-safety.
  const { run, running, result, error } = useAnalysis<CompareResult>(async () => {
    if (!vm.keywordList) throw new Error('Pick a keyword list on the Setup tab.')
    if (metric === 'score' && !vm.scoringRule) {
      throw new Error('Score metric needs a scoring rule on the Setup tab.')
    }
    // The Score Evaluator parses the rule definition + decides full/v1 mode;
    // the page just hands it the raw definition for the score metric.
    return computeCompare({
      projectId: vm.project.id,
      keywordListId: vm.keywordList.id,
      metric,
      polarity,
      keywordId: keywordId || undefined,
      group,
      yearMin: yearMin ? Number(yearMin) : undefined,
      yearMax: yearMax ? Number(yearMax) : undefined,
      companies: companies.size > 0 ? Array.from(companies) : undefined,
      sectors: sectors.size > 0 ? Array.from(sectors) : undefined,
      types: types.size > 0 ? Array.from(types) : undefined,
      scoringRule: metric === 'score' ? vm.scoringRule?.definition : undefined,
    })
  })

  const toggleCompany = (c: string) => {
    const next = new Set(companies)
    if (next.has(c)) next.delete(c); else next.add(c)
    setCompanies(next)
  }
  const toggleSector = (s: string) => {
    const next = new Set(sectors)
    if (next.has(s)) next.delete(s); else next.add(s)
    setSectors(next)
  }

  const toggleType = (t: string) => {
    const next = new Set(types)
    if (next.has(t)) next.delete(t); else next.add(t)
    setTypes(next)
  }

  if (!vm.keywordList) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState title="No keyword list" description="Pick a keyword list on the Setup tab to enable Compare." />
      </div>
    )
  }
  if (vm.documentCount === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to compare them."
        />
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <Header />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Field label="Metric">
          <Select value={metric} onValueChange={(v) => setMetric(v as CompareMetric)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score (active rule)</SelectItem>
              <SelectItem value="match-count">Match count</SelectItem>
              <SelectItem value="distinct-keywords">Distinct keywords matched</SelectItem>
              <SelectItem value="pos-minus-counter">Positive − Counter (greenwashing index)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {(metric === 'match-count' || metric === 'distinct-keywords') && (
          <>
            <Field label="Polarity">
              <Select value={polarity} onValueChange={(v) => setPolarity(v as KeywordPolarity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="counter">Counter</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Keyword">
              <Select value={keywordId || '__all__'} onValueChange={(v) => setKeywordId(v === '__all__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All {polarity} keywords</SelectItem>
                  {keywords
                    .filter((k) => k.polarity === polarity)
                    .map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.text}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
        <Field label="Colour bars by">
          <Select value={group} onValueChange={(v) => setGroup(v as CompareGroup)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (uniform)</SelectItem>
              <SelectItem value="company">Company</SelectItem>
              <SelectItem value="year">Year</SelectItem>
              <SelectItem value="sector">Sector</SelectItem>
              <SelectItem value="type">Type</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Field label="Year ≥">
          <Input type="number" value={yearMin} onChange={(e) => setYearMin(e.target.value)} placeholder="(no lower bound)" />
        </Field>
        <Field label="Year ≤">
          <Input type="number" value={yearMax} onChange={(e) => setYearMax(e.target.value)} placeholder="(no upper bound)" />
        </Field>
        <div className="flex items-end">
          <Button onClick={run} disabled={running} className="gap-2 w-full">
            {running ? (<><Loader2 className="h-4 w-4 animate-spin" /> Running…</>) :
              (<><Play className="h-4 w-4" /> {result ? 'Re-run' : 'Run compare'}</>)}
          </Button>
        </div>
      </div>

      {(allCompanies.length > 0 || allSectors.length > 0 || allTypes.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {allCompanies.length > 0 && (
            <FilterCheckboxList
              label="Filter by company"
              options={allCompanies}
              selected={companies}
              onToggle={toggleCompany}
              onClear={() => setCompanies(new Set())}
            />
          )}
          {allSectors.length > 0 && (
            <FilterCheckboxList
              label="Filter by sector"
              options={allSectors}
              selected={sectors}
              onToggle={toggleSector}
              onClear={() => setSectors(new Set())}
            />
          )}
          {allTypes.length > 0 && (
            <FilterCheckboxList
              label="Filter by type"
              options={allTypes}
              selected={types}
              onToggle={toggleType}
              onClear={() => setTypes(new Set())}
            />
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 text-sm text-destructive border border-destructive/30 rounded-md p-3">{error}</div>
      )}

      {result && <ResultsView result={result} />}

      {!result && !running && !error && (
        <div className="mt-2 rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Click <span className="font-medium text-foreground">Run compare</span> to chart how your documents stack up.
        </div>
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight">Compare</h1>
      <p className="text-muted-foreground italic mt-1">
        Which document does best on this framework?
      </p>
    </header>
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

function FilterCheckboxList({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onToggle: (v: string) => void
  onClear: () => void
}) {
  return (
    <div className="border border-border rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear ({selected.size})
          </button>
        )}
      </div>
      <div className="max-h-32 overflow-y-auto space-y-1">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox
              checked={selected.has(opt)}
              onCheckedChange={() => onToggle(opt)}
            />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </div>
      {selected.size === 0 && (
        <div className="text-[11px] text-muted-foreground italic mt-1">All shown by default.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results view
// ---------------------------------------------------------------------------

const PALETTE = [
  'rgb(34, 197, 94)', 'rgb(59, 130, 246)', 'rgb(234, 88, 12)', 'rgb(168, 85, 247)',
  'rgb(234, 179, 8)', 'rgb(220, 38, 38)', 'rgb(20, 184, 166)', 'rgb(147, 51, 234)',
  'rgb(2, 132, 199)', 'rgb(132, 204, 22)',
]

function ResultsView({ result }: { result: CompareResult }) {
  const chartData = useMemo(() => {
    return result.points.map((p) => ({
      label: p.title,
      value: p.value,
      groupKey: groupKeyFor(p, result.group),
      year: p.year,
      company: p.company,
      sector: p.sector,
      type: p.type,
    }))
  }, [result])

  // Distinct group keys for legend / colour mapping.
  const groupKeys = useMemo(() => {
    if (result.group === 'none') return []
    const set = new Set<string>()
    for (const d of chartData) set.add(d.groupKey)
    return Array.from(set).sort()
  }, [chartData, result.group])

  const colourFor = (key: string): string => {
    if (result.group === 'none') return PALETTE[0]
    const idx = groupKeys.indexOf(key)
    return PALETTE[idx % PALETTE.length]
  }

  if (result.points.length === 0) {
    return (
      <EmptyState
        title="No documents matched the filters"
        description={
          result.excluded > 0
            ? `${result.excluded} document(s) excluded because they have no extracted text. Adjust the filters or import more documents.`
            : 'Adjust the year / company / sector filters and try again.'
        }
      />
    )
  }

  // Chart height scales with row count (28px per row, min 240, max 800
  // with internal scroll on the container).
  const chartHeight = Math.min(800, Math.max(240, chartData.length * 28))

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Ranked by <strong>{metricLabel(result.metric)}</strong>
        {result.keywordLabel && (
          <> for <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{result.keywordLabel}</code></>
        )}
        {' · '}{result.points.length} document{result.points.length === 1 ? '' : 's'}
        {result.excluded > 0 && ` (${result.excluded} excluded — no extracted text)`}
        {result.scoreFallback && (
          <> · <strong>fallback to v1 Pillar coverage</strong> (Function classification incomplete)</>
        )}
      </p>

      {result.group !== 'none' && groupKeys.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {groupKeys.map((key) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: colourFor(key) }} />
              <span className="text-muted-foreground">{key}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border border-border rounded-md p-2 overflow-y-auto" style={{ maxHeight: '600px' }}>
        <ChartContainer height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
            <XAxis type="number" stroke="currentColor" fontSize={11} />
            <YAxis
              type="category"
              dataKey="label"
              stroke="currentColor"
              fontSize={11}
              width={220}
              interval={0}
              tickFormatter={(v: string) => (v.length > 30 ? `${v.slice(0, 28)}…` : v)}
            />
            <Tooltip
              contentStyle={{ fontSize: '12px' }}
              formatter={(value: number) => [formatValue(value, result.metric), metricLabel(result.metric)]}
              labelFormatter={(label, items) => {
                const item = items?.[0]?.payload as { label: string; year: number | null; company: string | null; sector: string | null; type: string | null } | undefined
                if (!item) return String(label)
                const meta = [item.year, item.company, item.sector, item.type].filter(Boolean).join(' · ')
                return meta ? `${item.label} — ${meta}` : item.label
              }}
            />
            {result.group !== 'none' && <Legend wrapperStyle={{ fontSize: '12px' }} />}
            <Bar dataKey="value" name={metricLabel(result.metric)}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={colourFor(d.groupKey)} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <DataTable result={result} />
    </div>
  )
}

function groupKeyFor(
  p: CompareResult['points'][number],
  group: CompareGroup
): string {
  if (group === 'company') return p.company ?? '(no company)'
  if (group === 'year') return p.year !== null ? String(p.year) : '(year unknown)'
  if (group === 'sector') return p.sector ?? '(no sector)'
  if (group === 'type') return p.type ?? '(no type)'
  return 'all'
}

function metricLabel(m: CompareMetric): string {
  if (m === 'match-count') return 'Match count'
  if (m === 'distinct-keywords') return 'Distinct keywords matched'
  if (m === 'pos-minus-counter') return 'Positive − Counter'
  return 'Score'
}

function formatValue(value: number, metric: CompareMetric): string {
  if (metric === 'score') return value.toFixed(2)
  return value.toLocaleString()
}

function DataTable({ result }: { result: CompareResult }) {
  return (
    <details>
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        Underlying data ({result.points.length} document{result.points.length === 1 ? '' : 's'})
      </summary>
      <div className="mt-2 border border-border rounded-md overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium w-12">#</th>
              <th className="text-left px-3 py-1.5 font-medium">Document</th>
              <th className="text-left px-3 py-1.5 font-medium w-16">Year</th>
              <th className="text-left px-3 py-1.5 font-medium">Company</th>
              <th className="text-left px-3 py-1.5 font-medium">Sector</th>
              <th className="text-right px-3 py-1.5 font-medium w-20">{metricLabel(result.metric)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.points.map((p, i) => (
              <tr key={p.documentId}>
                <td className="px-3 py-1 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1 truncate max-w-md">{p.title}</td>
                <td className="px-3 py-1 tabular-nums">{p.year ?? '—'}</td>
                <td className="px-3 py-1 truncate">{p.company ?? '—'}</td>
                <td className="px-3 py-1 truncate">{p.sector ?? '—'}</td>
                <td className="px-3 py-1 text-right tabular-nums font-medium">{formatValue(p.value, result.metric)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
