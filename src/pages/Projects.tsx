import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Trash2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { NewProjectDialog } from '@/components/dialogs/NewProjectDialog'
import { FirstRunWizard } from '@/components/dialogs/FirstRunWizard'
import { ImportBundleDialog } from '@/components/dialogs/ImportBundleDialog'
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog'
import { listProjects, deleteProject } from '@/services/projects'
import { toast } from '@/stores/toastStore'
import type { Project } from '@/types/data'

export function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [importBundlePath, setImportBundlePath] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  const refresh = async () => {
    setProjects(await listProjects())
  }

  const handleCreated = (project: Project) => {
    refresh()
    navigate(`/projects/${project.id}/setup`)
  }

  const handlePickImportBundle = async () => {
    const electron = window.electron
    if (!electron) return
    const dialog = await electron.openFileDialog({
      title: 'Import project bundle',
      buttonLabel: 'Import',
      filters: [
        { name: 'Document Lens bundle', extensions: ['lens'] },
        { name: 'ZIP archive', extensions: ['zip'] },
      ],
    })
    if (dialog.canceled || dialog.filePaths.length === 0) return
    setImportBundlePath(dialog.filePaths[0])
  }

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return
    await deleteProject(pendingDelete.id)
    toast.success(`Deleted project "${pendingDelete.name}"`)
    setPendingDelete(null)
    await refresh()
  }

  if (projects === null) {
    return (
      <div className="px-8 py-10 text-sm text-muted-foreground">Loading…</div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-6xl">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight">Projects</h1>
          <p className="text-muted-foreground italic mt-1">What are you working on?</p>
        </div>
        {projects.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handlePickImportBundle} className="gap-2">
              <Package className="h-4 w-4" />
              Import bundle
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </div>
        )}
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-12 w-12" />}
          title="No projects yet"
          description="A project is a workspace for analysing a set of documents through a chosen framework. The app ships with the SDG keyword list and the 5-level Wedding Cake Score pre-loaded — your first project will be productive without any configuration."
          action={
            <div className="flex items-center gap-2">
              <Button onClick={() => setWizardOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create your first project
              </Button>
              <Button variant="outline" onClick={handlePickImportBundle} className="gap-2">
                <Package className="h-4 w-4" />
                Import a bundle
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {projects.map((project) => (
            <li
              key={project.id}
              className="group flex items-center gap-2 hover:bg-muted/50 transition-colors"
            >
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/setup`)}
                className="flex-1 text-left px-4 py-3 flex items-center gap-4 min-w-0"
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{project.name}</div>
                  {project.description && (
                    <div className="text-xs text-muted-foreground truncate">{project.description}</div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(project)}
                className="px-3 py-3 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                title="Delete project"
                aria-label={`Delete project ${project.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
        onSwitchToWizard={() => {
          setDialogOpen(false)
          setWizardOpen(true)
        }}
      />

      <FirstRunWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={handleCreated}
      />

      <ImportBundleDialog
        open={importBundlePath !== null}
        onOpenChange={(o) => { if (!o) setImportBundlePath(null) }}
        onImported={handleCreated}
        bundlePath={importBundlePath}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        title={`Delete "${pendingDelete?.name ?? ''}"?`}
        description={
          <>
            Removes this project, its document selection, lens / scoring rule
            configuration, and any cached analysis results.{' '}
            <strong>Library documents are not affected</strong> — they
            remain available to other projects.
          </>
        }
        confirmLabel="Delete project"
        destructive
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
