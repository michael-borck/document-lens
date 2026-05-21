import { useEffect, useState } from 'react'
import { Plus, Trash2, Lock, Award, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { NewScoringRuleDialog } from '@/components/dialogs/NewScoringRuleDialog'
import {
  listScoringRules,
  deleteScoringRule,
  countProjectsUsingScoringRule,
} from '@/services/scoring-rules'
import { toast } from '@/stores/toastStore'
import type { ScoringRule } from '@/types/data'

export function Settings() {
  return (
    <div className="px-8 py-10 max-w-5xl">
      <header className="mb-8">
        <h1 className="font-display text-2xl font-medium tracking-tight">Settings</h1>
        <p className="text-muted-foreground italic mt-1">
          App configuration, scoring rules, data management.
        </p>
      </header>

      <div className="space-y-10">
        <ScoringRulesSection />
        <BackendSection />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scoring rules section
// ---------------------------------------------------------------------------

function ScoringRulesSection() {
  const [rules, setRules] = useState<ScoringRule[] | null>(null)
  const [usageById, setUsageById] = useState<Record<string, number>>({})
  const [newOpen, setNewOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ rule: ScoringRule; usage: number } | null>(null)

  const refresh = async () => {
    const fresh = await listScoringRules()
    setRules(fresh)
    const counts: Record<string, number> = {}
    await Promise.all(
      fresh.map(async (r) => {
        counts[r.id] = await countProjectsUsingScoringRule(r.id)
      })
    )
    setUsageById(counts)
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleCreated = () => {
    void refresh()
  }

  const handleAskDelete = (rule: ScoringRule) => {
    setPendingDelete({ rule, usage: usageById[rule.id] ?? 0 })
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    await deleteScoringRule(pendingDelete.rule.id)
    toast.success(`Deleted scoring rule "${pendingDelete.rule.name}"`)
    setPendingDelete(null)
    await refresh()
  }

  return (
    <section>
      <SectionHeader
        icon={<Award className="h-5 w-5" />}
        title="Scoring rules"
        action={
          <Button size="sm" variant="outline" onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New rule
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground mb-3">
        A scoring rule turns coverage data into a single rating per document. The default 5-level
        Wedding Cake Score ships pre-loaded; create additional rules for non-sustainability
        domains.
      </p>

      {rules === null ? (
        <div className="text-sm text-muted-foreground py-2">Loading…</div>
      ) : rules.length === 0 ? (
        <div className="text-sm text-muted-foreground italic border border-dashed border-border rounded-md p-4">
          No scoring rules yet.
        </div>
      ) : (
        <ul className="border border-border rounded-md divide-y divide-border">
          {rules.map((rule) => {
            const usage = usageById[rule.id] ?? 0
            return (
              <li key={rule.id} className="flex items-start gap-3 px-4 py-3">
                <Award className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{rule.name}</span>
                    {rule.isBuiltin && (
                      <span className="text-[10px] uppercase text-muted-foreground inline-flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        Built-in
                      </span>
                    )}
                  </div>
                  {rule.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{rule.description}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {rule.outputLevels.length} output level{rule.outputLevels.length === 1 ? '' : 's'}
                    {' · '}
                    Used in {usage} project{usage === 1 ? '' : 's'}
                  </div>
                </div>
                {!rule.isBuiltin && (
                  <button
                    type="button"
                    onClick={() => handleAskDelete(rule)}
                    className="text-muted-foreground hover:text-destructive p-1.5 rounded transition-colors"
                    title="Delete scoring rule"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <NewScoringRuleDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={handleCreated}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Delete "${pendingDelete?.rule.name ?? ''}"?`}
        description={
          <>
            Removes this scoring rule.
            {pendingDelete && pendingDelete.usage > 0 && (
              <>
                {' '}It is currently the active rule on{' '}
                <strong>{pendingDelete.usage} project{pendingDelete.usage === 1 ? '' : 's'}</strong>;
                those projects will lose their active rule and need to pick another on the Setup tab.
              </>
            )}
          </>
        }
        confirmLabel="Delete rule"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Backend section
// ---------------------------------------------------------------------------

function BackendSection() {
  const [restarting, setRestarting] = useState(false)

  const handleRestart = async () => {
    if (!window.electron) return
    setRestarting(true)
    try {
      const result = await window.electron.restartBackend()
      if (result.success) {
        toast.success('Analysis engine restarted')
      } else {
        toast.error(result.error ?? 'Failed to restart the engine')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restart the engine')
    } finally {
      setRestarting(false)
    }
  }

  return (
    <section>
      <SectionHeader
        title="Backend"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={handleRestart}
            disabled={restarting}
            className="gap-2"
          >
            <RotateCw className={`h-4 w-4 ${restarting ? 'animate-spin' : ''}`} />
            {restarting ? 'Restarting…' : 'Restart engine'}
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        The analysis engine is bundled with this app; the status indicator in the top bar shows
        its current state. The engine auto-restarts on crash, but caps out after a few attempts —
        if it shows as crashed or unreachable, restart it here.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Helper: section header with optional icon and right-side action
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon?: React.ReactNode
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-3">
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <h2 className="font-display text-lg font-medium">{title}</h2>
      </div>
      {action}
    </div>
  )
}
