import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

export interface KeywordBarData {
  keyword: string
  count: number
  documentName?: string
}

interface KeywordBarChartProps {
  data: KeywordBarData[]
  height?: number
  orientation?: 'horizontal' | 'vertical'
  showGrid?: boolean
  color?: string
  onBarClick?: (keyword: string) => void
}

const COLORS = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
]

export function KeywordBarChart({
  data,
  height = 400,
  orientation = 'vertical',
  showGrid = true,
  color,
  onBarClick,
}: KeywordBarChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No data to display
      </div>
    )
  }

  const isHorizontal = orientation === 'horizontal'

  // Truncate long keywords for display
  const displayData = data.map((d) => ({
    ...d,
    displayKeyword:
      d.keyword.length > 20 ? d.keyword.substring(0, 18) + '...' : d.keyword,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={displayData}
        layout={isHorizontal ? 'vertical' : 'horizontal'}
        margin={{
          top: 5,
          right: 30,
          left: isHorizontal ? 100 : 20,
          bottom: isHorizontal ? 5 : 80,
        }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
        {isHorizontal ? (
          <>
            <XAxis type="number" />
            <YAxis
              dataKey="displayKeyword"
              type="category"
              width={90}
              tick={{ fontSize: 12 }}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey="displayKeyword"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={80}
              interval={0}
            />
            <YAxis />
          </>
        )}
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const item = payload[0].payload as KeywordBarData
              return (
                <div className="bg-popover border rounded-lg shadow-lg p-3">
                  <p className="font-medium">{item.keyword}</p>
                  <p className="text-sm text-muted-foreground">
                    Count: <span className="font-medium">{item.count}</span>
                  </p>
                  {item.documentName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.documentName}
                    </p>
                  )}
                </div>
              )
            }
            return null
          }}
        />
        <Bar
          dataKey="count"
          radius={[4, 4, 0, 0]}
          cursor={onBarClick ? 'pointer' : 'default'}
          onClick={(data) => onBarClick?.(data.keyword)}
        >
          {displayData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={color || COLORS[index % COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
