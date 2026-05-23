import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Loader2, Play, AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { listKeywords, getKeywordListLenses } from '@/services/keyword-lists'
import { listLensValues } from '@/services/lenses'
import {
  computeTrack,
  type TrackResult,
  type TrackTopic,
  type TrackMeasure,
  type TrackGroup,
} from '@/services/track'
import { exportPaperBundle } from '@/services/bundle-export'
import { toast } from '@/stores/toastStore'
import { EmptyState } from '@/components/EmptyState'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'
import type { Keyword, KeywordPolarity, Lens, LensValue } from '@/types/data'

type TopicKind = 'all' | 'keyword' | 'lens-value'

/**
 * Track workflow.
 *
 * The headline deliverable per the methodology document. For each year
 * (where the project has documents), shows a measure value as a line
 * chart. Multiple lines when grouping by polarity (positive vs counter
 * trend overlay — the greenwashing-detection visualisation).
 *
 * Documents with year=null are surfaced separately ("year unknown"
 * callout) per resolved decision 4 — never silently dropped.
 *
 * Score measure auto-selects between Full Wedding Cake (when Function
 * classification is done) and v1 Pillar coverage prerequisite (when
 * not), with a banner explaining which is being shown.
 */
export function Track() {
  const vm = useOutletContext<ProjectViewModel>()

  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [allLenses, setAllLenses] = useState<Lens[]>([])
  const [lensValuesByLens, setLensValuesByLens] = useState<Record<string, LensValue[]>>({})

  const [measure, setMeasure] = useState<TrackMeasure>('match-count')
  const [topicKind, setTopicKind] = useState<TopicKind>('all')
  const [topicKeywordId, setTopicKeywordId] = useState<string>('')
  const [topicLensId, setTopicLensId] = useState<string>('')
  const [topicValueId, setTopicValueId] = useState<string>('')
  const [polarity, setPolarity] = useState<KeywordPolarity>('positive')
  const [group, setGroup] = useState<TrackGroup>('none')
  const [yearMin, setYearMin] = useState<string>('')
  const [yearMax, setYearMax] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TrackResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load keywords + lenses for the topic picker.
  useEffect(() => {
    if (!vm.keywordList) return
    listKeywords(vm.keywordList.id).then((kws) => {
      setKeywords(kws.filter((k) => k.enabled))
    })
    getKeywordListLenses(vm.keywordList.id).then((declaredIds) => {
      const eligible = vm.lenses.filter(
        (l) => l.type === 'keyword-attached' && declaredIds.includes(l.id)
      )
      setAllLenses(eligible)
      // Pre-load all lens values for the topic-by-lens picker.
      Promise.all(eligible.map(async (l) => [l.id, await listLensValues(l.id)] as const)).then((pairs) => {
        const map: Record<string, LensValue[]> = {}
        for (const [id, values] of pairs) map[id] = values
        setLensValuesByLens(map)
      })
    })
  }, [vm.keywordList, vm.lenses])

  // Filter the keyword list to the selected polarity for the topic picker.
  const keywordsByPolarity = useMemo(() => {
    return keywords.filter((k) => k.polarity === polarity)
  }, [keywords, polarity])

  const handleRun = async () => {
    if (!vm.keywordList) return
    const topic = buildTopic(topicKind, topicKeywordId, topicLensId, topicValueId)
    if (!topic) {
      setError('Pick a topic.')
      return
    }
    if (measure === 'score' && !vm.scoringRule) {
      setError('Score measure needs a scoring rule on the Setup tab.')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      // The Score Evaluator parses the rule definition + decides full/v1 mode;
      // the page just hands it the raw definition for the score measure.
      const out = await computeTrack({
        projectId: vm.project.id,
        keywordListId: vm.keywordList.id,
        topic,
        measure,
        group,
        polarity,
        yearMin: yearMin ? Number(yearMin) : undefined,
        yearMax: yearMax ? Number(yearMax) : undefined,
        scoringRule: measure === 'score' ? vm.scoringRule?.definition : undefined,
      })
      setResult(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  // Empty / error states.
  if (!vm.keywordList) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState title="No keyword list" description="Pick a keyword list on the Setup tab to enable Track." />
      </div>
    )
  }
  if (vm.documentCount === 0) {
    return (
      <div className="px-8 py-10">
        <Header />
        <EmptyState
          title="No documents in this project"
          description="Add documents from the Library on the Setup tab to track topics over time."
        />
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-6xl">
      <Header />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Field label="Measure">
          <Select value={measure} onValueChange={(v) => setMeasure(v as TrackMeasure)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="match-count">Match count</SelectItem>
              <SelectItem value="coverage-percent">Coverage % (docs with ≥1 match)</SelectItem>
              <SelectItem value="score">Score (active rule per year)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Topic">
          <Select value={topicKind} onValueChange={(v) => setTopicKind(v as TopicKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All keywords</SelectItem>
              <SelectItem value="keyword">Single keyword</SelectItem>
              <SelectItem value="lens-value">Lens value (e.g. SDG 13)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Overlay by">
          <Select value={group} onValueChange={(v) => setGroup(v as TrackGroup)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (single line)</SelectItem>
              <SelectItem value="polarity">Polarity (positive vs counter)</SelectItem>
              <SelectItem value="company">Company (one line per company)</SelectItem>
              <SelectItem value="sector">Sector (one line per sector)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Topic-specific sub-pickers */}
      {topicKind === 'keyword' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {group !== 'polarity' && (
            <Field label="Polarity">
              <Select value={polarity} onValueChange={(v) => setPolarity(v as KeywordPolarity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="counter">Counter</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Keyword">
            <Select value={topicKeywordId} onValueChange={setTopicKeywordId}>
              <SelectTrigger><SelectValue placeholder="Pick a keyword" /></SelectTrigger>
              <SelectContent>
                {keywordsByPolarity.map((kw) => (
                  <SelectItem key={kw.id} value={kw.id}>{kw.text}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {topicKind === 'lens-value' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {group !== 'polarity' && (
            <Field label="Polarity">
              <Select value={polarity} onValueChange={(v) => setPolarity(v as KeywordPolarity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="counter">Counter</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Lens">
            <Select value={topicLensId} onValueChange={(v) => { setTopicLensId(v); setTopicValueId('') }}>
              <SelectTrigger><SelectValue placeholder="Pick a lens" /></SelectTrigger>
              <SelectContent>
                {allLenses.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Value">
            <Select value={topicValueId} onValueChange={setTopicValueId} disabled={!topicLensId}>
              <SelectTrigger><SelectValue placeholder={topicLensId ? 'Pick a value' : 'Pick a lens first'} /></SelectTrigger>
              <SelectContent>
                {(lensValuesByLens[topicLensId] ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.displayName ?? v.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {topicKind === 'all' && group !== 'polarity' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Field label="Polarity">
            <Select value={polarity} onValueChange={(v) => setPolarity(v as KeywordPolarity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="counter">Counter</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Field label="Year ≥">
          <Input
            type="number"
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            placeholder="(no lower bound)"
          />
        </Field>
        <Field label="Year ≤">
          <Input
            type="number"
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
            placeholder="(no upper bound)"
          />
        </Field>
        <div className="flex items-end">
          <Button onClick={handleRun} disabled={running} className="gap-2 w-full">
            {running ? (<><Loader2 className="h-4 w-4 animate-spin" /> Running…</>) :
              (<><Play className="h-4 w-4" /> {result ? 'Re-run' : 'Run track'}</>)}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-destructive border border-destructive/30 rounded-md p-3">{error}</div>
      )}

      {result && (
        <ResultsView
          result={result}
          exportable={{
            project: vm.project,
            keywordList: vm.keywordList,
            scoringRule: vm.scoringRule,
            topicLabel: buildTopicLabel(topicKind, topicKeywordId, topicLensId, topicValueId, keywords, allLenses, lensValuesByLens),
            measure,
            group,
            polarity,
            yearMin: yearMin ? Number(yearMin) : undefined,
            yearMax: yearMax ? Number(yearMax) : undefined,
          }}
        />
      )}
    </div>
  )
}

function buildTopicLabel(
  kind: TopicKind,
  keywordId: string,
  lensId: string,
  valueId: string,
  keywords: Keyword[],
  lenses: Lens[],
  lensValuesByLens: Record<string, LensValue[]>
): string {
  if (kind === 'all') return 'All keywords'
  if (kind === 'keyword') {
    const kw = keywords.find((k) => k.id === keywordId)
    return kw ? `Keyword: ${kw.text}` : 'Keyword (unknown)'
  }
  // lens-value
  const lens = lenses.find((l) => l.id === lensId)
  const value = (lensValuesByLens[lensId] ?? []).find((v) => v.id === valueId)
  if (lens && value) {
    return `${lens.name}: ${value.displayName ?? value.value}`
  }
  return 'Lens value (unknown)'
}

function Header() {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-medium tracking-tight">Track</h1>
      <p className="text-muted-foreground italic mt-1">
        How has this topic changed over the years?
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

function buildTopic(
  kind: TopicKind,
  keywordId: string,
  lensId: string,
  valueId: string
): TrackTopic | null {
  if (kind === 'all') return { kind: 'all' }
  if (kind === 'keyword') {
    return keywordId ? { kind: 'keyword', keywordId } : null
  }
  return lensId && valueId ? { kind: 'lens-value', lensId, valueId } : null
}

// ---------------------------------------------------------------------------
// Results view: trend chart + year-unknown callout
// ---------------------------------------------------------------------------

interface ExportInputs {
  project: ProjectViewModel['project']
  keywordList: ProjectViewModel['keywordList']
  scoringRule: ProjectViewModel['scoringRule']
  topicLabel: string
  measure: TrackMeasure
  group: TrackGroup
  polarity: KeywordPolarity
  yearMin?: number
  yearMax?: number
}

function ResultsView({ result, exportable }: { result: TrackResult; exportable: ExportInputs }) {
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const [exporting, setExporting] = useState(false)
  const yearRange = result.yearRange
  // Build a unified year axis for the chart (in case some series are missing
  // certain years).
  const allYears = useMemo(() => {
    const set = new Set<number>()
    for (const s of result.series) for (const p of s.points) set.add(p.year)
    for (const p of result.perDocument) set.add(p.year)
    return Array.from(set).sort((a, b) => a - b)
  }, [result])

  // Recharts data shape: array of objects, one per year, with a key per series.
  const chartData = useMemo(() => {
    return allYears.map((year) => {
      const row: Record<string, number | null> = { year }
      for (const s of result.series) {
        const pt = s.points.find((p) => p.year === year)
        row[s.name] = pt ? pt.value : null
      }
      return row
    })
  }, [allYears, result.series])

  // Per-doc scatter data, separated by polarity so the dots get coloured
  // distinctly. Only populated for score measure.
  const scatterByPolarity = useMemo(() => {
    const positive: Array<{ year: number; value: number; title: string }> = []
    const counter: Array<{ year: number; value: number; title: string }> = []
    for (const p of result.perDocument) {
      const target = p.polarity === 'counter' ? counter : positive
      target.push({ year: p.year, value: p.value, title: p.title })
    }
    return { positive, counter }
  }, [result.perDocument])

  if (allYears.length < 2) {
    return (
      <EmptyState
        title="Not enough years"
        description={
          <>
            Need documents from at least 2 different years to draw a trend.
            Currently {allYears.length} year{allYears.length === 1 ? '' : 's'}{' '}
            in the chart.
            {result.yearUnknown.documentCount > 0 && (
              <> ({result.yearUnknown.documentCount} document{result.yearUnknown.documentCount === 1 ? '' : 's'} have year = null — set their year on the Library page to include them.)</>
            )}
          </>
        }
      />
    )
  }

  const showScatter = result.measure === 'score' && result.perDocument.length > 0

  const handleExport = async () => {
    if (!exportable.keywordList) return
    setExporting(true)
    try {
      const out = await exportPaperBundle(
        {
          project: exportable.project,
          keywordList: exportable.keywordList,
          scoringRule: exportable.scoringRule,
          chartContainer: chartContainerRef.current,
          topicLabel: exportable.topicLabel,
          measure: exportable.measure,
          group: exportable.group,
          polarity: exportable.polarity,
          yearMin: exportable.yearMin,
          yearMax: exportable.yearMax,
        },
        result
      )
      if ('cancelled' in out) {
        // user dismissed the save dialog
      } else {
        toast.success(`Bundle saved to ${out.filePath}`)
      }
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground flex-1">
          Measure: <strong>{measureLabel(result.measure)}</strong>
          {' · '}{result.totalDocs} document{result.totalDocs === 1 ? '' : 's'} contributing
          {yearRange && ` · ${yearRange.min}–${yearRange.max}`}
          {result.scoreFallback && (
            <> · <strong>fallback to v1 Pillar coverage</strong> (Function classification incomplete)</>
          )}
          {showScatter && (
            <> · line = per-year average; dots = individual document scores</>
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          className="gap-2 shrink-0"
          title="Export chart + methodology + data as a ZIP for paper inclusion"
        >
          {exporting ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Exporting…</>
          ) : (
            <><Download className="h-3.5 w-3.5" /> Export paper bundle</>
          )}
        </Button>
      </div>

      {result.yearUnknown.documentCount > 0 && (
        <div className="text-xs border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/20 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5 shrink-0" />
          <div>
            <strong>{result.yearUnknown.documentCount} document{result.yearUnknown.documentCount === 1 ? '' : 's'} have year = null</strong>
            {' '}and aren't shown on this chart ({result.yearUnknown.matchCount} match{result.yearUnknown.matchCount === 1 ? '' : 'es'} not counted).
            {' '}Set their year on the Library page to include them in the trend.
          </div>
        </div>
      )}

      <div ref={chartContainerRef} className="border border-border rounded-md p-4">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="year"
              stroke="currentColor"
              fontSize={11}
              type="number"
              domain={['dataMin', 'dataMax']}
              tickCount={Math.min(allYears.length, 10)}
              allowDecimals={false}
            />
            <YAxis stroke="currentColor" fontSize={11} />
            <Tooltip
              contentStyle={{ fontSize: '12px' }}
              labelFormatter={(v) => `Year ${v}`}
              formatter={(value: number | string, name: string, item) => {
                // For scatter dots, recharts passes the full data row as item.payload.
                const payload = item?.payload as { title?: string } | undefined
                const numeric = typeof value === 'number' ? value : Number(value)
                let formatted: string
                if (result.measure === 'coverage-percent') formatted = `${numeric.toFixed(1)}%`
                else if (result.measure === 'score') formatted = numeric.toFixed(2)
                else formatted = String(value)
                if (payload?.title) {
                  return [`${formatted} (${payload.title})`, name]
                }
                return [formatted, name]
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />

            {/* Per-year average line(s) */}
            {result.series.map((s, i) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={lineColor(s, i, result.series.length)}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}

            {/* Per-document scatter (score measure only) */}
            {showScatter && scatterByPolarity.positive.length > 0 && (
              <Scatter
                name="Documents (positive)"
                data={scatterByPolarity.positive}
                dataKey="value"
                fill="rgba(34, 197, 94, 0.55)"
              />
            )}
            {showScatter && scatterByPolarity.counter.length > 0 && (
              <Scatter
                name="Documents (counter)"
                data={scatterByPolarity.counter}
                dataKey="value"
                fill="rgba(234, 88, 12, 0.55)"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {showScatter && <PerDocumentTable result={result} />}

      <DataTable result={result} />
    </div>
  )
}

function PerDocumentTable({ result }: { result: TrackResult }) {
  // Sort: year asc, then title asc.
  const sorted = useMemo(() => {
    return [...result.perDocument].sort(
      (a, b) => a.year - b.year || a.title.localeCompare(b.title)
    )
  }, [result.perDocument])
  if (sorted.length === 0) return null
  return (
    <details>
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        Per-document scores ({sorted.length} document{sorted.length === 1 ? '' : 's'})
      </summary>
      <div className="mt-2 border border-border rounded-md overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium w-20">Year</th>
              <th className="text-left px-3 py-1.5 font-medium">Document</th>
              <th className="text-right px-3 py-1.5 font-medium w-20">Score</th>
              <th className="text-left px-3 py-1.5 font-medium w-24">Polarity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((p, i) => (
              <tr key={`${p.documentId}-${p.polarity}-${i}`}>
                <td className="px-3 py-1 tabular-nums">{p.year}</td>
                <td className="px-3 py-1 truncate max-w-md">{p.title}</td>
                <td className="px-3 py-1 text-right tabular-nums">{p.value.toFixed(2)}</td>
                <td className="px-3 py-1 text-muted-foreground capitalize">{p.polarity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function measureLabel(m: TrackMeasure): string {
  if (m === 'match-count') return 'Match count'
  if (m === 'coverage-percent') return 'Coverage %'
  return 'Score'
}

/**
 * Line colour. Polarity grouping uses semantic colours (green positive,
 * orange counter); company/sector grouping cycles through a palette
 * indexed by series order so lines stay visually distinct even with
 * many companies. Single-series uses positive's green.
 */
const SERIES_PALETTE = [
  'rgb(34, 197, 94)',    // green-500
  'rgb(59, 130, 246)',   // blue-500
  'rgb(234, 88, 12)',    // orange-600
  'rgb(168, 85, 247)',   // purple-500
  'rgb(234, 179, 8)',    // yellow-500
  'rgb(220, 38, 38)',    // red-600
  'rgb(20, 184, 166)',   // teal-500
  'rgb(147, 51, 234)',   // violet-600
  'rgb(2, 132, 199)',    // sky-600
  'rgb(132, 204, 22)',   // lime-500
]

interface LineSeries {
  name: string
  polarity?: 'positive' | 'counter'
}

function lineColor(s: LineSeries, index: number, totalSeries: number): string {
  // Polarity overlay (exactly two lines, named "Positive" and "Counter")
  // — keep the semantic colour mapping.
  if (totalSeries === 2 && (s.name === 'Positive' || s.name === 'Counter')) {
    return s.polarity === 'counter' ? 'rgb(234, 88, 12)' : 'rgb(34, 197, 94)'
  }
  if (totalSeries === 1) return SERIES_PALETTE[0]
  // Company / sector / many-line case — palette by index.
  return SERIES_PALETTE[index % SERIES_PALETTE.length]
}

function DataTable({ result }: { result: TrackResult }) {
  const allYears = useMemo(() => {
    const set = new Set<number>()
    for (const s of result.series) for (const p of s.points) set.add(p.year)
    return Array.from(set).sort((a, b) => a - b)
  }, [result])

  return (
    <details>
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        Underlying data ({allYears.length} years × {result.series.length} series)
      </summary>
      <div className="mt-2 border border-border rounded-md overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium">Year</th>
              {result.series.map((s) => (
                <th key={s.name} className="text-right px-3 py-1.5 font-medium">
                  {s.name}
                </th>
              ))}
              <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Docs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allYears.map((year) => (
              <tr key={year}>
                <td className="px-3 py-1 tabular-nums">{year}</td>
                {result.series.map((s) => {
                  const pt = s.points.find((p) => p.year === year)
                  return (
                    <td key={s.name} className="px-3 py-1 text-right tabular-nums">
                      {pt ? formatValue(pt.value, result.measure) : '—'}
                    </td>
                  )
                })}
                <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
                  {result.series[0]?.points.find((p) => p.year === year)?.documentCount ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function formatValue(value: number, measure: TrackMeasure): string {
  if (measure === 'coverage-percent') return `${value.toFixed(1)}%`
  if (measure === 'score') return value.toFixed(2)
  return value.toLocaleString()
}
