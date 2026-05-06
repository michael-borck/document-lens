import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderOpen, Trash2, Copy, Loader2, Leaf, Shield, TrendingUp, Heart, Scale, GraduationCap, ClipboardList, FileText, Search, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FOCUSES, DEFAULT_FOCUS, type Focus } from '@/data/focuses'

function getDefaultFocus(): string {
  const setting = localStorage.getItem('defaultFocus')
  if (setting && FOCUSES.some(f => f.id === setting)) {
    return setting
  }
  return DEFAULT_FOCUS
}
import { cn } from '@/lib/utils'
import { duplicateProject } from '@/services/projects'
import { getActiveProfile, getEnabledKeywords } from '@/services/profiles'
import { ProfileEditor } from '@/components/ProfileEditor'
import { toast } from '@/stores/toastStore'

interface Project {
  id: string
  name: string
  description: string | null
  focus: string
  created_at: string
  updated_at: string
  document_count?: number
  analyzed_count?: number
  failed_count?: number
}

const focusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Leaf, Shield, TrendingUp, Heart, Scale, GraduationCap, ClipboardList, FileText
}

function getFocusIcon(focus: Focus) {
  return focusIcons[focus.icon] || FileText
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function issueDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
}

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const [newProjectFocus, setNewProjectFocus] = useState(getDefaultFocus)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [keywordCounts, setKeywordCounts] = useState<Record<string, number>>({})
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const result = await window.electron.dbQuery<Project>(`
        SELECT
          p.id, p.name, p.description, p.focus, p.created_at, p.updated_at,
          COUNT(pd.document_id) as document_count,
          SUM(CASE WHEN d.analysis_status = 'completed' THEN 1 ELSE 0 END) as analyzed_count,
          SUM(CASE WHEN d.analysis_status = 'failed' THEN 1 ELSE 0 END) as failed_count
        FROM projects p
        LEFT JOIN project_documents pd ON pd.project_id = p.id
        LEFT JOIN documents d ON d.id = pd.document_id
        GROUP BY p.id
        ORDER BY p.updated_at DESC
      `)
      setProjects(result)

      const counts: Record<string, number> = {}
      for (const p of result) {
        try {
          const profile = await getActiveProfile(p.id)
          if (profile) {
            counts[p.id] = getEnabledKeywords(profile.config).length
          }
        } catch { /* ignore */ }
      }
      setKeywordCounts(counts)
    } catch (error) {
      console.error('Failed to load projects:', error)
      toast.error('Couldn’t load your projects', error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) return

    try {
      const id = crypto.randomUUID()
      await window.electron.dbRun(
        'INSERT INTO projects (id, name, description, focus) VALUES (?, ?, ?, ?)',
        [id, newProjectName.trim(), newProjectDescription.trim() || null, newProjectFocus]
      )

      setNewProjectName('')
      setNewProjectDescription('')
      setNewProjectFocus(getDefaultFocus())
      setShowNewProject(false)
      loadProjects()
    } catch (error) {
      console.error('Failed to create project:', error)
    }
  }

  const deleteProject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm('Delete this project?\n\nDocuments will remain in your library and can be added to other projects.')) {
      return
    }

    try {
      await window.electron.dbRun('DELETE FROM projects WHERE id = ?', [id])
      loadProjects()
    } catch (error) {
      console.error('Failed to delete project:', error)
    }
  }

  const handleDuplicateProject = async (project: Project, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const newName = prompt(
      'Enter a name for the duplicated project:',
      `${project.name} (Copy)`
    )
    if (!newName?.trim()) return

    try {
      setDuplicatingId(project.id)
      await duplicateProject(project.id, newName.trim())
      loadProjects()
    } catch (error) {
      console.error('Failed to duplicate project:', error)
      alert('Failed to duplicate project. Please try again.')
    } finally {
      setDuplicatingId(null)
    }
  }

  if (loading) {
    return (
      <div className="p-10 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-muted rounded w-40" />
          <div className="h-16 bg-muted rounded w-80" />
          <div className="h-px bg-border" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted rounded-sm" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const totalDocs = projects.reduce((sum, p) => sum + (p.document_count || 0), 0)
  const totalAnalyzed = projects.reduce((sum, p) => sum + (p.analyzed_count || 0), 0)

  return (
    <div className="min-h-full">
      {/* Masthead */}
      <header className="px-10 pt-10 pb-6 max-w-6xl mx-auto">
        <div className="flex items-baseline justify-between mb-4">
          <div className="label-masthead">Vol. I · The Reading Room</div>
          <div className="label-masthead tabular">{issueDate()}</div>
        </div>

        <div className="flex items-end justify-between gap-8 border-b-2 border-foreground pb-5">
          <div>
            <h1 className="font-display text-6xl font-medium leading-[0.95] tracking-tight text-foreground">
              Projects
            </h1>
            <p className="mt-3 font-display italic text-lg text-muted-foreground max-w-xl leading-snug">
              Corpora of annual reports, arranged for close reading and quantitative inquiry.
            </p>
          </div>
          <Button onClick={() => setShowNewProject(true)} size="lg" className="shrink-0 mb-1">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Stats strip — small-caps with tabular figures */}
        {projects.length > 0 && (
          <div className="flex items-center gap-8 pt-4 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular text-xl text-foreground">{String(projects.length).padStart(2, '0')}</span>
              <span className="label-masthead">Projects</span>
            </div>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular text-xl text-foreground">{String(totalDocs).padStart(2, '0')}</span>
              <span className="label-masthead">Documents</span>
            </div>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-baseline gap-2">
              <span className="font-mono tabular text-xl text-foreground">{String(totalAnalyzed).padStart(2, '0')}</span>
              <span className="label-masthead">Analyzed</span>
            </div>
          </div>
        )}
      </header>

      <div className="px-10 pb-16 max-w-6xl mx-auto">
        {/* New Project Form */}
        {showNewProject && (
          <Card className="mb-10 animate-fade-rise">
            <CardHeader>
              <div className="label-masthead">New Entry</div>
              <CardTitle>Create a Project</CardTitle>
              <CardDescription>
                A project is a collection of documents analyzed under one research focus.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <div>
                  <label className="label-masthead block mb-2">Project Name</label>
                  <Input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g., Annual Report Analysis 2024"
                  />
                </div>
                <div>
                  <label className="label-masthead block mb-2">Description</label>
                  <Input
                    value={newProjectDescription}
                    onChange={(e) => setNewProjectDescription(e.target.value)}
                    placeholder="Optional subtitle or research question"
                  />
                </div>
                <div>
                  <label className="label-masthead block mb-2">Research Focus</label>
                  <p className="text-xs text-muted-foreground mb-3 italic font-display">
                    Choose a focus to pre-load a curated keyword framework.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {FOCUSES.map((focus) => {
                      const Icon = getFocusIcon(focus)
                      const isSelected = newProjectFocus === focus.id
                      return (
                        <button
                          key={focus.id}
                          onClick={() => setNewProjectFocus(focus.id)}
                          className={cn(
                            'relative flex flex-col items-center gap-2 p-4 border text-sm transition-all',
                            isSelected
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border hover:border-foreground/40 bg-card'
                          )}
                        >
                          {isSelected && (
                            <span className="absolute top-0 left-0 right-0 h-0.5 bg-primary" />
                          )}
                          <Icon className={cn('h-5 w-5', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="font-medium text-center text-xs">{focus.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  {newProjectFocus && (
                    <p className="text-xs text-muted-foreground mt-3 italic font-display">
                      {FOCUSES.find(f => f.id === newProjectFocus)?.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <Button onClick={createProject} disabled={!newProjectName.trim()}>
                    Create Project
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setShowNewProject(false)
                    setNewProjectName('')
                    setNewProjectDescription('')
                    setNewProjectFocus(getDefaultFocus())
                  }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Projects */}
        {projects.length === 0 ? (
          <div className="text-center py-24 border border-border bg-card animate-fade-rise">
            <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground mb-5" strokeWidth={1.25} />
            <h2 className="font-display text-3xl font-medium mb-3">No projects yet</h2>
            <p className="font-display italic text-muted-foreground mb-6 max-w-sm mx-auto">
              Begin your first reading. A project gathers the documents and the framework by which they are to be examined.
            </p>
            <Button onClick={() => setShowNewProject(true)} size="lg">
              <Plus className="h-4 w-4 mr-2" />
              Create First Project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project, idx) => {
              const focus = FOCUSES.find(f => f.id === project.focus) || FOCUSES.find(f => f.id === 'general')!
              const FocusIcon = getFocusIcon(focus)
              const progress = project.document_count
                ? Math.round(((project.analyzed_count || 0) / project.document_count) * 100)
                : 0
              const hasFailures = (project.failed_count || 0) > 0

              return (
                <Link
                  key={project.id}
                  to={`/project/${project.id}`}
                  className="animate-fade-rise"
                  style={{ animationDelay: `${Math.min(idx * 60, 360)}ms` }}
                >
                  <article className="group relative h-full bg-card border border-border hover:border-foreground/40 transition-all p-6 flex flex-col">
                    {/* Top rule on hover */}
                    <span className="absolute top-0 left-0 right-0 h-px bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />

                    {/* Focus tag — small-caps header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <FocusIcon className={cn('h-3.5 w-3.5', focus.color)} />
                        <span className="label-masthead">{focus.name}</span>
                      </div>
                      <div className="flex items-center -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Project Settings"
                          aria-label="Project Settings"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setSettingsProjectId(project.id)
                          }}
                        >
                          <Settings2 className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Duplicate"
                          aria-label="Duplicate project"
                          onClick={(e) => handleDuplicateProject(project, e)}
                          disabled={duplicatingId === project.id}
                        >
                          {duplicatingId === project.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Delete"
                          aria-label="Delete project"
                          onClick={(e) => deleteProject(project.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {/* Title — Fraunces */}
                    <h2 className="font-display text-2xl font-medium leading-[1.15] text-foreground mb-2 line-clamp-2 tracking-tight group-hover:text-primary transition-colors">
                      {project.name}
                    </h2>

                    {project.description && (
                      <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2 mb-5 font-display italic">
                        {project.description}
                      </p>
                    )}

                    <div className="mt-auto space-y-4">
                      {/* Progress — only if docs */}
                      {(project.document_count || 0) > 0 && (
                        <div>
                          <div className="flex items-baseline justify-between mb-1.5">
                            <span className="label-masthead">Progress</span>
                            <span className="font-mono tabular text-xs text-foreground">
                              {project.analyzed_count || 0}<span className="text-muted-foreground">/</span>{project.document_count || 0}
                            </span>
                          </div>
                          <div className="h-[2px] bg-border overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          {hasFailures && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                              <span className="text-[10px] tabular text-destructive uppercase tracking-wider font-medium">
                                {project.failed_count} failed
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Footer metadata rule */}
                      <div className="pt-3 border-t border-border/70 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span className="tabular">
                            <span className="font-mono text-foreground">{project.document_count || 0}</span> docs
                          </span>
                          {keywordCounts[project.id] > 0 && (
                            <>
                              <span className="text-border">·</span>
                              <span className="tabular">
                                <span className="font-mono text-foreground">{keywordCounts[project.id]}</span> keywords
                              </span>
                            </>
                          )}
                        </div>
                        <span className="label-masthead !text-[10px]">{relativeTime(project.updated_at)}</span>
                      </div>
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Project Settings Dialog */}
      {settingsProjectId && (
        <ProfileEditor
          open={!!settingsProjectId}
          onClose={() => setSettingsProjectId(null)}
          projectId={settingsProjectId}
          projectName={projects.find(p => p.id === settingsProjectId)?.name}
          onSaved={() => {
            setSettingsProjectId(null)
            loadProjects()
          }}
        />
      )}
    </div>
  )
}
