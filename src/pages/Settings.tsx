import { useState, useEffect } from 'react'
import {
  Settings as SettingsIcon,
  Database,
  Globe,
  Building2,
  Trash2,
  Plus,
  X,
  Check,
  Loader2,
  RefreshCw,
  AlertTriangle,
  FolderOpen,
  Lightbulb,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/services/api'
import { BACKEND_URL } from '@/config/backend'
import { FOCUSES, DEFAULT_FOCUS } from '@/data/focuses'
import { toast } from '@/stores/toastStore'
import { restoreDefaultKeywordLists } from '@/services/keywords'

interface Country {
  code: string
  name: string
  is_default: boolean
}

interface Industry {
  id: string
  name: string
  category: string | null
  is_default: boolean
}

export function Settings() {
  const [backendUrl, setBackendUrl] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [appVersion, setAppVersion] = useState('')
  const [dbPath, setDbPath] = useState('')
  
  // Data stats
  const [stats, setStats] = useState({ projects: 0, documents: 0, analyses: 0 })
  
  // Country/Industry editors
  const [countries, setCountries] = useState<Country[]>([])
  const [industries, setIndustries] = useState<Industry[]>([])
  const [editingCountries, setEditingCountries] = useState(false)
  const [editingIndustries, setEditingIndustries] = useState(false)
  const [newCountry, setNewCountry] = useState({ code: '', name: '' })
  const [newIndustry, setNewIndustry] = useState({ id: '', name: '', category: '' })
  
  // Clear data confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  const [clearing, setClearing] = useState(false)

  // Welcome dialog setting
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(true)

  // Default focus setting
  const [defaultFocus, setDefaultFocus] = useState(DEFAULT_FOCUS)

  // Sidebar default setting
  const [sidebarDefaultCollapsed, setSidebarDefaultCollapsed] = useState(false)

  useEffect(() => {
    loadSettings()
    loadAppVersion()
    loadDbPath()
    loadStats()
    loadCountries()
    loadIndustries()
    loadWelcomeDialogSetting()
    loadDefaultFocusSetting()
    loadSidebarSetting()
  }, [])

  const loadWelcomeDialogSetting = () => {
    const setting = localStorage.getItem('showWelcomeDialog')
    setShowWelcomeDialog(setting !== 'false')
  }

  const toggleWelcomeDialog = (enabled: boolean) => {
    setShowWelcomeDialog(enabled)
    if (enabled) {
      localStorage.removeItem('showWelcomeDialog')
    } else {
      localStorage.setItem('showWelcomeDialog', 'false')
    }
  }

  const loadDefaultFocusSetting = () => {
    const setting = localStorage.getItem('defaultFocus')
    if (setting && FOCUSES.some(f => f.id === setting)) {
      setDefaultFocus(setting)
    }
  }

  const changeDefaultFocus = (focusId: string) => {
    setDefaultFocus(focusId)
    localStorage.setItem('defaultFocus', focusId)
  }

  const loadSidebarSetting = () => {
    const setting = localStorage.getItem('sidebarDefaultCollapsed')
    setSidebarDefaultCollapsed(setting === 'true')
  }

  const toggleSidebarDefault = (collapsed: boolean) => {
    setSidebarDefaultCollapsed(collapsed)
    localStorage.setItem('sidebarDefaultCollapsed', String(collapsed))
  }

  const loadSettings = async () => {
    try {
      // Check if user has saved a custom URL
      const result = await window.electron.dbQuery<{ value: string }>(
        "SELECT value FROM settings WHERE key = 'backend_url'"
      )
      if (result.length > 0 && result[0].value) {
        // User has saved a custom URL - use it
        setBackendUrl(result[0].value)
        api.setBaseUrl(result[0].value)
      } else {
        // No saved URL - use the current API URL (initialized from Electron/config)
        setBackendUrl(api.getBaseUrl())
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const loadAppVersion = async () => {
    try {
      const version = await window.electron.getVersion()
      setAppVersion(version)
    } catch (error) {
      console.error('Failed to get app version:', error)
    }
  }

  const loadDbPath = async () => {
    try {
      const userDataPath = await window.electron.getPath('userData')
      setDbPath(`${userDataPath}/document-lens.db`)
    } catch (error) {
      console.error('Failed to get db path:', error)
    }
  }

  const loadStats = async () => {
    try {
      const [projectsResult, documentsResult, analysesResult] = await Promise.all([
        window.electron.dbQuery<{ count: number }>('SELECT COUNT(*) as count FROM projects'),
        window.electron.dbQuery<{ count: number }>('SELECT COUNT(*) as count FROM documents'),
        window.electron.dbQuery<{ count: number }>('SELECT COUNT(*) as count FROM analysis_results'),
      ])
      setStats({
        projects: projectsResult[0]?.count || 0,
        documents: documentsResult[0]?.count || 0,
        analyses: analysesResult[0]?.count || 0,
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const loadCountries = async () => {
    try {
      const result = await window.electron.dbQuery<Country>(
        'SELECT * FROM countries ORDER BY name'
      )
      setCountries(result)
    } catch (error) {
      console.error('Failed to load countries:', error)
    }
  }

  const loadIndustries = async () => {
    try {
      const result = await window.electron.dbQuery<Industry>(
        'SELECT * FROM industries ORDER BY category, name'
      )
      setIndustries(result)
    } catch (error) {
      console.error('Failed to load industries:', error)
    }
  }

  const saveBackendUrl = async () => {
    if (!backendUrl.trim()) {
      toast.error('Enter a backend URL before saving')
      return
    }
    try {
      await window.electron.dbRun(
        "UPDATE settings SET value = ? WHERE key = 'backend_url'",
        [backendUrl]
      )
      api.setBaseUrl(backendUrl)
      toast.success('Backend URL saved', backendUrl)
    } catch (error) {
      console.error('Failed to save backend URL:', error)
      toast.error('Couldn’t save backend URL', error instanceof Error ? error.message : String(error))
    }
  }

  const testConnection = async () => {
    setTestStatus('testing')
    try {
      await api.healthCheck()
      setTestStatus('success')
      setTimeout(() => setTestStatus('idle'), 3000)
    } catch (_error) {
      setTestStatus('error')
      setTimeout(() => setTestStatus('idle'), 3000)
    }
  }

  const addCountry = async () => {
    if (!newCountry.code || !newCountry.name) return
    try {
      await window.electron.dbRun(
        'INSERT OR REPLACE INTO countries (code, name, is_default) VALUES (?, ?, 0)',
        [newCountry.code.toUpperCase(), newCountry.name]
      )
      setNewCountry({ code: '', name: '' })
      loadCountries()
    } catch (error) {
      console.error('Failed to add country:', error)
    }
  }

  const deleteCountry = async (code: string) => {
    try {
      await window.electron.dbRun('DELETE FROM countries WHERE code = ?', [code])
      loadCountries()
    } catch (error) {
      console.error('Failed to delete country:', error)
    }
  }

  const addIndustry = async () => {
    if (!newIndustry.id || !newIndustry.name) return
    try {
      await window.electron.dbRun(
        'INSERT OR REPLACE INTO industries (id, name, category, is_default) VALUES (?, ?, ?, 0)',
        [newIndustry.id.toLowerCase().replace(/\s+/g, '_'), newIndustry.name, newIndustry.category || null]
      )
      setNewIndustry({ id: '', name: '', category: '' })
      loadIndustries()
    } catch (error) {
      console.error('Failed to add industry:', error)
    }
  }

  const deleteIndustry = async (id: string) => {
    try {
      await window.electron.dbRun('DELETE FROM industries WHERE id = ?', [id])
      loadIndustries()
    } catch (error) {
      console.error('Failed to delete industry:', error)
    }
  }

  const clearAllData = async () => {
    if (clearConfirmText !== 'DELETE') return
    
    setClearing(true)
    try {
      // Delete all data in order (respecting foreign keys)
      await window.electron.dbRun('DELETE FROM analysis_results')
      await window.electron.dbRun('DELETE FROM keyword_results')
      await window.electron.dbRun('DELETE FROM ngram_results')
      await window.electron.dbRun('DELETE FROM documents')
      await window.electron.dbRun('DELETE FROM projects')
      
      // Reset stats
      loadStats()
      setShowClearConfirm(false)
      setClearConfirmText('')
    } catch (error) {
      console.error('Failed to clear data:', error)
      alert('Failed to clear data. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  const resetToDefaults = async (type: 'countries' | 'industries') => {
    try {
      if (type === 'countries') {
        // Delete non-default countries
        await window.electron.dbRun('DELETE FROM countries WHERE is_default = 0')
        loadCountries()
      } else {
        // Delete non-default industries
        await window.electron.dbRun('DELETE FROM industries WHERE is_default = 0')
        loadIndustries()
      }
    } catch (error) {
      console.error(`Failed to reset ${type}:`, error)
    }
  }

  return (
    <div className="p-10 max-w-3xl mx-auto">
      <header className="mb-8">
        <div className="label-masthead mb-3">The Reading Room · Configuration</div>
        <div className="flex items-end justify-between border-b-2 border-foreground pb-4">
          <h1 className="font-display text-5xl font-medium leading-none tracking-tight">
            Settings
          </h1>
          <SettingsIcon className="h-5 w-5 text-muted-foreground mb-2" />
        </div>
      </header>

      {/* General Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>
            Application behavior and preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox
              id="showWelcomeDialog"
              checked={showWelcomeDialog}
              onCheckedChange={(checked) => toggleWelcomeDialog(checked === true)}
            />
            <div className="space-y-0.5">
              <label htmlFor="showWelcomeDialog" className="text-sm font-medium cursor-pointer">
                Show Welcome Dialog
              </label>
              <p className="text-xs text-muted-foreground">
                Display the welcome dialog when the app starts
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">Default Research Focus</label>
            </div>
            <Select value={defaultFocus} onValueChange={changeDefaultFocus}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select default focus" />
              </SelectTrigger>
              <SelectContent>
                {FOCUSES.map((focus) => (
                  <SelectItem key={focus.id} value={focus.id}>
                    {focus.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The research focus selected by default when creating new projects
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="sidebarDefaultCollapsed"
              checked={sidebarDefaultCollapsed}
              onCheckedChange={(checked) => toggleSidebarDefault(checked === true)}
            />
            <div className="space-y-0.5">
              <label htmlFor="sidebarDefaultCollapsed" className="text-sm font-medium cursor-pointer">
                Start with Sidebar Collapsed
              </label>
              <p className="text-xs text-muted-foreground">
                Open the app with the sidebar collapsed by default. You can toggle it anytime using the button at the bottom of the sidebar.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backend Configuration */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Backend Configuration
          </CardTitle>
          <CardDescription>
            Configure the connection to the document-analyser API backend
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Backend URL</label>
            <div className="flex gap-2 mt-1">
              <Input
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder={BACKEND_URL}
              />
              <Button onClick={saveBackendUrl} variant="outline">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Default: {BACKEND_URL}
            </p>
          </div>
          <div>
            <Button
              onClick={testConnection}
              disabled={testStatus === 'testing'}
              variant={
                testStatus === 'success'
                  ? 'default'
                  : testStatus === 'error'
                  ? 'destructive'
                  : 'outline'
              }
            >
              {testStatus === 'testing' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : testStatus === 'success' ? (
                <Check className="h-4 w-4 mr-2" />
              ) : testStatus === 'error' ? (
                <X className="h-4 w-4 mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {testStatus === 'testing'
                ? 'Testing...'
                : testStatus === 'success'
                ? 'Connected!'
                : testStatus === 'error'
                ? 'Connection Failed'
                : 'Test Connection'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Country List */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Country List
              </CardTitle>
              <CardDescription>
                {countries.length} countries available for document metadata
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingCountries(!editingCountries)}
            >
              {editingCountries ? 'Done' : 'Edit'}
            </Button>
          </div>
        </CardHeader>
        {editingCountries && (
          <CardContent className="space-y-4">
            {/* Add new country */}
            <div className="flex gap-2">
              <Input
                placeholder="Code (e.g., US)"
                value={newCountry.code}
                onChange={(e) => setNewCountry({ ...newCountry, code: e.target.value })}
                className="w-24"
                maxLength={3}
              />
              <Input
                placeholder="Country name"
                value={newCountry.name}
                onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
                className="flex-1"
              />
              <Button onClick={addCountry} size="icon" disabled={!newCountry.code || !newCountry.name} aria-label="Add country">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Country list */}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {countries.map((country) => (
                <div
                  key={country.code}
                  className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted"
                >
                  <span className="text-sm">
                    <span className="font-mono text-muted-foreground mr-2">{country.code}</span>
                    {country.name}
                  </span>
                  {!country.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => deleteCountry(country.code)}
                      aria-label="Remove country"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => resetToDefaults('countries')}
            >
              Reset to Defaults
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Industry List */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Industry List
              </CardTitle>
              <CardDescription>
                {industries.length} industries available for document metadata
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingIndustries(!editingIndustries)}
            >
              {editingIndustries ? 'Done' : 'Edit'}
            </Button>
          </div>
        </CardHeader>
        {editingIndustries && (
          <CardContent className="space-y-4">
            {/* Add new industry */}
            <div className="flex gap-2">
              <Input
                placeholder="ID (e.g., tech)"
                value={newIndustry.id}
                onChange={(e) => setNewIndustry({ ...newIndustry, id: e.target.value })}
                className="w-32"
              />
              <Input
                placeholder="Industry name"
                value={newIndustry.name}
                onChange={(e) => setNewIndustry({ ...newIndustry, name: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="Category (optional)"
                value={newIndustry.category}
                onChange={(e) => setNewIndustry({ ...newIndustry, category: e.target.value })}
                className="w-32"
              />
              <Button onClick={addIndustry} size="icon" disabled={!newIndustry.id || !newIndustry.name} aria-label="Add industry">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Industry list */}
            <div className="max-h-48 overflow-y-auto space-y-1">
              {industries.map((industry) => (
                <div
                  key={industry.id}
                  className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted"
                >
                  <span className="text-sm">
                    {industry.name}
                    {industry.category && (
                      <span className="text-muted-foreground ml-2">({industry.category})</span>
                    )}
                  </span>
                  {!industry.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => deleteIndustry(industry.id)}
                      aria-label="Remove industry"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => resetToDefaults('industries')}
            >
              Reset to Defaults
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Data Management */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>
            Manage your local database and cached data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Database location */}
          <div>
            <div className="font-medium text-sm mb-1">Database Location</div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                {dbPath || 'Loading...'}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (dbPath) {
                    const folderPath = dbPath.substring(0, dbPath.lastIndexOf('/'))
                    window.electron.openPath(folderPath)
                  }
                }}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stats — editorial figures row */}
          <div className="grid grid-cols-3 gap-0 border border-border divide-x divide-border bg-background/40">
            {[
              { label: 'Projects', value: stats.projects },
              { label: 'Documents', value: stats.documents },
              { label: 'Analyses', value: stats.analyses },
            ].map((item) => (
              <div key={item.label} className="px-5 py-4">
                <div className="label-masthead">{item.label}</div>
                <div className="font-display text-3xl font-medium tabular mt-1 text-foreground leading-none">
                  {String(item.value).padStart(2, '0')}
                </div>
              </div>
            ))}
          </div>

          {/* Restore default keyword lists */}
          <div>
            <Button
              variant="outline"
              onClick={async () => {
                const restored = await restoreDefaultKeywordLists()
                if (restored > 0) {
                  alert(`Restored ${restored} default keyword list${restored !== 1 ? 's' : ''}.`)
                } else {
                  alert('All default keyword lists are already present.')
                }
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Restore Default Keyword Lists
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Re-creates any missing built-in keyword frameworks without affecting your custom lists.
            </p>
          </div>

          {/* Clear data */}
          <div>
            <Button
              variant="destructive"
              onClick={() => setShowClearConfirm(true)}
              disabled={stats.projects === 0 && stats.documents === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Data
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This will delete all projects, documents, and analysis results. This cannot be undone.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span>{appVersion || '0.1.0'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Backend</span>
            <button
              className="text-primary hover:underline"
              onClick={() => {
                window.electron.openExternal('https://github.com/michaelborck-education/document-analyser')
              }}
            >
              document-analyser
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">License</span>
            <span>MIT</span>
          </div>
        </CardContent>
      </Card>

      {/* Clear Data Confirmation Dialog */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Clear All Data
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete all projects,
              documents, and analysis results from your local database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm">
              To confirm, type <strong>DELETE</strong> below:
            </p>
            <Input
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowClearConfirm(false)
                  setClearConfirmText('')
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={clearConfirmText !== 'DELETE' || clearing}
                onClick={clearAllData}
              >
                {clearing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                {clearing ? 'Clearing...' : 'Clear All Data'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
