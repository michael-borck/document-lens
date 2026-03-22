import { Routes, Route, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
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
import { api } from './services/api'
import { seedFrameworkKeywords } from './services/keywords'

function App() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    // Initialize app
    initializeApp()
    checkBackendStatus()
    // Check status periodically
    const interval = setInterval(checkBackendStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const initializeApp = async () => {
    try {
      console.log('Initializing app - seeding framework keywords...')
      // Seed framework keywords if not already done
      await seedFrameworkKeywords()
      console.log('App initialization complete')
    } catch (error) {
      console.error('Failed to initialize app:', error)
      // Alert in development so we notice the issue
      if (import.meta.env.DEV) {
        console.error('CRITICAL: Framework keyword seeding failed!', error)
      }
    }
  }

  const checkBackendStatus = async () => {
    try {
      await api.healthCheck()
      setBackendStatus('online')
    } catch {
      setBackendStatus('offline')
    }
  }

  const handleRetry = async () => {
    setRetrying(true)
    await checkBackendStatus()
    setRetrying(false)
  }

  return (
    <div className="min-h-screen bg-background">
      <WelcomeDialog />

      {backendStatus === 'offline' && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2 text-sm">
          <div className="max-w-screen-xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4" />
              <span>
                <strong>Backend Offline</strong> - PDF text extraction and advanced analysis unavailable. 
                Local features (keyword search, visualizations, export) still work.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleRetry}
                disabled={retrying}
                className="flex items-center gap-1 hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${retrying ? 'animate-spin' : ''}`} />
                {retrying ? 'Checking...' : 'Retry'}
              </button>
              <Link to="/settings" className="flex items-center gap-1 hover:underline">
                <SettingsIcon className="h-3 w-3" />
                Settings
              </Link>
            </div>
          </div>
        </div>
      )}
      
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
  )
}

export default App
