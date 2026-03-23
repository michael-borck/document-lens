import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FolderOpen, Trash2, Copy, Loader2, Leaf, Shield, TrendingUp, Heart, Scale, GraduationCap, ClipboardList, FileText, Search, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FOCUSES, DEFAULT_FOCUS, type Focus } from '@/data/focuses'

// Get default focus from user settings or fallback to system default
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

// Map focus icon names to components
const focusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Leaf,
  Shield,
  TrendingUp,
  Heart,
  Scale,
  GraduationCap,
  ClipboardList,
  FileText
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
  return new Date(dateStr).toLocaleDateString()
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
      // Load projects with document count (using junction table)
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

      // Load keyword counts lazily
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
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button onClick={() => setShowNewProject(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* New Project Form */}
      {showNewProject && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Create New Project</CardTitle>
            <CardDescription>
              Create a new project to organize your documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Project Name</label>
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g., Annual Report Analysis 2024"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description (optional)</label>
                <Input
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Brief description of this project"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Research Focus
                </label>
                <p className="text-xs text-muted-foreground mb-3">
                  Choose a focus to get pre-loaded keyword frameworks for your research domain
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
                          'flex flex-col items-center gap-2 p-3 rounded-lg border text-sm transition-colors',
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50 hover:bg-muted'
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isSelected ? focus.color : 'text-muted-foreground')} />
                        <span className="font-medium text-center text-xs">{focus.name}</span>
                      </button>
                    )
                  })}
                </div>
                {newProjectFocus && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {FOCUSES.find(f => f.id === newProjectFocus)?.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
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

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">No projects yet</h2>
            <p className="text-muted-foreground mb-4">
              Create your first project to start analyzing documents
            </p>
            <Button onClick={() => setShowNewProject(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const focus = FOCUSES.find(f => f.id === project.focus) || FOCUSES.find(f => f.id === 'general')!
            const FocusIcon = getFocusIcon(focus)
            return (
              <Link key={project.id} to={`/project/${project.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <FocusIcon className={cn('h-5 w-5', focus.color)} />
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                      </div>
                      <div className="flex items-center -mr-2 -mt-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Project Settings"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setSettingsProjectId(project.id)
                          }}
                        >
                          <Settings2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Duplicate"
                          onClick={(e) => handleDuplicateProject(project, e)}
                          disabled={duplicatingId === project.id}
                        >
                          {duplicatingId === project.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Delete"
                          onClick={(e) => deleteProject(project.id, e)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {project.description && (
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {/* Analysis progress bar */}
                    {(project.document_count || 0) > 0 && (
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>{project.analyzed_count || 0}/{project.document_count || 0} analyzed</span>
                          {(project.failed_count || 0) > 0 && (
                            <span className="text-destructive">{project.failed_count} failed</span>
                          )}
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.round(((project.analyzed_count || 0) / (project.document_count || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {/* Stats row */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <span className={cn('px-2 py-0.5 rounded-full bg-muted flex items-center gap-1', focus.color)}>
                          <Search className="h-3 w-3" />
                          {focus.name}
                        </span>
                        <span>{project.document_count || 0} docs</span>
                        {keywordCounts[project.id] > 0 && (
                          <span>{keywordCounts[project.id]} keywords</span>
                        )}
                      </div>
                      <span>{relativeTime(project.updated_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {/* Project Settings Dialog (opened from gear icon) */}
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
