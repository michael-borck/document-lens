import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * The polarity filter every workflow page inlined. Standardised on
 * `positive | counter | both` (the IA vocabulary) — replaces Read's outlier
 * `all`. Renders only the Select; pages wrap it in their own labelled Field.
 */
export type Polarity = 'positive' | 'counter' | 'both'

const LABELS: Record<Polarity, string> = {
  both: 'Both',
  positive: 'Positive',
  counter: 'Counter',
}

export interface PolaritySelectorProps {
  value: Polarity
  onChange: (value: Polarity) => void
  /** Which options to offer, in order. Defaults to all three. */
  options?: Polarity[]
  /** Tailwind width class for the trigger. */
  width?: string
}

export function PolaritySelector({
  value,
  onChange,
  options = ['both', 'positive', 'counter'],
  width = 'w-44',
}: PolaritySelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Polarity)}>
      <SelectTrigger className={width}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {LABELS[opt]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
