/**
 * Projects Service
 *
 * Handles project operations including creation, duplication, and management.
 */

import { v4 as uuidv4 } from 'uuid'
import { duplicateProjectProfile } from './profiles'

export interface Project {
  id: string
  name: string
  description: string | null
  focus: string
  created_at: string
  updated_at: string
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const results = await window.electron.dbQuery<Project>(
    'SELECT * FROM projects WHERE id = ?',
    [projectId]
  )
  return results.length > 0 ? results[0] : null
}

/**
 * Duplicate a project including its documents and profile.
 * Creates a new project with the same documents (via junction table) and a copy of the profile.
 * Analysis results are NOT copied - the new project starts fresh for analysis.
 *
 * @param projectId - The source project to duplicate
 * @param newName - Name for the new project
 * @param newDescription - Optional description for the new project
 * @returns The new project ID
 */
export async function duplicateProject(
  projectId: string,
  newName: string,
  newDescription?: string
): Promise<string> {
  // Get the source project
  const sourceProject = await getProject(projectId)
  if (!sourceProject) {
    throw new Error('Source project not found')
  }

  // Create new project
  const newProjectId = uuidv4()
  await window.electron.dbRun(
    'INSERT INTO projects (id, name, description, focus) VALUES (?, ?, ?, ?)',
    [
      newProjectId,
      newName,
      newDescription ?? sourceProject.description,
      sourceProject.focus,
    ]
  )

  // Copy document associations (not the documents themselves - they're shared via library)
  await window.electron.dbRun(
    `INSERT INTO project_documents (project_id, document_id)
     SELECT ?, document_id FROM project_documents WHERE project_id = ?`,
    [newProjectId, projectId]
  )

  // Copy the profile
  await duplicateProjectProfile(
    projectId,
    newProjectId,
    `${newName} Profile`
  )

  return newProjectId
}