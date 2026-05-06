import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export interface TrendDataPoint {
  year: number
  [keyword: string]: number
}

interface TrendLineChartProps {
  data: TrendDataPoint[]
  keywords: string[]
  height?: number
  showGrid?: boolean
  showLegend?: boolean
}

const COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
]

export function TrendLineChart({
  data,
  keywords,
  height = 400,
  showGrid = true,
  showLegend = true,
}: TrendLineChartProps) {
  if (data.length === 0 || keywords.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No data to display
      </div>
    )
  }

  // Sort data by year
  const sortedData = [...data].sort((a, b) => a.year - b.year)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={sortedData}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
        <XAxis
          dataKey="year"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => String(value)}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className="bg-popover border rounded-lg shadow-lg p-3">
                  <p className="font-medium mb-2">Year: {label}</p>
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
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) =>
              value.length > 15 ? value.substring(0, 13) + '...' : value
            }
          />
        )}
        {keywords.map((keyword, index) => (
          <Line
            key={keyword}
            type="monotone"
            dataKey={keyword}
            name={keyword}
            stroke={COLORS[index % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
