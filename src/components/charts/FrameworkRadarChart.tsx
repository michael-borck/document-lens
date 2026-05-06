import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'

export interface RadarDataPoint {
  category: string
  fullMark?: number
  [documentOrFramework: string]: string | number | undefined
}

interface FrameworkRadarChartProps {
  data: RadarDataPoint[]
  dataKeys: Array<{ key: string; name: string; color: string }>
  height?: number
  showLegend?: boolean
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
]

export function FrameworkRadarChart({
  data,
  dataKeys,
  height = 400,
  showLegend = true,
}: FrameworkRadarChartProps) {
  if (data.length === 0 || dataKeys.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No data to display
      </div>
    )
  }

  // Calculate fullMark if not provided
  const processedData = data.map((d) => {
    if (d.fullMark) return d
    const values = dataKeys.map((dk) => Number(d[dk.key]) || 0)
    return { ...d, fullMark: Math.max(...values) * 1.2 }
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={processedData}>
        <PolarGrid strokeOpacity={0.3} />
        <PolarAngleAxis
          dataKey="category"
          tick={{ fontSize: 11 }}
          tickFormatter={(value: string) =>
            value.length > 15 ? value.substring(0, 13) + '...' : value
          }
        />
        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 10 }} />
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const category = payload[0]?.payload?.category
              return (
                <div className="bg-popover border rounded-lg shadow-lg p-3">
                  <p className="font-medium mb-2">{category}</p>
                  {payload.map((entry, index) => (
                    <p
                      key={index}
                      className="text-sm"
                      style={{ color: entry.color }}
                    >
                      {entry.name}: <span className="font-medium">{entry.value}</span>
                    </p>
                  ))}
                </div>
              )
            }
            return null
          }}
        />
        {dataKeys.map((dk, index) => (
          <Radar
            key={dk.key}
            name={dk.name}
            dataKey={dk.key}
            stroke={dk.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
            fill={dk.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
            fillOpacity={0.2}
            strokeWidth={2}
          />
        ))}
        {showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </RadarChart>
    </ResponsiveContainer>
  )
}
