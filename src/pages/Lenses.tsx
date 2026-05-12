import { useEffect, useState } from 'react'
import { Plus, Layers, Trash2, Lock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/EmptyState'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { NewLensDialog } from '@/components/dialogs/NewLensDialog'
import {
  listLenses,
  listLensValues,
  deleteLens,
  createLensValue,
  deleteLensValue,
  countProjectsUsingLens,
} from '@/services/lenses'
import { toast } from '@/stores/toastStore'
import type { Lens, LensValue } from '@/types/data'
import { cn } from '@/lib/utils'

export function Lenses() {
  const [lenses, setLenses] = useState<Lens[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ lens: Lens; projectCount: number } | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const refresh = async () => {
    const fresh = await listLenses()
    setLenses(fresh)
    if (selectedId === null && fresh.length > 0) {
      setSelectedId(fresh[0].id)
    }
  }

  const handleCreated = (lens: Lens) => {
    refresh()
    setSelectedId(lens.id)
  }

  const handleAskDelete = async (lens: Lens) => {
    const projectCount = await countProjectsUsingLens(lens.id)
    setPendingDelete({ lens, projectCount })
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    await deleteLens(pendingDelete.lens.id)
    toast.success(`Deleted lens "${pendingDelete.lens.name}"`)
    setPendingDelete(null)
    if (selectedId === pendingDelete.lens.id) setSelectedId(null)
    await refresh()
  }

  if (lenses === null) {
    return <div className="px-8 py-10 text-sm text-muted-foreground">Loading…</div>
  }

  const grouped = {
    keywordAttached: lenses.filter((l) => l.type === 'keyword-attached'),
    documentContext: lenses.filter((l) => l.type === 'document-context'),
  }
  const selected = lenses.find((l) => l.id === selectedId) ?? null

  return (
    <div className="px-8 py-10 max-w-6xl">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">Lenses</h1>
          <p className="text-muted-foreground italic mt-1">What lenses do you view through?</p>
        </div>
        <Button onClick={() => setNewDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New lens
        </Button>
      </header>

      {lenses.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-12 w-12" />}
          title="No lenses yet"
          description="A lens is a dimension along which keyword mentions are classified. Built-in sustainability lenses (SDG, Pillar, Function) are normally pre-loaded."
          action={
            <Button onClick={() => setNewDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create your first lens
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-6">
          <aside className="space-y-6">
            <LensGroup
              title="Keyword-attached"
              lenses={grouped.keywordAttached}
              selectedId={selectedId}
              onSelect={setSelectedId}
              emptyHint="None — values come from keyword definitions."
            />
            <LensGroup
              title="Document-context"
              lenses={grouped.documentContext}
              selectedId={selectedId}
              onSelect={setSelectedId}
              emptyHint="None — values inferred from document text."
            />
          </aside>

          <section>
            {selected ? (
              <LensDetail
                lens={selected}
                onDelete={handleAskDelete}
                onValuesChanged={refresh}
              />
            ) : (
              <div className="text-sm text-muted-foreground">Pick a lens.</div>
            )}
          </section>
        </div>
      )}

      <NewLensDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onCreated={handleCreated}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Delete "${pendingDelete?.lens.name ?? ''}"?`}
        description={
          <>
            Removes the lens and all its values.
            {pendingDelete && pendingDelete.projectCount > 0 && (
              <>
                {' '}This lens is currently active in{' '}
                <strong>{pendingDelete.projectCount} project{pendingDelete.projectCount === 1 ? '' : 's'}</strong>;
                it will be removed from those too.
              </>
            )}
          </>
        }
        confirmLabel="Delete lens"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar group
// ---------------------------------------------------------------------------

function LensGroup({
  title,
  lenses,
  selectedId,
  onSelect,
  emptyHint,
}: {
  title: string
  lenses: Lens[]
  selectedId: string | null
  onSelect: (id: string) => void
  emptyHint: string
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
        {title}
      </div>
      {lenses.length === 0 ? (
        <div className="text-xs text-muted-foreground italic px-2 py-1.5">{emptyHint}</div>
      ) : (
        <ul className="border border-border rounded-md divide-y divide-border bg-card">
          {lenses.map((lens) => (
            <li key={lens.id}>
              <button
                type="button"
                onClick={() => onSelect(lens.id)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-muted/40 transition-colors flex items-center gap-2',
                  selectedId === lens.id && 'bg-muted font-medium'
                )}
              >
                <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{lens.name}</span>
                {lens.isBuiltin && (
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Built-in" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail pane
// ---------------------------------------------------------------------------

function LensDetail({
  lens,
  onDelete,
  onValuesChanged,
}: {
  lens: Lens
  onDelete: (lens: Lens) => void
  onValuesChanged: () => void
}) {
  const [values, setValues] = useState<LensValue[] | null>(null)
  const [usageCount, setUsageCount] = useState<number | null>(null)
  const [newValueText, setNewValueText] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    setValues(null)
    setUsageCount(null)
    setNewValueText('')
    listLensValues(lens.id).then(setValues)
    countProjectsUsingLens(lens.id).then(setUsageCount)
  }, [lens.id])

  const handleAddValue = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = newValueText.trim()
    if (!v) return
    setAdding(true)
    try {
      const nextOrder = values && values.length > 0
        ? Math.max(...values.map((val) => val.sortOrder)) + 1
        : 1
      await createLensValue({
        lensId: lens.id,
        value: v,
        displayName: v,
        sortOrder: nextOrder,
      })
      setNewValueText('')
      const fresh = await listLensValues(lens.id)
      setValues(fresh)
      onValuesChanged()
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteValue = async (valueId: string) => {
    await deleteLensValue(valueId)
    const fresh = await listLensValues(lens.id)
    setValues(fresh)
    onValuesChanged()
  }

  return (
    <div className="space-y-6">
      <div className="border border-border rounded-md p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-medium">{lens.name}</h2>
            {lens.description && (
              <p className="text-sm text-muted-foreground mt-1">{lens.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-muted">
                {lens.type === 'keyword-attached' ? 'Keyword-attached' : 'Document-context'}
              </span>
              {lens.isBuiltin && (
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" />
                  Built-in
                </span>
              )}
              <span className="text-muted-foreground">
                Used in {usageCount ?? '…'} project{usageCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          {!lens.isBuiltin && (
            <button
              type="button"
              onClick={() => onDelete(lens)}
              className="text-muted-foreground hover:text-destructive p-2 rounded transition-colors shrink-0"
              title="Delete lens"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">
          Values {values && <span className="text-muted-foreground font-normal">· {values.length}</span>}
        </h3>
        {values === null ? (
          <div className="text-sm text-muted-foreground py-2">Loading…</div>
        ) : values.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-4 italic">
            No values yet.
          </div>
        ) : (
          <ul className="border border-border rounded-md divide-y divide-border">
            {values.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
              >
                <span className="text-sm tabular-nums text-muted-foreground w-6">
                  {v.sortOrder}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {v.displayName ?? v.value}
                  </div>
                  {v.description && (
                    <div className="text-xs text-muted-foreground">{v.description}</div>
                  )}
                </div>
                {!lens.isBuiltin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteValue(v.id)}
                    className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                    title="Delete value"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!lens.isBuiltin && (
          <form onSubmit={handleAddValue} className="flex items-center gap-2 mt-3">
            <Input
              value={newValueText}
              onChange={(e) => setNewValueText(e.target.value)}
              placeholder="Add a value"
              disabled={adding}
              className="flex-1"
            />
            <Button type="submit" variant="outline" disabled={!newValueText.trim() || adding}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </form>
        )}

        {lens.isBuiltin && (
          <p className="text-xs text-muted-foreground italic mt-3">
            Built-in lenses can't have their values edited. To customise, create a new lens with the
            values you want.
          </p>
        )}
      </div>
    </div>
  )
}
