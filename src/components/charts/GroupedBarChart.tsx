import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export interface GroupedBarDataPoint {
  name: string
  [key: string]: string | number
}

interface GroupedBarChartProps {
  data: GroupedBarDataPoint[]
  dataKeys: Array<{ key: string; name: string; color: string }>
  height?: number
  showGrid?: boolean
  showLegend?: boolean
}

const DEFAULT_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
]

export function GroupedBarChart({
  data,
  dataKeys,
  height = 400,
  showGrid = true,
  showLegend = true,
}: GroupedBarChartProps) {
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 60,
        }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.3} />}
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={60}
          interval={0}
          tickFormatter={(value: string) =>
            value.length > 15 ? value.substring(0, 13) + '...' : value
          }
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className="bg-popover border rounded-lg shadow-lg p-3">
                  <p className="font-medium mb-2">{label}</p>
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
        {showLegend && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />}
        {dataKeys.map((dk, index) => (
          <Bar
            key={dk.key}
            dataKey={dk.key}
            name={dk.name}
            fill={dk.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
