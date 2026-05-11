import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/shell/AppShell'
import { seedSustainabilityDefaults } from '@/services/seed'

// Top-level pages
const Projects = lazy(() => import('./pages/Projects').then(m => ({ default: m.Projects })))
const Library = lazy(() => import('./pages/Library').then(m => ({ default: m.Library })))
const Keywords = lazy(() => import('./pages/Keywords').then(m => ({ default: m.Keywords })))
const Lenses = lazy(() => import('./pages/Lenses').then(m => ({ default: m.Lenses })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Help = lazy(() => import('./pages/Help').then(m => ({ default: m.Help })))

// Project workspace + 9 workflow tabs
const ProjectWorkspace = lazy(() => import('./pages/ProjectWorkspace').then(m => ({ default: m.ProjectWorkspace })))
const Setup = lazy(() => import('./pages/workflow/Setup').then(m => ({ default: m.Setup })))
const Coverage = lazy(() => import('./pages/workflow/Coverage').then(m => ({ default: m.Coverage })))
const Map = lazy(() => import('./pages/workflow/Map').then(m => ({ default: m.Map })))
const Score = lazy(() => import('./pages/workflow/Score').then(m => ({ default: m.Score })))
const Track = lazy(() => import('./pages/workflow/Track').then(m => ({ default: m.Track })))
const Compare = lazy(() => import('./pages/workflow/Compare').then(m => ({ default: m.Compare })))
const Audit = lazy(() => import('./pages/workflow/Audit').then(m => ({ default: m.Audit })))
const Discover = lazy(() => import('./pages/workflow/Discover').then(m => ({ default: m.Discover })))
const Read = lazy(() => import('./pages/workflow/Read').then(m => ({ default: m.Read })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )
}

function App() {
  // Seed the SDG keyword list, the SDG/Pillar/Function lenses, and the
  // 5-level Wedding Cake Score on first launch (idempotent — no-ops if
  // the defaults are already in place). Per design principle #9.
  useEffect(() => {
    seedSustainabilityDefaults().catch((err) => {
      console.error('[seed] Failed to seed sustainability defaults:', err)
    })
  }, [])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AppShell />}>
          {/* Top-level destinations */}
          <Route index element={<Projects />} />
          <Route path="library" element={<Library />} />
          <Route path="keywords" element={<Keywords />} />
          <Route path="lenses" element={<Lenses />} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />

          {/* Project workspace — nested workflow tabs */}
          <Route path="projects/:projectId" element={<ProjectWorkspace />}>
            <Route index element={<Navigate to="setup" replace />} />
            <Route path="setup" element={<Setup />} />
            <Route path="coverage" element={<Coverage />} />
            <Route path="map" element={<Map />} />
            <Route path="score" element={<Score />} />
            <Route path="track" element={<Track />} />
            <Route path="compare" element={<Compare />} />
            <Route path="audit" element={<Audit />} />
            <Route path="discover" element={<Discover />} />
            <Route path="read" element={<Read />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
