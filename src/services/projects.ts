import {
  selectAll,
  selectOne,
  runStatement,
  parseJson,
  stringifyJson,
  newId,
  now,
} from './db'
import type {
  Project,
  ProjectWithSetup,
  ProjectFilterState,
} from '@/types/data'

interface ProjectRow {
  id: string
  name: string
  description: string | null
  research_focus: string | null
  scoring_rule_id: string | null
  filter_state: string | null
  created_at: string
  updated_at: string
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    researchFocus: row.research_focus,
    scoringRuleId: row.scoring_rule_id,
    filterState: row.filter_state
      ? parseJson<ProjectFilterState>(row.filter_state, {})
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** List all projects, most recently updated first. */
export async function listProjects(): Promise<Project[]> {
  const rows = await selectAll<ProjectRow>(
    'SELECT * FROM projects ORDER BY updated_at DESC'
  )
  return rows.map(rowToProject)
}

export async function getProject(id: string): Promise<Project | null> {
  const row = await selectOne<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id])
  return row ? rowToProject(row) : null
}

/**
 * Get a project plus its activated documents / keyword lists / lenses.
 * Returns null if the project doesn't exist.
 */
export async function getProjectWithSetup(id: string): Promise<ProjectWithSetup | null> {
  const project = await getProject(id)
  if (!project) return null

  const [documentRows, listRows, lensRows] = await Promise.all([
    selectAll<{ document_id: string }>(
      'SELECT document_id FROM project_documents WHERE project_id = ?',
      [id]
    ),
    selectAll<{ list_id: string }>(
      'SELECT list_id FROM project_keyword_lists WHERE project_id = ?',
      [id]
    ),
    selectAll<{ lens_id: string }>(
      'SELECT lens_id FROM project_lenses WHERE project_id = ?',
      [id]
    ),
  ])

  return {
    ...project,
    documentIds: documentRows.map((r) => r.document_id),
    keywordListIds: listRows.map((r) => r.list_id),
    lensIds: lensRows.map((r) => r.lens_id),
  }
}

export interface CreateProjectInput {
  name: string
  description?: string
  researchFocus?: string
  scoringRuleId?: string
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const id = newId()
  const timestamp = now()
  await runStatement(
    `INSERT INTO projects
       (id, name, description, research_focus, scoring_rule_id, filter_state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.description ?? null,
      input.researchFocus ?? null,
      input.scoringRuleId ?? null,
      null,
      timestamp,
      timestamp,
    ]
  )
  const created = await getProject(id)
  if (!created) {
    throw new Error(`Failed to create project ${input.name}`)
  }
  return created
}

export interface UpdateProjectInput {
  name?: string
  description?: string | null
  researchFocus?: string | null
  scoringRuleId?: string | null
  filterState?: ProjectFilterState | null
}

export async function updateProject(id: string, patch: UpdateProjectInput): Promise<void> {
  const fields: string[] = []
  const params: unknown[] = []

  if (patch.name !== undefined) {
    fields.push('name = ?')
    params.push(patch.name)
  }
  if (patch.description !== undefined) {
    fields.push('description = ?')
    params.push(patch.description)
  }
  if (patch.researchFocus !== undefined) {
    fields.push('research_focus = ?')
    params.push(patch.researchFocus)
  }
  if (patch.scoringRuleId !== undefined) {
    fields.push('scoring_rule_id = ?')
    params.push(patch.scoringRuleId)
  }
  if (patch.filterState !== undefined) {
    fields.push('filter_state = ?')
    params.push(patch.filterState === null ? null : stringifyJson(patch.filterState))
  }
  if (fields.length === 0) return

  fields.push('updated_at = ?')
  params.push(now())
  params.push(id)

  await runStatement(
    `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`,
    params
  )
}

export async function deleteProject(id: string): Promise<void> {
  await runStatement('DELETE FROM projects WHERE id = ?', [id])
}

/**
 * Clone a project's setup (documents, keyword lists, lenses, scoring
 * rule) into a new project (US-X-09). The new project has its own id,
 * its own analysis cache (empty), and a new name; everything else
 * mirrors the source.
 */
export async function cloneProject(sourceId: string, newName: string): Promise<Project> {
  const source = await getProjectWithSetup(sourceId)
  if (!source) {
    throw new Error(`Source project ${sourceId} not found`)
  }

  const cloned = await createProject({
    name: newName,
    description: source.description ?? undefined,
    researchFocus: source.researchFocus ?? undefined,
    scoringRuleId: source.scoringRuleId ?? undefined,
  })

  // Replicate document / keyword-list / lens activations.
  const timestamp = now()
  for (const docId of source.documentIds) {
    await runStatement(
      'INSERT INTO project_documents (project_id, document_id, added_at) VALUES (?, ?, ?)',
      [cloned.id, docId, timestamp]
    )
  }
  for (const listId of source.keywordListIds) {
    await runStatement(
      'INSERT INTO project_keyword_lists (project_id, list_id) VALUES (?, ?)',
      [cloned.id, listId]
    )
  }
  for (const lensId of source.lensIds) {
    await runStatement(
      'INSERT INTO project_lenses (project_id, lens_id) VALUES (?, ?)',
      [cloned.id, lensId]
    )
  }

  return cloned
}

// ---------------------------------------------------------------------------
// Relationship management
// ---------------------------------------------------------------------------

export async function addDocumentsToProject(
  projectId: string,
  documentIds: string[]
): Promise<void> {
  const timestamp = now()
  for (const docId of documentIds) {
    await runStatement(
      `INSERT OR IGNORE INTO project_documents (project_id, document_id, added_at)
       VALUES (?, ?, ?)`,
      [projectId, docId, timestamp]
    )
  }
  await touchProject(projectId)
}

export async function removeDocumentFromProject(
  projectId: string,
  documentId: string
): Promise<void> {
  await runStatement(
    'DELETE FROM project_documents WHERE project_id = ? AND document_id = ?',
    [projectId, documentId]
  )
  await touchProject(projectId)
}

export async function setProjectKeywordList(
  projectId: string,
  listId: string
): Promise<void> {
  // For now we model "one keyword list per project" via clear + insert.
  // The schema allows many; relax this helper when multi-list workflows arrive.
  await runStatement('DELETE FROM project_keyword_lists WHERE project_id = ?', [projectId])
  await runStatement(
    'INSERT INTO project_keyword_lists (project_id, list_id) VALUES (?, ?)',
    [projectId, listId]
  )
  await touchProject(projectId)
}

export async function setProjectLenses(
  projectId: string,
  lensIds: string[]
): Promise<void> {
  await runStatement('DELETE FROM project_lenses WHERE project_id = ?', [projectId])
  for (const lensId of lensIds) {
    await runStatement(
      'INSERT INTO project_lenses (project_id, lens_id) VALUES (?, ?)',
      [projectId, lensId]
    )
  }
  await touchProject(projectId)
}

async function touchProject(projectId: string): Promise<void> {
  await runStatement('UPDATE projects SET updated_at = ? WHERE id = ?', [now(), projectId])
}
