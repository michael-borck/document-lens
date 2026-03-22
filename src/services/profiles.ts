/**
 * Analysis Profiles Service
 *
 * Manages analysis profiles (researcher's lens) configurations per project.
 * Profiles persist keyword selections, custom domains, analysis preferences,
 * and comparison settings for efficient switching between different research focuses.
 */

import { v4 as uuidv4 } from 'uuid'

export interface ProfileConfig {
  keywords: Record<string, {
    enabled: boolean
    selected: string[]
  }>
  domains: string[]
  analysis_types: {
    sentiment: boolean
    domain_mapping: boolean
    structural_mismatch: boolean
    readability: boolean
    writing_quality: boolean
  }
  comparison: {
    default_metrics: string[]
    default_chart_types: string[]
  }
  lastSearch?: {
    listId: string
    listName: string
    selectedKeywords: string[]
    quickSearch: string
  }
}

export interface AnalysisProfile {
  id: string
  project_id: string
  name: string
  description: string | null
  config: string  // JSON string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ParsedAnalysisProfile extends Omit<AnalysisProfile, 'config'> {
  config: ProfileConfig
}

/**
 * Create a new analysis profile
 */
export async function createAnalysisProfile(
  projectId: string,
  name: string,
  description: string | null = null,
  config: ProfileConfig
): Promise<string> {
  const profileId = uuidv4()

  try {
    await window.electron.dbRun(
      `INSERT INTO analysis_profiles (id, project_id, name, description, config, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        profileId,
        projectId,
        name,
        description,
        JSON.stringify(config),
        false
      ]
    )

    return profileId
  } catch (error) {
    console.error('Error creating analysis profile:', error)
    throw error
  }
}

/**
 * Get all profiles for a project
 */
export async function getProjectProfiles(
  projectId: string
): Promise<AnalysisProfile[]> {
  try {
    return await window.electron.dbQuery<AnalysisProfile>(
      'SELECT * FROM analysis_profiles WHERE project_id = ? ORDER BY updated_at DESC',
      [projectId]
    )
  } catch (error) {
    console.error('Error getting project profiles:', error)
    throw error
  }
}

/**
 * Get the active profile for a project (if any)
 */
export async function getActiveProfile(
  projectId: string
): Promise<ParsedAnalysisProfile | null> {
  try {
    const profiles = await window.electron.dbQuery<AnalysisProfile>(
      'SELECT * FROM analysis_profiles WHERE project_id = ? AND is_active = TRUE',
      [projectId]
    )

    if (profiles.length === 0) {
      return null
    }

    return parseProfile(profiles[0])
  } catch (error) {
    console.error('Error getting active profile:', error)
    throw error
  }
}

/**
 * Set a profile as active (unsets all other profiles for the project)
 */
export async function setActiveProfile(
  projectId: string,
  profileId: string
): Promise<void> {
  try {
    // Unset all other profiles
    await window.electron.dbRun(
      'UPDATE analysis_profiles SET is_active = FALSE WHERE project_id = ?',
      [projectId]
    )

    // Set the selected profile as active
    await window.electron.dbRun(
      'UPDATE analysis_profiles SET is_active = TRUE WHERE id = ? AND project_id = ?',
      [profileId, projectId]
    )
  } catch (error) {
    console.error('Error setting active profile:', error)
    throw error
  }
}

/**
 * Unset active profile (clear all active profiles for project)
 */
export async function clearActiveProfile(projectId: string): Promise<void> {
  try {
    await window.electron.dbRun(
      'UPDATE analysis_profiles SET is_active = FALSE WHERE project_id = ?',
      [projectId]
    )
  } catch (error) {
    console.error('Error clearing active profile:', error)
    throw error
  }
}

/**
 * Update a profile
 */
export async function updateProfile(
  profileId: string,
  updates: {
    name?: string
    description?: string | null
    config?: ProfileConfig
  }
): Promise<void> {
  try {
    const updateFields: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) {
      updateFields.push('name = ?')
      values.push(updates.name)
    }

    if (updates.description !== undefined) {
      updateFields.push('description = ?')
      values.push(updates.description)
    }

    if (updates.config !== undefined) {
      updateFields.push('config = ?')
      values.push(JSON.stringify(updates.config))
    }

    if (updateFields.length === 0) return

    updateFields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(profileId)

    await window.electron.dbRun(
      `UPDATE analysis_profiles SET ${updateFields.join(', ')} WHERE id = ?`,
      values
    )
  } catch (error) {
    console.error('Error updating profile:', error)
    throw error
  }
}

/**
 * Delete a profile
 */
export async function deleteProfile(profileId: string): Promise<void> {
  try {
    await window.electron.dbRun(
      'DELETE FROM analysis_profiles WHERE id = ?',
      [profileId]
    )
  } catch (error) {
    console.error('Error deleting profile:', error)
    throw error
  }
}

/**
 * Duplicate a profile with a new name
 */
export async function duplicateProfile(
  profileId: string,
  newName: string
): Promise<string> {
  try {
    const profiles = await window.electron.dbQuery<AnalysisProfile>(
      'SELECT * FROM analysis_profiles WHERE id = ?',
      [profileId]
    )

    if (profiles.length === 0) {
      throw new Error('Profile not found')
    }

    const profile = profiles[0]
    const config = JSON.parse(profile.config) as ProfileConfig

    return await createAnalysisProfile(
      profile.project_id,
      newName,
      profile.description,
      config
    )
  } catch (error) {
    console.error('Error duplicating profile:', error)
    throw error
  }
}

/**
 * Parse a profile with JSON config
 */
export function parseProfile(profile: AnalysisProfile): ParsedAnalysisProfile {
  try {
    const config = JSON.parse(profile.config) as ProfileConfig
    return {
      ...profile,
      config
    }
  } catch (error) {
    console.error('Error parsing profile config:', error)
    throw new Error(`Invalid profile configuration: ${error}`)
  }
}

/**
 * Get all enabled keywords from a profile
 */
export function getEnabledKeywords(config: ProfileConfig): string[] {
  const enabled: string[] = []

  for (const [_framework, data] of Object.entries(config.keywords)) {
    if (data.enabled) {
      enabled.push(...data.selected)
    }
  }

  return enabled
}

/**
 * Get all enabled frameworks from a profile
 */
export function getEnabledFrameworks(config: ProfileConfig): string[] {
  return Object.entries(config.keywords)
    .filter(([_, data]) => data.enabled)
    .map(([framework]) => framework)
}

/**
 * Create default profile template
 */
export function createDefaultProfileConfig(): ProfileConfig {
  return {
    keywords: {},
    domains: [],
    analysis_types: {
      sentiment: true,
      domain_mapping: false,
      structural_mismatch: false,
      readability: true,
      writing_quality: true
    },
    comparison: {
      default_metrics: ['sentiment', 'keyword_coverage', 'writing_quality'],
      default_chart_types: ['bar', 'radar']
    }
  }
}

/**
 * Merge two profile configs (useful for creating composite profiles)
 */
export function mergeProfileConfigs(
  baseConfig: ProfileConfig,
  overrideConfig: Partial<ProfileConfig>
): ProfileConfig {
  return {
    keywords: {
      ...baseConfig.keywords,
      ...(overrideConfig.keywords || {})
    },
    domains: overrideConfig.domains || baseConfig.domains,
    analysis_types: {
      ...baseConfig.analysis_types,
      ...(overrideConfig.analysis_types || {})
    },
    comparison: {
      ...baseConfig.comparison,
      ...(overrideConfig.comparison || {})
    }
  }
}

/**
 * Get or create the single profile for a project.
 * Each project has exactly one profile that persists across sessions.
 */
export async function getOrCreateProjectProfile(
  projectId: string,
  projectName?: string
): Promise<ParsedAnalysisProfile> {
  // Check if profile already exists
  const existing = await getActiveProfile(projectId)
  if (existing) {
    return existing
  }

  // Check for any profiles (might not be active)
  const profiles = await getProjectProfiles(projectId)
  if (profiles.length > 0) {
    // Set first one as active and return it
    await setActiveProfile(projectId, profiles[0].id)
    return parseProfile(profiles[0])
  }

  // Create default profile for this project
  const defaultConfig = createDefaultProfileConfig()
  const profileName = projectName ? `${projectName} Profile` : 'Research Profile'

  const profileId = await createAnalysisProfile(
    projectId,
    profileName,
    'Default research profile with keyword and analysis settings',
    defaultConfig
  )

  // Set as active
  await setActiveProfile(projectId, profileId)

  // Return the newly created profile
  const newProfile = await getActiveProfile(projectId)
  if (!newProfile) {
    throw new Error('Failed to create profile')
  }

  return newProfile
}

/**
 * Duplicate a project's profile to a new project
 */
export async function duplicateProjectProfile(
  sourceProjectId: string,
  targetProjectId: string,
  newProfileName: string
): Promise<string | null> {
  const sourceProfile = await getActiveProfile(sourceProjectId)
  if (!sourceProfile) {
    return null
  }

  const newProfileId = await createAnalysisProfile(
    targetProjectId,
    newProfileName,
    sourceProfile.description,
    sourceProfile.config
  )

  // Set as active in new project
  await setActiveProfile(targetProjectId, newProfileId)

  return newProfileId
}
