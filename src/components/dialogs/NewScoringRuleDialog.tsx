import { useEffect, useState } from 'react'
import { BarChart2, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { listAxes, listAxisValues } from '@/services/axes'
import { createScoringRule } from '@/services/scoring-rules'
import type { Axis, AxisValue, ScoringRule } from '@/types/data'

type Pattern = 'coverage-count' | 'cross-coverage'

interface NewScoringRuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (rule: ScoringRule) => void
}

export function NewScoringRuleDialog({ open, onOpenChange, onCreated }: NewScoringRuleDialogProps) {
  const [pattern, setPattern] = useState<Pattern | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [allAxes, setAllAxes] = useState<Axis[]>([])

  // Coverage-count state
  const [categoryAxisId, setCategoryAxisId] = useState('')
  const [categoryValues, setCategoryValues] = useState<AxisValue[]>([])

  // Cross-coverage state
  const [layerAxisId, setLayerAxisId] = useState('')
  const [layerValues, setLayerValues] = useState<AxisValue[]>([])
  const [requiredLayerIds, setRequiredLayerIds] = useState<Set<string>>(new Set())
  const [subjectAxisId, setSubjectAxisId] = useState('')
  const [subjectValues, setSubjectValues] = useState<AxisValue[]>([])

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    listAxes().then(setAllAxes)
  }, [open])

  useEffect(() => {
    if (!categoryAxisId) { setCategoryValues([]); return }
    listAxisValues(categoryAxisId).then(setCategoryValues)
  }, [categoryAxisId])

  useEffect(() => {
    if (!layerAxisId) { setLayerValues([]); setRequiredLayerIds(new Set()); return }
    listAxisValues(layerAxisId).then((values) => {
      setLayerValues(values)
      setRequiredLayerIds(new Set(values.map((v) => v.id)))
    })
  }, [layerAxisId])

  useEffect(() => {
    if (!subjectAxisId) { setSubjectValues([]); return }
    listAxisValues(subjectAxisId).then(setSubjectValues)
  }, [subjectAxisId])

  const reset = () => {
    setPattern(null)
    setName('')
    setDescription('')
    setCategoryAxisId('')
    setLayerAxisId('')
    setSubjectAxisId('')
    setRequiredLayerIds(new Set())
    setError(null)
    setCreating(false)
  }

  const toggleLayer = (id: string) => {
    const next = new Set(requiredLayerIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRequiredLayerIds(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Give the rule a name.'); return }

    if (pattern === 'coverage-count') {
      if (!categoryAxisId) { setError('Pick a Categories axis.'); return }
      if (categoryValues.length === 0) { setError('The selected axis has no values yet. Add values to it first.'); return }
    } else {
      if (!layerAxisId) { setError('Pick a Layers axis.'); return }
      if (requiredLayerIds.size === 0) { setError('Select at least one required layer value.'); return }
      if (!subjectAxisId) { setError('Pick a Subjects axis.'); return }
      if (subjectValues.length === 0) { setError('The Subjects axis has no values yet. Add values to it first.'); return }
    }

    setCreating(true)
    setError(null)

    try {
      let definition: Record<string, unknown>
      let outputLevels: Array<{ value: number; label: string; description: string }>

      if (pattern === 'coverage-count') {
        // categoryLensId DB key preserved for backwards-compatible scoring rule definitions
        definition = { type: 'coverage-count', version: 1, categoryLensId: categoryAxisId }
        outputLevels = Array.from({ length: categoryValues.length + 1 }, (_, score) => ({
          value: score,
          label: `Level ${score}`,
          description: score === 0
            ? 'No categories covered.'
            : score === categoryValues.length
              ? `All ${categoryValues.length} categories covered.`
              : `${score} of ${categoryValues.length} categories covered.`,
        }))
      } else {
        const requiredLayerStrings = layerValues
          .filter((v) => requiredLayerIds.has(v.id))
          .map((v) => v.value)
        // layerLensId / subjectLensId DB keys preserved for backwards-compatible scoring rule definitions
        definition = {
          type: 'cross-coverage',
          version: 1,
          layerLensId: layerAxisId,
          subjectLensId: subjectAxisId,
          requiredLayers: requiredLayerStrings,
        }
        outputLevels = Array.from({ length: subjectValues.length + 1 }, (_, score) => ({
          value: score,
          label: `Level ${score}`,
          description: score === 0
            ? 'No subjects cover all required layers.'
            : score === subjectValues.length
              ? `All ${subjectValues.length} subjects cover all required layers.`
              : `${score} of ${subjectValues.length} subjects cover all required layers.`,
        }))
      }

      const rule = await createScoringRule({
        name: name.trim(),
        description: description.trim() || undefined,
        isBuiltin: false,
        definition,
        outputLevels,
      })
      onCreated(rule)
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scoring rule')
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New scoring rule</DialogTitle>
            <DialogDescription>
              Choose a scoring pattern, then configure which axes it uses.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4 max-h-[65vh] overflow-y-auto pr-1">

            {/* Pattern picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Scoring pattern</label>
              <div className="grid grid-cols-2 gap-3">
                <PatternCard
                  selected={pattern === 'coverage-count'}
                  onClick={() => setPattern('coverage-count')}
                  icon={<BarChart2 className="h-5 w-5" />}
                  title="Coverage Count"
                  description="How many of your categories does this document cover? Score = 0 to N. Good for flat frameworks like Triple Bottom Line or Balanced Scorecard."
                />
                <PatternCard
                  selected={pattern === 'cross-coverage'}
                  onClick={() => setPattern('cross-coverage')}
                  icon={<Layers className="h-5 w-5" />}
                  title="Cross Coverage"
                  description="For each Subject, does it cover ALL required Layers? Score = count of Subjects that pass. Good for layered frameworks like the Wedding Cake model."
                />
              </div>
            </div>

            {pattern && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="rule-name" className="text-sm font-medium">Rule name</label>
                  <Input
                    id="rule-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={pattern === 'coverage-count' ? 'e.g. Triple Bottom Line' : 'e.g. NIST CSF Score'}
                    autoFocus
                    disabled={creating}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="rule-description" className="text-sm font-medium">
                    Description <span className="text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <Input
                    id="rule-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this rule measuring?"
                    disabled={creating}
                  />
                </div>

                {pattern === 'coverage-count' && (
                  <CoverageCountFields
                    allAxes={allAxes}
                    categoryAxisId={categoryAxisId}
                    categoryValues={categoryValues}
                    onCategoryAxisChange={setCategoryAxisId}
                    disabled={creating}
                  />
                )}

                {pattern === 'cross-coverage' && (
                  <CrossCoverageFields
                    allAxes={allAxes}
                    layerAxisId={layerAxisId}
                    layerValues={layerValues}
                    requiredLayerIds={requiredLayerIds}
                    subjectAxisId={subjectAxisId}
                    subjectValues={subjectValues}
                    onLayerAxisChange={setLayerAxisId}
                    onToggleLayer={toggleLayer}
                    onSubjectAxisChange={setSubjectAxisId}
                    disabled={creating}
                  />
                )}
              </>
            )}

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={!pattern || creating}>
              {creating ? 'Creating…' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Pattern card
// ---------------------------------------------------------------------------

function PatternCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-left p-4 rounded-md border transition-colors space-y-2',
        selected
          ? 'border-foreground bg-muted/40 ring-1 ring-foreground/30'
          : 'border-border hover:border-foreground/40 hover:bg-muted/20'
      )}
    >
      <div className="flex items-center gap-2 font-medium text-sm">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Coverage-count config fields
// ---------------------------------------------------------------------------

function CoverageCountFields({
  allAxes,
  categoryAxisId,
  categoryValues,
  onCategoryAxisChange,
  disabled,
}: {
  allAxes: Axis[]
  categoryAxisId: string
  categoryValues: AxisValue[]
  onCategoryAxisChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4 border border-border rounded-md p-4 bg-muted/10">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categories axis</p>
        <p className="text-xs text-muted-foreground">
          Each value in this axis is a category. The score counts how many
          are covered by keyword matches. Create the axis and its values in{' '}
          <strong>Axes</strong> first.
        </p>
      </div>
      <Select value={categoryAxisId} onValueChange={onCategoryAxisChange} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder="Pick an axis" /></SelectTrigger>
        <SelectContent>
          {allAxes.map((a) => (
            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {categoryValues.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {categoryValues.length} categories: {categoryValues.map((v) => v.displayName ?? v.value).join(' · ')}.{' '}
          Score will be <strong>0 to {categoryValues.length}</strong>.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cross-coverage config fields
// ---------------------------------------------------------------------------

function CrossCoverageFields({
  allAxes,
  layerAxisId,
  layerValues,
  requiredLayerIds,
  subjectAxisId,
  subjectValues,
  onLayerAxisChange,
  onToggleLayer,
  onSubjectAxisChange,
  disabled,
}: {
  allAxes: Axis[]
  layerAxisId: string
  layerValues: AxisValue[]
  requiredLayerIds: Set<string>
  subjectAxisId: string
  subjectValues: AxisValue[]
  onLayerAxisChange: (id: string) => void
  onToggleLayer: (id: string) => void
  onSubjectAxisChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Layers */}
      <div className="space-y-3 border border-border rounded-md p-4 bg-muted/10">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Layers axis</p>
          <p className="text-xs text-muted-foreground">
            The categories that must <strong>all</strong> be covered for a Subject to pass.
            In the Wedding Cake model this is Biosphere / Society / Economy.
          </p>
        </div>
        <Select value={layerAxisId} onValueChange={onLayerAxisChange} disabled={disabled}>
          <SelectTrigger><SelectValue placeholder="Pick an axis" /></SelectTrigger>
          <SelectContent>
            {allAxes.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {layerValues.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Which layer values are required? (default: all)</p>
            <div className="border border-border rounded-md divide-y divide-border max-h-36 overflow-y-auto">
              {layerValues.map((v) => (
                <label key={v.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                  <Checkbox
                    checked={requiredLayerIds.has(v.id)}
                    onCheckedChange={() => onToggleLayer(v.id)}
                  />
                  <span className="text-sm">{v.displayName ?? v.value}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Subjects */}
      <div className="space-y-3 border border-border rounded-md p-4 bg-muted/10">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subjects axis</p>
          <p className="text-xs text-muted-foreground">
            The things being evaluated — how many cover all required layers?
            In the Wedding Cake model this is Teaching / Research / Engagement / Operations.
            Subjects must be classified per-section via the Function Classification step.
          </p>
        </div>
        <Select value={subjectAxisId} onValueChange={onSubjectAxisChange} disabled={disabled}>
          <SelectTrigger><SelectValue placeholder="Pick an axis" /></SelectTrigger>
          <SelectContent>
            {allAxes.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {subjectValues.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {subjectValues.length} subjects: {subjectValues.map((v) => v.displayName ?? v.value).join(' · ')}.{' '}
            Score will be <strong>0 to {subjectValues.length}</strong>.
          </p>
        )}
      </div>
    </div>
  )
}
