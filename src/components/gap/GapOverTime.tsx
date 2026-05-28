import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import type { GapDataset } from '@/services/gap'
import { ChartContainer } from '@/components/charts/ChartContainer'

export function GapOverTime({ data }: { data: GapDataset }) {
  if (!data.overTimeAvailable) {
    return (
      <p className="text-sm text-muted-foreground italic border border-dashed border-border rounded-md p-4">
        Gap-over-time needs documents spanning at least two years. Add years to more documents (Library) to see the trend.
      </p>
    )
  }
  return (
    <ChartContainer height={240}>
      <LineChart data={data.overTime} margin={{ top: 16, right: 30, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis domain={[-2, 2]} label={{ value: 'avg gap', angle: -90, position: 'left' }} />
        <ReferenceLine y={0} stroke="#bbb" />
        <Tooltip formatter={(v: number) => [(v as number).toFixed(2), 'avg gap']} />
        <Line type="monotone" dataKey="avgGap" stroke="#c0392b" strokeWidth={2} dot />
      </LineChart>
    </ChartContainer>
  )
}
