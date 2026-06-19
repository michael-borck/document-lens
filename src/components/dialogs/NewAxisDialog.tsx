import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { createAxis, createAxisValue } from '@/services/axes'
import type { Axis, AxisType } from '@/types/data'

interface NewAxisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (axis: Axis) => void
}

export function NewAxisDialog({ open, onOpenChange, onCreated }: NewAxisDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<AxisType>('keyword-attached')
  const [valuesText, setValuesText] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setDescription('')
    setType('keyword-attached')
    setValuesText('')
    setError(null)
    setCreating(false)
  }

  const parseValues = (raw: string): string[] => {
    return raw
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const values = parseValues(valuesText)
    if (values.length < 2) {
      setError('An axis needs at least 2 values (otherwise it has nothing to classify against).')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const axis = await createAxis({
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        isHierarchical: false,
        isBuiltin: false,
      })
      // Seed the initial values.
      let order = 1
      for (const value of values) {
        await createAxisValue({
          axisId: axis.id,
          value,
          displayName: value,
          sortOrder: order++,
        })
      }
      onCreated(axis)
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create axis')
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
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New axis</DialogTitle>
            <DialogDescription>
              An axis is a tag dimension — a way to classify keyword mentions.
              Examples: SDG, Pillar, Function, Sector. Custom axes
              extend the analysis to non-sustainability domains.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <label htmlFor="axis-name" className="text-sm font-medium">Name</label>
              <Input
                id="axis-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NIST CSF Function"
                autoFocus
                disabled={creating}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="axis-description" className="text-sm font-medium">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                id="axis-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this axis classify?"
                disabled={creating}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select value={type} onValueChange={(v) => setType(v as AxisType)} disabled={creating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword-attached">
                    Keyword-attached (values come with keyword definitions)
                  </SelectItem>
                  <SelectItem value="document-context">
                    Document-context (values inferred from document text)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="axis-values" className="text-sm font-medium">
                Initial values
              </label>
              <textarea
                id="axis-values"
                value={valuesText}
                onChange={(e) => setValuesText(e.target.value)}
                placeholder="One per line, or comma-separated — e.g. Identify, Protect, Detect, Respond, Recover"
                rows={4}
                disabled={creating}
                className="w-full text-sm px-3 py-2 border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30 resize-none"
              />
              <p className="text-xs text-muted-foreground">
                You can add more values after creating the axis.
              </p>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? 'Creating…' : 'Create axis'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
