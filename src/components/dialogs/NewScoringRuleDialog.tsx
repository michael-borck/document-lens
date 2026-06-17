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
import { listLenses, listLensValues } from '@/services/lenses'
import { createScoringRule } from '@/services/scoring-rules'
import type { Lens, LensValue, ScoringRule } from '@/types/data'

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
  const [allLenses, setAllLenses] = useState<Lens[]>([])

  // Coverage-count state
  const [categoryLensId, setCategoryLensId] = useState('')
  const [categoryValues, setCategoryValues] = useState<LensValue[]>([])

  // Cross-coverage state
  const [layerLensId, setLayerLensId] = useState('')
  const [layerValues, setLayerValues] = useState<LensValue[]>([])
  const [requiredLayerIds, setRequiredLayerIds] = useState<Set<string>>(new Set())
  const [subjectLensId, setSubjectLensId] = useState('')
  const [subjectValues, setSubjectValues] = useState<LensValue[]>([])

  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    listLenses().then(setAllLenses)
  }, [open])

  useEffect(() => {
    if (!categoryLensId) { setCategoryValues([]); return }
    listLensValues(categoryLensId).then(setCategoryValues)
  }, [categoryLensId])

  useEffect(() => {
    if (!layerLensId) { setLayerValues([]); setRequiredLayerIds(new Set()); return }
    listLensValues(layerLensId).then((values) => {
      setLayerValues(values)
      setRequiredLayerIds(new Set(values.map((v) => v.id)))
    })
  }, [layerLensId])

  useEffect(() => {
    if (!subjectLensId) { setSubjectValues([]); return }
    listLensValues(subjectLensId).then(setSubjectValues)
  }, [subjectLensId])

  const reset = () => {
    setPattern(null)
    setName('')
    setDescription('')
    setCategoryLensId('')
    setLayerLensId('')
    setSubjectLensId('')
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
      if (!categoryLensId) { setError('Pick a Categories lens.'); return }
      if (categoryValues.length === 0) { setError('The selected lens has no values yet. Add values to it first.'); return }
    } else {
      if (!layerLensId) { setError('Pick a Layers lens.'); return }
      if (requiredLayerIds.size === 0) { setError('Select at least one required layer value.'); return }
      if (!subjectLensId) { setError('Pick a Subjects lens.'); return }
      if (subjectValues.length === 0) { setError('The Subjects lens has no values yet. Add values to it first.'); return }
    }

    setCreating(true)
    setError(null)

    try {
      let definition: Record<string, unknown>
      let outputLevels: Array<{ value: number; label: string; description: string }>

      if (pattern === 'coverage-count') {
        definition = { type: 'coverage-count', version: 1, categoryLensId }
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
        definition = {
          type: 'cross-coverage',
          version: 1,
          layerLensId,
          subjectLensId,
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
              Choose a scoring pattern, then configure which lenses it uses.
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
                    allLenses={allLenses}
                    categoryLensId={categoryLensId}
                    categoryValues={categoryValues}
                    onCategoryLensChange={setCategoryLensId}
                    disabled={creating}
                  />
                )}

                {pattern === 'cross-coverage' && (
                  <CrossCoverageFields
                    allLenses={allLenses}
                    layerLensId={layerLensId}
                    layerValues={layerValues}
                    requiredLayerIds={requiredLayerIds}
                    subjectLensId={subjectLensId}
                    subjectValues={subjectValues}
                    onLayerLensChange={setLayerLensId}
                    onToggleLayer={toggleLayer}
                    onSubjectLensChange={setSubjectLensId}
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
  allLenses,
  categoryLensId,
  categoryValues,
  onCategoryLensChange,
  disabled,
}: {
  allLenses: Lens[]
  categoryLensId: string
  categoryValues: LensValue[]
  onCategoryLensChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4 border border-border rounded-md p-4 bg-muted/10">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Categories lens</p>
        <p className="text-xs text-muted-foreground">
          Each value in this lens is a category. The score counts how many
          are covered by keyword matches. Create the lens and its values in{' '}
          <strong>Lenses</strong> first.
        </p>
      </div>
      <Select value={categoryLensId} onValueChange={onCategoryLensChange} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder="Pick a lens" /></SelectTrigger>
        <SelectContent>
          {allLenses.map((l) => (
            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
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
  allLenses,
  layerLensId,
  layerValues,
  requiredLayerIds,
  subjectLensId,
  subjectValues,
  onLayerLensChange,
  onToggleLayer,
  onSubjectLensChange,
  disabled,
}: {
  allLenses: Lens[]
  layerLensId: string
  layerValues: LensValue[]
  requiredLayerIds: Set<string>
  subjectLensId: string
  subjectValues: LensValue[]
  onLayerLensChange: (id: string) => void
  onToggleLayer: (id: string) => void
  onSubjectLensChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-4">
      {/* Layers */}
      <div className="space-y-3 border border-border rounded-md p-4 bg-muted/10">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Layers lens</p>
          <p className="text-xs text-muted-foreground">
            The categories that must <strong>all</strong> be covered for a Subject to pass.
            In the Wedding Cake model this is Biosphere / Society / Economy.
          </p>
        </div>
        <Select value={layerLensId} onValueChange={onLayerLensChange} disabled={disabled}>
          <SelectTrigger><SelectValue placeholder="Pick a lens" /></SelectTrigger>
          <SelectContent>
            {allLenses.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
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
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Subjects lens</p>
          <p className="text-xs text-muted-foreground">
            The things being evaluated — how many cover all required layers?
            In the Wedding Cake model this is Teaching / Research / Engagement / Operations.
            Subjects must be classified per-section via the Function Classification step.
          </p>
        </div>
        <Select value={subjectLensId} onValueChange={onSubjectLensChange} disabled={disabled}>
          <SelectTrigger><SelectValue placeholder="Pick a lens" /></SelectTrigger>
          <SelectContent>
            {allLenses.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
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
