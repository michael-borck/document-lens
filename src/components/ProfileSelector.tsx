/**
 * ProfileSelector Component
 *
 * Simple button to access the project's research profile settings.
 * Each project has exactly one profile that persists across sessions.
 */

import { useState, useEffect } from 'react'
import { Settings2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  getActiveProfile,
  type ParsedAnalysisProfile,
} from '@/services/profiles'

interface ProfileSelectorProps {
  projectId: string
  onManageProfiles?: () => void
  onProfileChange?: (profile: ParsedAnalysisProfile | null) => void
}

export function ProfileSelector({
  projectId,
  onManageProfiles,
  onProfileChange,
}: ProfileSelectorProps) {
  const [activeProfile, setActiveProfile] = useState<ParsedAnalysisProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [projectId])

  const loadProfile = async () => {
    try {
      setLoading(true)
      const active = await getActiveProfile(projectId)
      setActiveProfile(active)
      onProfileChange?.(active)
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  // Reload profile when profile editor closes
  const handleManageProfiles = () => {
    onManageProfiles?.()
  }

  const hasProfile = activeProfile !== null
  const profileName = activeProfile?.name || 'No Profile'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleManageProfiles}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Settings2 className="h-4 w-4" />
            )}
            <span className="max-w-[120px] truncate">
              {loading ? 'Loading...' : profileName}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {hasProfile
              ? 'Edit research profile settings (keywords, domains, analysis options)'
              : 'Create a research profile to save your keyword and analysis preferences'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
