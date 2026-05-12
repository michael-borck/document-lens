import { useEffect, useState } from 'react'
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
import { listLenses, listLensValues } from '@/services/lenses'
import { createScoringRule } from '@/services/scoring-rules'
import type { Lens, LensValue, ScoringRule } from '@/types/data'

interface NewScoringRuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (rule: ScoringRule) => void
}

/**
 * Form-based editor for creating a Wedding Cake-style scoring rule.
 *
 * The rule logic is fixed (count Function values that deliver SDGs in
 * all required Pillars at the same time) — what the form lets you
 * choose is which lenses to use as the pillar / function axes, and
 * which pillar values are "required". Output levels are derived from
 * the function axis's value count.
 *
 * Other rule types (weighted sums, custom DSLs) aren't supported in
 * this editor yet — IA-2 says form-based UI is the v1 target; richer
 * rule types come later.
 */
export function NewScoringRuleDialog({ open, onOpenChange, onCreated }: NewScoringRuleDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [allLenses, setAllLenses] = useState<Lens[]>([])
  const [pillarLensId, setPillarLensId] = useState<string>('')
  const [pillarValues, setPillarValues] = useState<LensValue[]>([])
  const [requiredPillarIds, setRequiredPillarIds] = useState<Set<string>>(new Set())
  const [functionLensId, setFunctionLensId] = useState<string>('')
  const [functionValues, setFunctionValues] = useState<LensValue[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    listLenses().then(setAllLenses)
  }, [open])

  // When pillar lens changes, load its values.
  useEffect(() => {
    if (!pillarLensId) {
      setPillarValues([])
      setRequiredPillarIds(new Set())
      return
    }
    listLensValues(pillarLensId).then((values) => {
      setPillarValues(values)
      // Default: all pillar values required.
      setRequiredPillarIds(new Set(values.map((v) => v.id)))
    })
  }, [pillarLensId])

  // When function lens changes, load its values for the level preview.
  useEffect(() => {
    if (!functionLensId) {
      setFunctionValues([])
      return
    }
    listLensValues(functionLensId).then(setFunctionValues)
  }, [functionLensId])

  const reset = () => {
    setName('')
    setDescription('')
    setPillarLensId('')
    setFunctionLensId('')
    setRequiredPillarIds(new Set())
    setError(null)
    setCreating(false)
  }

  const togglePillar = (id: string) => {
    const next = new Set(requiredPillarIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRequiredPillarIds(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Give the rule a name.'); return }
    if (!pillarLensId) { setError('Pick a Pillar lens.'); return }
    if (requiredPillarIds.size === 0) { setError('Pick at least one required pillar value.'); return }
    if (!functionLensId) { setError('Pick a Function lens (the count axis).'); return }

    setCreating(true)
    setError(null)
    try {
      const requiredValueStrings = pillarValues
        .filter((v) => requiredPillarIds.has(v.id))
        .map((v) => v.value)

      const definition = {
        type: 'wedding-cake' as const,
        version: 1,
        pillarLensId,
        functionLensId,
        requiredPillars: requiredValueStrings,
        countAxis: 'function' as const,
      }

      const maxLevel = functionValues.length
      const outputLevels = Array.from({ length: maxLevel + 1 }, (_, score) => ({
        value: score,
        label: `Level ${score}`,
        description: score === 0
          ? `No ${functionValues.length === 0 ? 'count-axis values' : 'function values'} deliver all required pillars.`
          : score === maxLevel
            ? `All ${maxLevel} function values deliver all required pillars.`
            : `${score} function value${score === 1 ? '' : 's'} deliver all required pillars.`,
      }))

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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New scoring rule</DialogTitle>
            <DialogDescription>
              Wedding Cake-style scoring: count how many values of one axis
              ("Function") satisfy a requirement on another axis ("Pillar").
              The result is a level from 0 to (count of function values).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1.5">
              <label htmlFor="rule-name" className="text-sm font-medium">Name</label>
              <Input
                id="rule-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NIST CSF Maturity"
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
                placeholder="When should a researcher pick this rule?"
                disabled={creating}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Pillar lens (the axis with the requirement)</label>
              <Select value={pillarLensId} onValueChange={setPillarLensId} disabled={creating}>
                <SelectTrigger><SelectValue placeholder="Pick a lens" /></SelectTrigger>
                <SelectContent>
                  {allLenses.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {pillarValues.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Required pillar values</label>
                <p className="text-xs text-muted-foreground">
                  A document scores a level only when ALL of these pillar values are present.
                </p>
                <div className="border border-border rounded-md divide-y divide-border max-h-40 overflow-y-auto">
                  {pillarValues.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        checked={requiredPillarIds.has(v.id)}
                        onCheckedChange={() => togglePillar(v.id)}
                      />
                      <span className="text-sm">{v.displayName ?? v.value}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Function lens (the count axis)</label>
              <Select value={functionLensId} onValueChange={setFunctionLensId} disabled={creating}>
                <SelectTrigger><SelectValue placeholder="Pick a lens" /></SelectTrigger>
                <SelectContent>
                  {allLenses.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {functionValues.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Output: <strong>Level 0 to Level {functionValues.length}</strong> ({functionValues.length + 1} levels).
                </p>
              )}
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
