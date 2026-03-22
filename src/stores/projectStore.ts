/**
 * Project Store (Zustand)
 *
 * Single source of truth for the active project context:
 * - Current project and its profile
 * - Resolved keyword selection from the profile
 * - Loading states
 *
 * All project-level pages consume this store instead of
 * independently loading profiles and keywords.
 */

import { create } from 'zustand'
import type { Project } from '@/services/projects'
import {
  getOrCreateProjectProfile,
  updateProfile,
  getEnabledKeywords,
  type ParsedAnalysisProfile,
  type ProfileConfig,
} from '@/services/profiles'

interface ProjectState {
  // State
  projectId: string | null
  project: Project | null
  profile: ParsedAnalysisProfile | null
  resolvedKeywords: string[]
  profileLoading: boolean

  // Actions
  loadProject: (projectId: string) => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfileConfig: (config: ProfileConfig) => Promise<void>
  clear: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: null,
  project: null,
  profile: null,
  resolvedKeywords: [],
  profileLoading: false,

  loadProject: async (projectId: string) => {
    // Skip if already loaded for this project
    if (get().projectId === projectId && get().profile) return

    set({ projectId, profileLoading: true })

    try {
      // Load project info
      const projects = await window.electron.dbQuery<Project>(
        'SELECT * FROM projects WHERE id = ?',
        [projectId]
      )
      const project = projects[0] || null

      // Load or create profile
      const profile = await getOrCreateProjectProfile(projectId, project?.name)
      const resolvedKeywords = getEnabledKeywords(profile.config)

      set({ project, profile, resolvedKeywords, profileLoading: false })
    } catch (error) {
      console.error('Failed to load project:', error)
      set({ profileLoading: false })
    }
  },

  refreshProfile: async () => {
    const { projectId } = get()
    if (!projectId) return

    set({ profileLoading: true })
    try {
      const profile = await getOrCreateProjectProfile(projectId)
      const resolvedKeywords = getEnabledKeywords(profile.config)
      set({ profile, resolvedKeywords, profileLoading: false })
    } catch (error) {
      console.error('Failed to refresh profile:', error)
      set({ profileLoading: false })
    }
  },

  updateProfileConfig: async (config: ProfileConfig) => {
    const { profile } = get()
    if (!profile) return

    try {
      await updateProfile(profile.id, { config })
      const resolvedKeywords = getEnabledKeywords(config)
      set({
        profile: { ...profile, config },
        resolvedKeywords,
      })
    } catch (error) {
      console.error('Failed to update profile config:', error)
    }
  },

  clear: () => {
    set({
      projectId: null,
      project: null,
      profile: null,
      resolvedKeywords: [],
      profileLoading: false,
    })
  },
}))
