import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ArrowRight, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WORKFLOW_GROUPS } from '@/components/project/workflows'
import { cn } from '@/lib/utils'
import type { ProjectViewModel } from '@/pages/ProjectWorkspace'

/**
 * The project's front door: every workflow presented as the research
 * question it answers, grouped by phase (Explore → Measure → Verify).
 * Researchers arrive with a question, not a tool name — this page lets
 * them navigate by the question; the tab strip stays for people who
 * already know where they're going.
 */
export function Overview() {
  const vm = useOutletContext<ProjectViewModel>()
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const phases = WORKFLOW_GROUPS.filter((g) => g.label !== null)

  return (
    <div className="px-8 py-8 max-w-5xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-medium tracking-tight">Overview</h1>
        <p className="text-muted-foreground italic mt-1">Where is this project up to?</p>
      </header>

      {!vm.setupComplete && (
        <div className="mb-8 border border-primary/30 bg-primary/5 rounded-md px-5 py-4 flex items-center gap-4">
          <Settings2 className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">Finish setting up this project</div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Pick a keyword list and a scoring rule (and add documents) to unlock the
              workflows below.
            </p>
          </div>
          <Button onClick={() => navigate(`/projects/${projectId}/setup`)}>
            Go to Setup
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {vm.setupComplete && vm.documentCount === 0 && (
        <div className="mb-8 border border-border bg-card rounded-md px-5 py-4 flex items-center gap-4">
          <Settings2 className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">No documents yet</div>
            <p className="text-sm text-muted-foreground mt-0.5">
              The workflows are unlocked, but they need documents to analyse — add some
              from the Library in Setup.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate(`/projects/${projectId}/setup`)}>
            Add documents
          </Button>
        </div>
      )}

      <div className="space-y-8">
        {phases.map((phase) => (
          <section key={phase.label} aria-label={phase.label ?? undefined}>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-[11px] uppercase tracking-[0.18em] font-semibold text-muted-foreground">
                {phase.label}
              </h2>
              {phase.description && (
                <span className="text-xs italic text-muted-foreground/70">
                  {phase.description}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {phase.workflows.map((w) => {
                const disabled = w.requiresSetup && !vm.setupComplete
                return (
                  <button
                    key={w.to}
                    type="button"
                    disabled={disabled}
                    onClick={() => navigate(`/projects/${projectId}/${w.to}`)}
                    title={
                      disabled
                        ? 'Add a keyword list and a scoring rule on the Setup tab to unlock this workflow'
                        : undefined
                    }
                    className={cn(
                      'group text-left border border-border bg-card rounded-md px-4 py-3.5 transition-colors',
                      disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:border-foreground/40 hover:bg-muted/40'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display font-medium">{w.label}</span>
                      {!disabled && (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                    <p className="mt-1 text-sm italic text-muted-foreground leading-snug">
                      {w.question}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
