/**
 * ProjectContextBar Component
 *
 * Renders at the top of every project-level page, providing:
 * 1. Breadcrumb navigation (Projects > Project Name > Current Page)
 * 2. Profile summary strip with edit button
 * 3. Analysis level step indicators
 */

import { Link, useLocation, useParams } from 'react-router-dom'
import { Settings2, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/projectStore'
import { ProfileEditor } from '@/components/ProfileEditor'
import { KeywordPicker } from '@/components/KeywordPicker'

const ANALYSIS_STEPS = [
  { id: 'dashboard', label: 'Documents', path: '' },
  { id: 'search', label: 'Keyword Search', path: '/search' },
  { id: 'ngrams', label: 'N-gram Discovery', path: '/ngrams' },
  { id: 'visualize', label: 'Visualize', path: '/visualize' },
]

function getPageName(pathname: string): string {
  if (pathname.includes('/search')) return 'Keyword Search'
  if (pathname.includes('/ngrams')) return 'N-gram Analysis'
  if (pathname.includes('/visualize')) return 'Visualizations'
  if (pathname.includes('/document/')) return 'Document View'
  return 'Dashboard'
}

function getCurrentStep(pathname: string): string {
  if (pathname.includes('/search')) return 'search'
  if (pathname.includes('/ngrams')) return 'ngrams'
  if (pathname.includes('/visualize')) return 'visualize'
  return 'dashboard'
}

export function ProjectContextBar() {
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const { project, resolvedKeywords, profileLoading } = useProjectStore()
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const [showKeywordPicker, setShowKeywordPicker] = useState(false)

  const pageName = getPageName(location.pathname)
  const currentStep = getCurrentStep(location.pathname)
  const projectName = project?.name || 'Project'

  return (
    <>
      <div className="border-b bg-muted/20 px-6 py-3">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
          <Link to="/" className="hover:text-foreground transition-colors">
            Projects
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to={`/project/${projectId}`} className="hover:text-foreground transition-colors">
            {projectName}
          </Link>
          {pageName !== 'Dashboard' && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">{pageName}</span>
            </>
          )}
        </div>

        {/* Profile strip + Analysis steps */}
        <div className="flex items-center justify-between">
          {/* Analysis step indicators */}
          <div className="flex items-center gap-1">
            {ANALYSIS_STEPS.map((step, i) => {
              const isActive = currentStep === step.id
              const stepPath = `/project/${projectId}${step.path}`
              return (
                <div key={step.id} className="flex items-center">
                  {i > 0 && <div className="w-4 h-px bg-border mx-1" />}
                  <Link
                    to={stepPath}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className={`flex items-center justify-center h-4 w-4 rounded-full text-[10px] ${
                      isActive
                        ? 'bg-primary-foreground/20'
                        : 'bg-muted-foreground/20'
                    }`}>
                      {i + 1}
                    </span>
                    {step.label}
                  </Link>
                </div>
              )
            })}
          </div>

          {/* Keywords + Settings strip */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {profileLoading ? 'Loading...' :
                resolvedKeywords.length > 0
                  ? `${resolvedKeywords.length} keywords`
                  : 'No keywords'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowKeywordPicker(true)}
            >
              Keywords
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowProfileEditor(true)}
            >
              <Settings2 className="h-3 w-3 mr-1" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Profile Editor Dialog */}
      {projectId && (
        <ProfileEditor
          open={showProfileEditor}
          onClose={() => setShowProfileEditor(false)}
          projectId={projectId}
          projectName={projectName}
          onSaved={() => {
            useProjectStore.getState().refreshProfile()
          }}
        />
      )}

      {/* Keyword Picker */}
      <KeywordPicker
        open={showKeywordPicker}
        onClose={() => setShowKeywordPicker(false)}
      />
    </>
  )
}
