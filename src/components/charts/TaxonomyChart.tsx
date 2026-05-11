/**
 * TaxonomyChart Component
 *
 * Visualizes hierarchical keyword analysis results using:
 * - Treemap: sized by match count, colored by tier
 * - Stacked bar: per-document breakdown by tier categories
 */

import {
  Treemap,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import type { TierAggregation } from '@/services/analysis'
import type { HierarchicalSearchResult } from '@/services/analysis'

const PILLAR_COLORS: Record<string, string> = {
  Environmental: '#10b981',
  Social: '#3b82f6',
  Economic: '#f59e0b',
  Governance: '#8b5cf6',
}

const TIER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#ec4899',
  '#14b8a6', '#a855f7', '#84cc16', '#e11d48',
]

function getCategoryColor(name: string, index: number): string {
  return PILLAR_COLORS[name] || TIER_COLORS[index % TIER_COLORS.length]
}

// ---- Treemap ----

export interface TaxonomyTreemapProps {
  tierAggregation: TierAggregation
  tierName: string
  height?: number
}

interface TreemapDataItem {
  name: string
  size: number
  matches: number
  coverage: number
  keywords: number
  totalKeywords: number
  fill: string
}

// Minimal local types for Recharts custom-component callbacks. Local to
// avoid coupling to recharts' internal type names (which change between
// versions); only the fields we actually read are listed.
interface TreemapTooltipProps {
  active?: boolean
  payload?: Array<{ payload: TreemapDataItem }>
}

// All fields are optional because Recharts injects them at render time —
// our component is passed as <TreemapContent /> with empty initial props
// and Recharts clones it with the per-cell layout values.
interface TreemapContentProps {
  x?: number
  y?: number
  width?: number
  height?: number
  name?: string
  matches?: number
  fill?: string
}

const TreemapTooltipContent = ({ active, payload }: TreemapTooltipProps) => {
  if (!active || !payload?.[0]) return null
  const data = payload[0].payload
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <div className="font-medium">{data.name}</div>
      <div className="text-muted-foreground mt-1 space-y-0.5">
        <div>{data.matches} matches</div>
        <div>{data.keywords} of {data.totalKeywords} keywords found</div>
        <div>{Math.round(data.coverage * 100)}% coverage</div>
      </div>
    </div>
  )
}

const TreemapContent = (props: TreemapContentProps) => {
  const { x, y, width, height, name, matches } = props
  if (
    x === undefined || y === undefined ||
    width === undefined || height === undefined ||
    width < 40 || height < 30
  ) {
    return null
  }

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={props.fill}
        fillOpacity={0.85}
        stroke="#fff"
        strokeWidth={2}
        rx={4}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 - 8}
        textAnchor="middle"
        fill="#fff"
        fontSize={width > 100 ? 13 : 11}
        fontWeight="bold"
      >
        {width > 80 ? name : name?.substring(0, 8) + '...'}
      </text>
      <text
        x={x + width / 2}
        y={y + height / 2 + 10}
        textAnchor="middle"
        fill="#fff"
        fontSize={11}
        opacity={0.9}
      >
        {matches}
      </text>
    </g>
  )
}

export function TaxonomyTreemap({ tierAggregation, tierName: _tierName, height = 400 }: TaxonomyTreemapProps) {
  const data: TreemapDataItem[] = Object.entries(tierAggregation)
    .filter(([_, agg]) => agg.matchCount > 0)
    .map(([name, agg], i) => ({
      name,
      size: agg.matchCount,
      matches: agg.matchCount,
      coverage: agg.coverage,
      keywords: agg.keywordCount,
      totalKeywords: agg.totalKeywords,
      fill: getCategoryColor(name, i),
    }))

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        No matches to visualize
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap
        data={data}
        dataKey="size"
        aspectRatio={4 / 3}
        content={<TreemapContent />}
      >
        <Tooltip content={<TreemapTooltipContent />} />
      </Treemap>
    </ResponsiveContainer>
  )
}

// ---- Stacked Bar (per-document tier breakdown) ----

export interface TaxonomyStackedBarProps {
  hierarchicalResults: HierarchicalSearchResult
  tierName: string
  height?: number
  maxDocuments?: number
}

export function TaxonomyStackedBar({
  hierarchicalResults,
  tierName,
  height = 450,
  maxDocuments = 12,
}: TaxonomyStackedBarProps) {
  const { documentTiers, overallTiers } = hierarchicalResults
  const categories = Object.keys(overallTiers[tierName] || {})

  // Build data: one bar per document, stacked by tier categories
  const data = documentTiers
    .filter(d => {
      const tierAgg = d.tiers[tierName]
      if (!tierAgg) return false
      return Object.values(tierAgg).some(a => a.matchCount > 0)
    })
    .slice(0, maxDocuments)
    .map(d => {
      const point: Record<string, string | number> = {
        name: d.documentName.length > 25
          ? d.documentName.substring(0, 23) + '...'
          : d.documentName,
      }
      const tierAgg = d.tiers[tierName]
      for (const cat of categories) {
        point[cat] = tierAgg?.[cat]?.matchCount || 0
      }
      return point
    })

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        No document data to visualize
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="name"
          angle={-45}
          textAnchor="end"
          interval={0}
          fontSize={11}
          height={80}
        />
        <YAxis fontSize={12} />
        <Tooltip />
        <Legend />
        {categories.map((cat, i) => (
          <Bar
            key={cat}
            dataKey={cat}
            stackId="tier"
            fill={getCategoryColor(cat, i)}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
