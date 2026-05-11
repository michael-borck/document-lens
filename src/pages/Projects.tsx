import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { NewProjectDialog } from '@/components/dialogs/NewProjectDialog'
import { listProjects } from '@/services/projects'
import type { Project } from '@/types/data'

export function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

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
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New project
          </Button>
        )}
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-12 w-12" />}
          title="No projects yet"
          description="A project is a workspace for analysing a set of documents through a chosen framework. The app ships with the SDG keyword list and the 5-level Wedding Cake Score pre-loaded — your first project will be productive without any configuration."
          action={
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create your first project
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => navigate(`/projects/${project.id}/setup`)}
                className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-4"
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
            </li>
          ))}
        </ul>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />
    </div>
  )
}
