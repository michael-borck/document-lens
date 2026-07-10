import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/shell/AppShell'
import { seedSustainabilityDefaults } from '@/services/seed'
import { landingWorkflow } from '@/components/project/workflows'

/** Opening a project resumes where the user left off (falls back to Overview). */
function ProjectLanding() {
  const { projectId } = useParams<{ projectId: string }>()
  return <Navigate to={landingWorkflow(projectId ?? '')} replace />
}

// Top-level pages
const Projects = lazy(() => import('./pages/Projects').then(m => ({ default: m.Projects })))
const Library = lazy(() => import('./pages/Library').then(m => ({ default: m.Library })))
const Keywords = lazy(() => import('./pages/Keywords').then(m => ({ default: m.Keywords })))
const Axes = lazy(() => import('./pages/Axes').then(m => ({ default: m.Axes })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Help = lazy(() => import('./pages/Help').then(m => ({ default: m.Help })))

// Project workspace + workflow tabs
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace').then(m => ({ default: m.ProjectWorkspace })))
const Overview = lazy(() => import('./pages/workflow/Overview').then(m => ({ default: m.Overview })))
const Setup = lazy(() => import('./pages/workflow/Setup').then(m => ({ default: m.Setup })))
const Coverage = lazy(() => import('./pages/workflow/Coverage').then(m => ({ default: m.Coverage })))
const Map = lazy(() => import('./pages/workflow/Map').then(m => ({ default: m.Map })))
const Score = lazy(() => import('./pages/workflow/Score').then(m => ({ default: m.Score })))
const Track = lazy(() => import('./pages/workflow/Track').then(m => ({ default: m.Track })))
const Compare = lazy(() => import('./pages/workflow/Compare').then(m => ({ default: m.Compare })))
const Audit = lazy(() => import('./pages/workflow/Audit').then(m => ({ default: m.Audit })))
const Gap = lazy(() => import('./pages/workflow/Gap').then(m => ({ default: m.Gap })))
const Discover = lazy(() => import('./pages/workflow/Discover').then(m => ({ default: m.Discover })))
const Read = lazy(() => import('./pages/workflow/Read').then(m => ({ default: m.Read })))
const Focus = lazy(() => import('./pages/workflow/Focus').then(m => ({ default: m.Focus })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function App() {
  const navigate = useNavigate()

  // Seed the SDG keyword list, the SDG/Pillar/Function axes, and the
  // Wedding Cake Score on first launch (idempotent — no-ops if
  // the defaults are already in place). Per design principle #9.
  useEffect(() => {
    seedSustainabilityDefaults().catch((err) => {
      console.error('[seed] Failed to seed sustainability defaults:', err)
    })
  }, [])

  // Subscribe to native Help menu clicks (see electron/menu.ts). Each topic
  // item in Help > Documentation sends `help:navigate` with a topic id;
  // route to /help?topic=<id> and Help.tsx reads it from the search params.
  // No-op when window.electron isn't present (e.g. unit-test or web build).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.onHelpNavigate) return
    const unsubscribe = window.electron.onHelpNavigate((topicId: string) => {
      navigate(`/help?topic=${encodeURIComponent(topicId)}`)
    })
    return unsubscribe
  }, [navigate])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AppShell />}>
          {/* Top-level destinations */}
          <Route index element={<Projects />} />
          <Route path="library" element={<Library />} />
          <Route path="keywords" element={<Keywords />} />
          <Route path="axes" element={<Axes />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />

          {/* Project workspace — nested workflow tabs */}
          <Route path="projects/:projectId" element={<ProjectWorkspace />}>
            <Route index element={<ProjectLanding />} />
            <Route path="overview" element={<Overview />} />
            <Route path="setup" element={<Setup />} />
            <Route path="coverage" element={<Coverage />} />
            <Route path="map" element={<Map />} />
            <Route path="score" element={<Score />} />
            <Route path="track" element={<Track />} />
            <Route path="compare" element={<Compare />} />
            <Route path="audit" element={<Audit />} />
            <Route path="gap" element={<Gap />} />
            <Route path="discover" element={<Discover />} />
            <Route path="read" element={<Read />} />
            <Route path="focus" element={<Focus />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
