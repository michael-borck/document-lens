import { Routes, Route, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { RefreshCw, Settings as SettingsIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Layout } from './components/Layout'
import { ProjectList } from './pages/ProjectList'
import { ProjectDashboard } from './pages/ProjectDashboard'
import { DocumentView } from './pages/DocumentView'
import { KeywordSearch } from './pages/KeywordSearch'
import { NgramAnalysis } from './pages/NgramAnalysis'
import { Visualizations } from './pages/Visualizations'
import { DocumentLibrary } from './pages/DocumentLibrary'
import { Settings } from './pages/Settings'
import { KeywordLists } from './pages/KeywordLists'
import { Help } from './pages/Help'
import { WelcomeDialog } from './components/WelcomeDialog'
import { Toaster } from './components/Toaster'
import { seedFrameworkKeywords } from './services/keywords'
import type { BackendStatus } from './types/electron'

type LocalPhase = 'checking' | 'starting' | 'ready' | 'unreachable' | 'crashed'

interface Status {
  phase: LocalPhase
  mode?: BackendStatus['mode']
  lastError?: string
}

const isMac = typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

function App() {
  const [status, setStatus] = useState<Status>({ phase: 'checking' })
  const [retrying, setRetrying] = useState(false)
  const [dismissedReady, setDismissedReady] = useState(false)
  // Show a "checking..." hint after a short delay if the initial probe is slow
  const [showCheckingHint, setShowCheckingHint] = useState(false)

  useEffect(() => {
    initializeApp()

    // Main process is the source of truth — it already polls /health every
    // 5s internally and emits phase-changed on transitions. The renderer
    // just subscribes and pulls an initial snapshot.
    const unsubscribe = window.electron?.onBackendStatusChanged?.((s) => {
      setStatus({ phase: s.phase as LocalPhase, mode: s.mode, lastError: s.lastError })
    })

    window.electron?.getBackendStatus?.().then((s) => {
      setStatus({ phase: s.phase as LocalPhase, mode: s.mode, lastError: s.lastError })
    }).catch(() => {
      setStatus({ phase: 'unreachable' })
    })

    return () => {
      unsubscribe?.()
    }
  }, [])

  // After 1s, surface a "checking" indicator so the user knows we're alive
  useEffect(() => {
    if (status.phase !== 'checking') {
      setShowCheckingHint(false)
      return
    }
    const t = setTimeout(() => setShowCheckingHint(true), 1000)
    return () => clearTimeout(t)
  }, [status.phase])

  const refreshStatus = async () => {
    try {
      const s = await window.electron?.getBackendStatus?.()
      if (s) setStatus({ phase: s.phase as LocalPhase, mode: s.mode, lastError: s.lastError })
    } catch { /* ignore */ }
  }

  const initializeApp = async () => {
    try {
      await seedFrameworkKeywords()
    } catch (error) {
      console.error('Failed to initialize app:', error)
    }
  }

  const handleRetry = async () => {
    setRetrying(true)
    await refreshStatus()
    setRetrying(false)
  }

  // Dismiss the "Ready" pill automatically after it appears
  useEffect(() => {
    if (status.phase === 'ready' && !dismissedReady) {
      const t = setTimeout(() => setDismissedReady(true), 2400)
      return () => clearTimeout(t)
    }
    if (status.phase !== 'ready' && dismissedReady) {
      setDismissedReady(false)
    }
  }, [status.phase, dismissedReady])

  return (
    <div className="min-h-screen bg-background">
      {/* Window drag strip — macOS only (Win/Linux keep the native title bar).
          70px left inset reserves space for the traffic-light buttons on
          hiddenInset. Everything above the first interactive element here is
          a drag handle. */}
      {isMac && (
        <div
          className="app-drag fixed top-0 left-0 right-0 h-7 z-50 pointer-events-auto"
          style={{ paddingLeft: 70 }}
          aria-hidden="true"
        />
      )}

      <div className={isMac ? 'pt-7' : undefined}>
        <WelcomeDialog />
        <Toaster />
        <StatusStrip
          status={status}
          retrying={retrying}
          onRetry={handleRetry}
          dismissedReady={dismissedReady}
          showCheckingHint={showCheckingHint}
        />

      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ProjectList />} />
          <Route path="project/:projectId" element={<ProjectDashboard />} />
          <Route path="project/:projectId/document/:documentId" element={<DocumentView />} />
          <Route path="project/:projectId/search" element={<KeywordSearch />} />
          <Route path="project/:projectId/ngrams" element={<NgramAnalysis />} />
          <Route path="project/:projectId/visualize" element={<Visualizations />} />
          <Route path="library" element={<DocumentLibrary />} />
          <Route path="keywords" element={<KeywordLists />} />
          <Route path="settings" element={<Settings />} />
        </Route>
          <Route path="help/:section?" element={<Help />} />
        </Routes>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status Strip — The Quarterly's editorial status bar
// ---------------------------------------------------------------------------

interface StripProps {
  status: Status
  retrying: boolean
  onRetry: () => void
  dismissedReady: boolean
  showCheckingHint: boolean
}

function StatusStrip({ status, retrying, onRetry, dismissedReady, showCheckingHint }: StripProps) {
  const { phase, mode, lastError } = status

  // Hide entirely when ready + auto-dismissed, or while still checking and hint hasn't kicked in yet
  if (phase === 'checking' && !showCheckingHint) return null
  if (phase === 'ready' && dismissedReady) return null

  // Slow initial check — show a minimal "Checking..." pill so the user knows we're alive
  if (phase === 'checking') {
    return (
      <div className="border-b border-border bg-card">
        <div className="max-w-screen-2xl mx-auto px-6 py-2.5 flex items-center gap-3">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="label-masthead">Status · Checking</span>
          <span className="text-xs text-muted-foreground font-display italic">
            Contacting the analysis engine…
          </span>
        </div>
      </div>
    )
  }

  const isDev = mode === 'dev-auto' || mode === 'dev-external'

  // Phase → visual tokens
  const config = {
    starting: {
      label: 'Starting',
      dot: 'bg-brass animate-pulse',
      bg: 'bg-card',
      border: 'border-brass/40',
      text: 'text-foreground',
      headline: 'Preparing the analysis engine',
      detail: mode === 'embedded'
        ? 'First launch can take up to a minute while Python initialises.'
        : mode === 'dev-auto'
          ? 'Auto-starting document-analyser from ../document-analyser — hold a moment.'
          : 'Waiting for the document-analyser API on :8765.',
    },
    ready: {
      label: 'Ready',
      dot: 'bg-green-700',
      bg: 'bg-card',
      border: 'border-green-800/30',
      text: 'text-foreground',
      headline: 'Analysis engine online',
      detail: 'All features available.',
    },
    unreachable: {
      label: 'Unreachable',
      dot: 'bg-brass',
      bg: 'bg-card',
      border: 'border-brass/50',
      text: 'text-foreground',
      headline: 'Lost contact with the analysis engine',
      detail: isDev
        ? 'Dev backend stopped responding. Check the uvicorn terminal. Existing analyses, keyword search, n-grams, visualisations and export still work.'
        : 'New PDF imports and analysis are paused. Existing analyses, keyword search, n-grams, visualisations and export still work.',
    },
    crashed: {
      label: 'Offline',
      dot: 'bg-primary',
      bg: 'bg-card',
      border: 'border-primary/40',
      text: 'text-foreground',
      headline: isDev ? 'Dev backend is not running' : 'Analysis engine stopped',
      detail: isDev
        ? 'Start it manually: cd ../document-analyser && document-analyser serve --port 8765 — or restart this app and Electron will auto-start it. Existing data, keyword search, visualisations and export still work.'
        : 'Restart the app to relaunch the analysis engine. Existing data, keyword search, visualisations and export still work.',
    },
  }[phase as Exclude<LocalPhase, 'checking'>]

  return (
    <div className={cn('border-b', config.border, config.bg)}>
      <div className="max-w-screen-2xl mx-auto px-6 py-2.5 flex items-center gap-4">
        {/* Status dot + small-caps label */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('h-2 w-2 rounded-full', config.dot)} />
          <span className="label-masthead">Status · {config.label}</span>
        </div>

        {/* Vertical rule */}
        <span className="h-4 w-px bg-border shrink-0" />

        {/* Headline + detail */}
        <div className={cn('flex-1 min-w-0 flex items-baseline gap-3', config.text)}>
          <span className="font-display text-[15px] font-medium truncate">
            {config.headline}
          </span>
          <span className="text-xs text-muted-foreground truncate hidden md:inline font-display italic">
            {config.detail}
          </span>
        </div>

        {/* Error detail — tiny mono, only if present */}
        {lastError && phase !== 'ready' && (
          <code className="hidden lg:inline text-[10px] font-mono text-muted-foreground truncate max-w-xs">
            {lastError}
          </code>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0">
          {phase !== 'ready' && (
            <button
              onClick={onRetry}
              disabled={retrying || phase === 'starting'}
              className="flex items-center gap-1.5 label-masthead hover:text-foreground transition-colors disabled:opacity-40"
              title="Check backend status"
            >
              <RefreshCw className={cn('h-3 w-3', retrying && 'animate-spin')} />
              {retrying ? 'Checking' : 'Retry'}
            </button>
          )}
          {(phase === 'crashed' || phase === 'unreachable') && (
            <Link
              to="/settings"
              className="flex items-center gap-1.5 label-masthead hover:text-foreground transition-colors"
            >
              <SettingsIcon className="h-3 w-3" />
              Settings
            </Link>
          )}
          {phase === 'ready' && (
            <button
              onClick={() => { /* ready auto-dismisses via effect */ }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
