import { useEffect, useState } from 'react'
import { Plus, Trash2, Lock, Award, RotateCw, Sparkles, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { Loading } from '@/components/Loading'
import { NewScoringRuleDialog } from '@/components/dialogs/NewScoringRuleDialog'
import {
  listScoringRules,
  deleteScoringRule,
  countProjectsUsingScoringRule,
} from '@/services/scoring-rules'
import { toast } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import type { ScoringRule } from '@/types/data'
import type { AiProviderId, AiProvidersSnapshot } from '@/types/electron'

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
        <AiProviderSection />
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
    try {
      await deleteScoringRule(pendingDelete.rule.id)
    } catch (err) {
      toast.error(`Could not delete scoring rule: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
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
        A scoring rule turns coverage data into a single rating per document. The default
        Wedding Cake Score ships pre-loaded; create additional rules for non-sustainability
        domains.
      </p>

      {rules === null ? (
        <Loading className="py-2" />
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
// AI provider section (BYOK)
// ---------------------------------------------------------------------------

function AiProviderSection() {
  const [snapshot, setSnapshot] = useState<AiProvidersSnapshot | null>(null)
  const [selectedId, setSelectedId] = useState<AiProviderId>('anthropic')
  const [baseUrl, setBaseUrl] = useState('')
  const [keyInput, setKeyInput] = useState('')
  const [keyDirty, setKeyDirty] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [model, setModel] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    window.electron.aiGetProviders().then((snap) => {
      setSnapshot(snap)
      setSelectedId(snap.active ?? snap.providers[0]?.id ?? 'anthropic')
    })
  }, [])

  const selected = snapshot?.providers.find((p) => p.id === selectedId)

  // Hydrate the draft whenever the selected provider (or the snapshot) changes.
  useEffect(() => {
    if (!selected) return
    setBaseUrl(selected.baseUrl)
    setModel(selected.model ?? '')
    setKeyInput('')
    setKeyDirty(false)
    setShowKey(false)
    setModels([])
    setTestMsg(null)
  }, [selectedId, snapshot])

  if (!snapshot) return <Loading />

  const isActive = snapshot.active === selectedId
  const draft = () => ({ baseUrl, key: keyDirty ? keyInput : undefined })

  const handleShow = async () => {
    // Reveal the stored key on demand (decrypted in main) so it can be viewed/edited.
    if (!showKey && selected?.hasKey && !keyDirty && keyInput === '') {
      const revealed = await window.electron.aiRevealKey(selectedId)
      if (revealed !== null) setKeyInput(revealed)
    }
    setShowKey((s) => !s)
  }

  const handleTest = async () => {
    setBusy(true)
    setTestMsg(null)
    try {
      const res = await window.electron.aiTestConnection(selectedId, draft())
      if (res.ok) {
        setModels(res.models ?? [])
        setTestMsg({ ok: true, text: `Connected — ${res.models?.length ?? 0} model${res.models?.length === 1 ? '' : 's'} available` })
      } else {
        setTestMsg({ ok: false, text: res.error ?? 'Connection failed' })
      }
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async () => {
    setBusy(true)
    try {
      const snap = await window.electron.aiSaveProvider(selectedId, {
        baseUrl,
        model: model.trim() || null,
        key: keyDirty ? keyInput : undefined,
      })
      setSnapshot(snap)
      setKeyDirty(false)
      toast.success(`Saved ${selected?.label} settings`)
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const handleSetActive = async () => {
    const snap = await window.electron.aiSetActiveProvider(selectedId)
    setSnapshot(snap)
    toast.success(`${selected?.label} is now the active AI provider`)
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="h-5 w-5" />
        <h2 className="font-medium">AI provider (bring your own key)</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
        Configure an AI provider for the optional AI-observation features. Keys are encrypted with
        your OS keychain and used only from the app&apos;s background process — never shown unless you
        click Show. Anything AI-generated is always flagged as such and is not a repeatable signal.
      </p>
      {!snapshot.encryptionAvailable && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
          ⚠ OS key encryption isn&apos;t available on this machine — keys are stored with weak
          encoding. Prefer a local provider (Ollama) here.
        </p>
      )}

      <div className="border border-border rounded-md p-4 space-y-4 max-w-3xl">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm w-28 shrink-0">Provider</label>
          <Select value={selectedId} onValueChange={(v) => setSelectedId(v as AiProviderId)}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {snapshot.providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}{snapshot.active === p.id ? ' · active' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isActive ? (
            <span className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Active
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={handleSetActive}>Use this provider</Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm w-28 shrink-0">Base URL</label>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" className="flex-1" />
        </div>

        {selected?.keyMode !== 'none' && (
          <div className="flex items-center gap-3">
            <label className="text-sm w-28 shrink-0">
              API key{selected?.keyMode === 'optional' ? ' (optional)' : ''}
            </label>
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => { setKeyInput(e.target.value); setKeyDirty(true) }}
                placeholder={selected?.hasKey ? '•••••• stored — leave blank to keep' : 'Enter key'}
                className="pr-14"
              />
              <button
                type="button"
                onClick={handleShow}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="text-sm w-28 shrink-0">Model</label>
          <input
            list="ai-models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model id (test to fetch the list)"
            className="flex-1 rounded-sm border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <datalist id="ai-models">
            {models.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            Test &amp; fetch models
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy}>Save</Button>
          {testMsg && (
            <span className={cn('text-xs', testMsg.ok ? 'text-green-700 dark:text-green-400' : 'text-destructive')}>
              {testMsg.text}
            </span>
          )}
        </div>
      </div>
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
