import { useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { GapDataset, GapLevel, GapPoint } from '@/services/gap'

const DOC_COLORS = ['#16a085', '#e67e22', '#8e44ad', '#2980b9', '#c0392b', '#27ae60', '#f39c12', '#2c3e50']

interface Props {
  data: GapDataset
  level: GapLevel
  onLevelChange: (l: GapLevel) => void
}

export function GapScatter({ data, level, onLevelChange }: Props) {
  const points = data.byLevel[level]
  const docColor = useMemo(() => {
    const ids = [...new Set(points.map((p) => p.documentId))]
    return new Map(ids.map((id, i) => [id, DOC_COLORS[i % DOC_COLORS.length]]))
  }, [points])

  const byDoc = useMemo(() => {
    const m = new Map<string, GapPoint[]>()
    for (const p of points) { const a = m.get(p.documentId) ?? []; a.push(p); m.set(p.documentId, a) }
    return [...m.entries()]
  }, [points])

  const levels: GapLevel[] = data.singleDocument ? ['section', 'keyword'] : ['document', 'section', 'keyword']

  return (
    <div>
      <div className="flex gap-2 mb-3">
        {levels.map((l) => (
          <button key={l} type="button" onClick={() => onLevelChange(l)}
            className={`text-sm px-3 py-1 rounded-full border ${l === level ? 'border-foreground text-foreground' : 'border-border text-muted-foreground'}`}>
            {l === 'document' ? 'Document' : l === 'section' ? 'Section' : 'Keyword (hits only)'}
          </button>
        ))}
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 z-10">
          <span className="absolute left-12 top-3 text-[11px] font-medium text-[#c0392b]">Performative</span>
          <span className="absolute right-8 top-3 text-[11px] font-medium text-[#27ae60]">Genuine</span>
          <span className="absolute left-12 bottom-10 text-[11px] font-medium text-[#7f8c8d]">Honest gaps</span>
          <span className="absolute right-8 bottom-10 text-[11px] font-medium text-[#2980b9]">Understated</span>
        </div>
        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="substance" name="Substance" domain={[-1, 1]}
              label={{ value: 'substance (delivery →)', position: 'bottom' }} />
            <YAxis type="number" dataKey="tone" name="Tone" domain={[-1, 1]}
              label={{ value: 'tone', angle: -90, position: 'left' }} />
            <ZAxis type="number" dataKey="weight" range={[40, 400]} name="matches" />
            <ReferenceLine segment={[{ x: -1, y: -1 }, { x: 1, y: 1 }]} stroke="#bbb" strokeDasharray="5 5" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as GapPoint | undefined
                if (!p) return null
                return (
                  <div className="bg-card border border-border rounded px-2 py-1 text-xs">
                    <div className="font-medium">{p.label}</div>
                    <div>tone {p.tone.toFixed(2)} · substance {p.substance.toFixed(2)}</div>
                    <div>gap {p.gap >= 0 ? '+' : ''}{p.gap.toFixed(2)}{p.gap > 0.4 ? ' — performative' : ''}</div>
                  </div>
                )
              }} />
            {byDoc.map(([docId, pts]) => (
              <Scatter key={docId} data={pts} fill={docColor.get(docId)} fillOpacity={0.75} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Top-left (high tone, low substance) = performative. Distance above the dashed diagonal = greenwashing intensity.
      </p>
    </div>
  )
}
